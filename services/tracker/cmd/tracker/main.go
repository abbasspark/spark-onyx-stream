// SPDX-License-Identifier: AGPL-3.0-only

// The tracker of Spark Onyx Stream.
//
// Players that watch the same video or channel find each other through it:
// each connects with a token of the main server, says what it watches, and
// gets its offers for direct connections passed on to others who watch the
// same. The video itself never comes through here.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/abbasspark/spark-onyx-stream/services/tracker/internal/config"
	"github.com/abbasspark/spark-onyx-stream/services/tracker/internal/hub"
	"github.com/abbasspark/spark-onyx-stream/services/tracker/internal/server"
)

// Version is set when the program is built. It follows the version of the platform.
var Version = "0.1.0"

const usage = `onyx-tracker lets the players of a Spark Onyx Stream installation find each other.

It is set up with environment variables:

  ONYX_TRACKER_SECRET            the value of P2P_TRACKER_SECRET of the main server
  ONYX_TRACKER_LISTEN            address players connect to (default :8070)
  ONYX_TRACKER_ALLOWED_ORIGINS   websites whose pages may connect, such as
                                 stream.example.com (default: any page with a token)
  ONYX_TRACKER_MAX_CONNECTIONS   players at a time (default 50000)
  ONYX_TRACKER_MAX_PER_ADDRESS   players from one address (default 200)
  ONYX_TRACKER_TRUST_PROXY       true behind a proxy that sets X-Forwarded-For

Run "onyx-tracker version" for the version.`

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
	if err := run(slog.New(slog.NewTextHandler(os.Stderr, nil))); err != nil {
		// Printed as it is: the message can have several lines.
		fmt.Fprintln(os.Stderr, "onyx-tracker: "+err.Error())
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	settings, err := config.Load(os.LookupEnv)
	if err != nil {
		return fmt.Errorf("the settings are not complete:\n%w\n\n%s", err, usage)
	}

	handler := server.New(settings, hub.New(hub.DefaultLimits()), log, Version)
	httpServer := &http.Server{
		Addr:              settings.Listen,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		MaxHeaderBytes:    16 << 10,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelWarn),
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	failed := make(chan error, 1)
	go func() {
		log.Info("tracker listening", "version", Version, "address", settings.Listen,
			"allowed_origins", settings.AllowedOrigins, "max_connections", settings.MaxConnections)
		failed <- httpServer.ListenAndServe()
	}()

	select {
	case err := <-failed:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		// Players reconnect by themselves, to this tracker once it is back.
		log.Info("stopping")
		closing, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(closing)
		_ = httpServer.Close()
	}
	return nil
}
