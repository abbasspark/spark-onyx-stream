// SPDX-License-Identifier: AGPL-3.0-only

// The edge agent of Spark Onyx Stream.
//
// It runs on a server close to viewers and delivers video in place of the
// main server: it checks the token in every address, sends a kept copy of the
// file, or fetches the file from the main server first. It connects to the
// main server and never the other way round, so the only open port is the one
// for viewers.
package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/abbasspark/spark-onyx-stream/services/edge-agent/internal/cache"
	"github.com/abbasspark/spark-onyx-stream/services/edge-agent/internal/config"
	"github.com/abbasspark/spark-onyx-stream/services/edge-agent/internal/origin"
	"github.com/abbasspark/spark-onyx-stream/services/edge-agent/internal/server"
	"github.com/abbasspark/spark-onyx-stream/services/edge-agent/internal/stats"
	"github.com/abbasspark/spark-onyx-stream/services/edge-agent/internal/sysinfo"
)

// Version is set when the program is built. It follows the version of the platform.
var Version = "0.1.0"

// protocol is the version of the conversation with the main server.
const protocol = 1

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "version", "-version", "--version":
			fmt.Println(Version)
			return
		default:
			fmt.Fprintln(os.Stderr, usage)
			os.Exit(2)
		}
	}

	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(log); err != nil {
		// Printed as it is: the message can have several lines.
		fmt.Fprintln(os.Stderr, "onyx-edge-agent: "+err.Error())
		os.Exit(1)
	}
}

const usage = `onyx-edge-agent delivers video for a Spark Onyx Stream installation.

It is set up with environment variables:

  ONYX_ORIGIN_URL        address of the main server, such as https://stream.example.com
  ONYX_EDGE_TOKEN        token shown when the edge was added in the admin panel
  ONYX_EDGE_TOKEN_FILE   a file holding the token, instead of ONYX_EDGE_TOKEN
  ONYX_EDGE_LISTEN       address to serve viewers on (default :8080)
  ONYX_EDGE_CACHE_DIR    folder for the copies (default ./cache)
  ONYX_EDGE_CACHE_SIZE   how much may be kept, such as 50GB (default 20GB)
  ONYX_EDGE_TLS_CERT     certificate file, to serve HTTPS itself
  ONYX_EDGE_TLS_KEY      key file of the certificate

Run "onyx-edge-agent version" for the version.`

func run(log *slog.Logger) error {
	settings, err := config.Load(os.LookupEnv)
	if err != nil {
		return fmt.Errorf("the settings are not complete:\n%w\n\n%s", err, usage)
	}

	files, err := cache.Open(settings.CacheDir, settings.CacheBytes)
	if err != nil {
		return fmt.Errorf("the cache folder %s cannot be used: %w", settings.CacheDir, err)
	}
	kept, count, limit := files.Usage()
	log.Info("edge agent starting", "version", Version, "origin", settings.OriginURL,
		"cache", files.Dir(), "kept_bytes", kept, "kept_files", count, "cache_limit_bytes", limit)

	counters := &stats.Counters{}
	mainServer := origin.New(settings.OriginURL, settings.Token)
	handler := server.New(files, mainServer, counters, log)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go heartbeats(ctx, log, mainServer, handler, files, counters)
	go tidy(ctx, handler)

	httpServer := &http.Server{
		Addr:              settings.Listen,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		// No write timeout: a viewer on a slow line takes as long as it takes.
		IdleTimeout:    120 * time.Second,
		MaxHeaderBytes: 16 << 10,
		ErrorLog:       slog.NewLogLogger(log.Handler(), slog.LevelWarn),
	}

	failed := make(chan error, 1)
	go func() {
		if settings.TLSCert != "" {
			certificates := &reloadingCertificate{certFile: settings.TLSCert, keyFile: settings.TLSKey}
			if _, err := certificates.get(nil); err != nil {
				failed <- fmt.Errorf("the certificate cannot be used: %w", err)
				return
			}
			httpServer.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12, GetCertificate: certificates.get}
			log.Info("serving viewers over HTTPS", "address", settings.Listen)
			failed <- httpServer.ListenAndServeTLS("", "")
			return
		}
		log.Info("serving viewers over HTTP. Put a TLS proxy in front, or set a certificate", "address", settings.Listen)
		failed <- httpServer.ListenAndServe()
	}()

	select {
	case err := <-failed:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Info("stopping, letting running requests finish")
		closing, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(closing)
	}
	return nil
}

// report is a heartbeat, in the form the main server expects.
type report struct {
	Protocol       int            `json:"protocol"`
	Version        string         `json:"version"`
	Hostname       string         `json:"hostname"`
	StartedAt      string         `json:"startedAt"`
	Counters       stats.Snapshot `json:"counters"`
	ActiveRequests int64          `json:"activeRequests"`
	Cache          cacheReport    `json:"cache"`
	System         sysinfo.System `json:"system"`
	// Commands of the main server that were carried out.
	Acknowledged []string `json:"acknowledged"`
}

type cacheReport struct {
	Bytes      int64 `json:"bytes"`
	Files      int   `json:"files"`
	LimitBytes int64 `json:"limitBytes"`
}

// heartbeats reports to the main server for as long as the agent runs, and
// takes the key for checking tokens from the answers.
func heartbeats(ctx context.Context, log *slog.Logger, mainServer *origin.Client, handler *server.Server, files *cache.Cache, counters *stats.Counters) {
	hostname, _ := os.Hostname()
	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	interval := 10 * time.Second
	connected := false
	lastProblem := ""
	done := []string{}

	for {
		bytes, count, limit := files.Usage()
		answer, err := mainServer.Heartbeat(ctx, report{
			Protocol:       protocol,
			Version:        Version,
			Hostname:       hostname,
			StartedAt:      startedAt,
			Counters:       counters.Snapshot(),
			ActiveRequests: counters.Active.Load(),
			Cache:          cacheReport{Bytes: bytes, Files: count, LimitBytes: limit},
			System:         sysinfo.Read(files.Dir()),
			Acknowledged:   done,
		})

		wait := interval
		switch {
		case err == nil:
			handler.SetSigningKey(answer.SigningKey)
			// What was reported as done has arrived. What is asked now is done
			// here and reported with the next heartbeat.
			done = carryOut(log, handler, answer.Commands)
			if answer.HeartbeatSeconds >= 2 && answer.HeartbeatSeconds <= 300 {
				interval = time.Duration(answer.HeartbeatSeconds) * time.Second
				wait = interval
			}
			if !connected {
				log.Info("connected to the main server", "edge", answer.Edge.Name, "taking_viewers", answer.Edge.Enabled)
			}
			connected, lastProblem = true, ""
		case errors.Is(err, origin.ErrRefused), errors.Is(err, origin.ErrTooOld):
			// The edge was removed, its token replaced, or this agent is too
			// old: stop serving, so nothing is delivered that should not be.
			handler.SetSigningKey("")
			connected = false
			if lastProblem != err.Error() {
				log.Error("not serving viewers: " + err.Error())
			}
			lastProblem = err.Error()
			wait = 30 * time.Second
		case ctx.Err() != nil:
			return
		default:
			// The main server cannot be reached. Viewers with an address keep
			// watching what is here, and the next heartbeat tries again.
			if lastProblem != err.Error() {
				log.Warn("the main server cannot be reached, still serving: " + err.Error())
			}
			connected, lastProblem = false, err.Error()
			if !handler.Ready() {
				wait = 3 * time.Second
			}
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}

func tidy(ctx context.Context, handler *server.Server) {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			handler.Tidy()
		}
	}
}

// reloadingCertificate reads the certificate again when its file changed, so a
// renewed certificate is used without a restart.
type reloadingCertificate struct {
	certFile, keyFile string

	mu       sync.Mutex
	loaded   *tls.Certificate
	modified time.Time
	checked  time.Time
}

func (r *reloadingCertificate) get(*tls.ClientHelloInfo) (*tls.Certificate, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.loaded != nil && time.Since(r.checked) < time.Minute {
		return r.loaded, nil
	}
	r.checked = time.Now()
	info, err := os.Stat(r.certFile)
	if err != nil {
		return r.keepOr(err)
	}
	if r.loaded != nil && !info.ModTime().After(r.modified) {
		return r.loaded, nil
	}
	certificate, err := tls.LoadX509KeyPair(r.certFile, r.keyFile)
	if err != nil {
		return r.keepOr(err)
	}
	r.loaded, r.modified = &certificate, info.ModTime()
	return r.loaded, nil
}

// keepOr goes on with the certificate in use when a newer one cannot be read.
func (r *reloadingCertificate) keepOr(err error) (*tls.Certificate, error) {
	if r.loaded != nil {
		return r.loaded, nil
	}
	return nil, err
}

// carryOut does what the main server asks and returns the ids of what was
// handled. A command this agent does not know is reported as handled too, so
// it is not sent for ever.
func carryOut(log *slog.Logger, handler *server.Server, commands []origin.Command) []string {
	done := []string{}
	for _, command := range commands {
		switch command.Type {
		case "purge":
			if removed, ok := handler.Purge(command.Scope); ok {
				log.Info("dropped copies as the main server asked", "scope", command.Scope, "files", removed)
			} else {
				log.Warn("asked to drop copies of a kind this agent does not know", "scope", command.Scope)
			}
		default:
			log.Warn("the main server asks for something this agent does not know", "command", command.Type)
		}
		done = append(done, command.ID)
	}
	return done
}
