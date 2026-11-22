// SPDX-License-Identifier: AGPL-3.0-only

// Package server holds the connections of the players and lets them talk to the hub.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"

	"github.com/abbasspark/spark-onyx-stream/services/tracker/internal/config"
	"github.com/abbasspark/spark-onyx-stream/services/tracker/internal/hub"
	"github.com/abbasspark/spark-onyx-stream/services/tracker/internal/token"
)

const (
	// What a token is signed for: connecting, and reading the figures.
	SubjectConnect = "tracker"
	SubjectStats   = "tracker-stats"

	// An announce carries up to ten offers of a few kilobytes each.
	maxMessageBytes = 256 << 10
	// Messages waiting to be written to one player. A player that falls this far behind is dropped.
	sendQueue    = 64
	writeTimeout = 10 * time.Second
	pingEvery    = 30 * time.Second

	// A player may send this many messages at once, and this many a second for good.
	burst         = 30
	refillSeconds = 0.5
	// Messages that make no sense before the connection is closed.
	maxBadMessages = 5
)

// Server is the HTTP handler of the tracker.
type Server struct {
	config  config.Config
	hub     *hub.Hub
	log     *slog.Logger
	version string
	now     func() time.Time

	connections atomic.Int64
	refused     atomic.Int64

	mu         sync.Mutex
	perAddress map[string]int
}

// New makes the handler.
func New(settings config.Config, h *hub.Hub, log *slog.Logger, version string) *Server {
	return &Server{config: settings, hub: h, log: log, version: version, now: time.Now, perAddress: map[string]int{}}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/healthz":
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}` + "\n"))
	case r.URL.Path == "/stats":
		s.stats(w, r)
	case strings.EqualFold(r.Header.Get("Upgrade"), "websocket"):
		s.connect(w, r)
	default:
		http.NotFound(w, r)
	}
}

// Stats is what the main server reads for the admin panel.
type Stats struct {
	Version     string `json:"version"`
	Connections int64  `json:"connections"`
	// Connections turned away: no token, too many, wrong website.
	RefusedConnections int64 `json:"refusedConnections"`
	hub.Stats
}

func (s *Server) stats(w http.ResponseWriter, r *http.Request) {
	given := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !token.Valid(SubjectStats, given, s.config.Secret, s.now()) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(Stats{
		Version:            s.version,
		Connections:        s.connections.Load(),
		RefusedConnections: s.refused.Load(),
		Stats:              s.hub.Stats(),
	})
}

// connect lets a player in: one with a token of the main server, from an
// allowed website, while there is room.
func (s *Server) connect(w http.ResponseWriter, r *http.Request) {
	if !token.Valid(SubjectConnect, r.URL.Query().Get("token"), s.config.Secret, s.now()) {
		s.refused.Add(1)
		http.Error(w, "A token of the platform is needed", http.StatusUnauthorized)
		return
	}
	address := s.addressOf(r)
	if !s.enter(address) {
		s.refused.Add(1)
		w.Header().Set("Retry-After", "30")
		http.Error(w, "Too many connections", http.StatusServiceUnavailable)
		return
	}
	defer s.leave(address)

	connection, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: s.config.AllowedOrigins,
		// Without a list of websites the token alone decides.
		InsecureSkipVerify: len(s.config.AllowedOrigins) == 0,
		// Offers are text that packs well, but packing costs memory per connection.
		CompressionMode: websocket.CompressionDisabled,
	})
	if err != nil {
		// Accept has answered: usually a page of a website that is not allowed.
		s.refused.Add(1)
		return
	}
	connection.SetReadLimit(maxMessageBytes)
	s.serve(r.Context(), connection)
}

func (s *Server) serve(ctx context.Context, connection *websocket.Conn) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	outgoing := make(chan []byte, sendQueue)
	peer := hub.NewPeer(func(message []byte) bool {
		select {
		case outgoing <- message:
			return true
		default:
			// The player does not keep up. Dropping it frees the others.
			cancel()
			return false
		}
	})
	defer s.hub.Remove(peer)

	// One writer per connection: the hub hands messages over from many others.
	go func() {
		ping := time.NewTicker(pingEvery)
		defer ping.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case message := <-outgoing:
				writing, done := context.WithTimeout(ctx, writeTimeout)
				err := connection.Write(writing, websocket.MessageText, message)
				done()
				if err != nil {
					cancel()
					return
				}
			case <-ping.C:
				// Finds players that went away without closing.
				pinging, done := context.WithTimeout(ctx, writeTimeout)
				err := connection.Ping(pinging)
				done()
				if err != nil {
					cancel()
					return
				}
			}
		}
	}()

	allowance := float64(burst)
	last := s.now()
	bad := 0
	for {
		kind, message, err := connection.Read(ctx)
		if err != nil {
			status := websocket.StatusNormalClosure
			if errors.Is(err, context.Canceled) {
				status = websocket.StatusPolicyViolation
			}
			_ = connection.Close(status, "")
			return
		}

		// A bucket that fills at a steady rate: bursts pass, floods do not.
		now := s.now()
		allowance = min(burst, allowance+now.Sub(last).Seconds()/refillSeconds)
		last = now
		if allowance < 1 {
			_ = connection.Close(websocket.StatusPolicyViolation, "too many messages")
			return
		}
		allowance--

		if kind != websocket.MessageText || !s.hub.Handle(peer, message) {
			bad++
			if bad >= maxBadMessages {
				_ = connection.Close(websocket.StatusPolicyViolation, "messages that make no sense")
				return
			}
		}
	}
}

// enter counts a connection in, unless the tracker or its address is full.
func (s *Server) enter(address string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if int(s.connections.Load()) >= s.config.MaxConnections || s.perAddress[address] >= s.config.MaxPerAddress {
		return false
	}
	s.perAddress[address]++
	s.connections.Add(1)
	return true
}

func (s *Server) leave(address string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.connections.Add(-1)
	if s.perAddress[address] <= 1 {
		delete(s.perAddress, address)
	} else {
		s.perAddress[address]--
	}
}

// addressOf is where a player connects from. Behind the gateway that is what
// the gateway says, and its last word is the one it added itself.
func (s *Server) addressOf(r *http.Request) string {
	if s.config.TrustProxy {
		forwarded := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
		if last := strings.TrimSpace(forwarded[len(forwarded)-1]); last != "" {
			return last
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
