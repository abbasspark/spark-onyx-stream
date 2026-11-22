// SPDX-License-Identifier: AGPL-3.0-only
package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/abbasspark/spark-onyx-stream/services/tracker/internal/config"
	"github.com/abbasspark/spark-onyx-stream/services/tracker/internal/hub"
	"github.com/abbasspark/spark-onyx-stream/services/tracker/internal/token"
)

const (
	secret = "ssssssssssssssssssssssssssssssssssssssss"
	swarm  = "AAAAAAAAAAAAAAAAAAAA"
)

type tracker struct {
	*httptest.Server
	handler *Server
}

func start(t *testing.T, change func(*config.Config)) *tracker {
	t.Helper()
	settings := config.Config{Secret: secret, MaxConnections: 100, MaxPerAddress: 100}
	if change != nil {
		change(&settings)
	}
	handler := New(settings, hub.New(hub.DefaultLimits()), slog.New(slog.NewTextHandler(io.Discard, nil)), "test")
	running := httptest.NewServer(handler)
	t.Cleanup(running.Close)
	return &tracker{Server: running, handler: handler}
}

func (tr *tracker) url(tokenText string) string {
	return "ws" + strings.TrimPrefix(tr.URL, "http") + "/?token=" + tokenText
}

func good() string { return token.Sign(SubjectConnect, time.Now().Add(time.Hour), secret) }

// player is a connected viewer in a test.
type player struct {
	t          *testing.T
	connection *websocket.Conn
	id         string
}

func (tr *tracker) join(t *testing.T, name string) *player {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	connection, _, err := websocket.Dial(ctx, tr.url(good()), nil)
	if err != nil {
		t.Fatalf("%s could not connect: %v", name, err)
	}
	t.Cleanup(func() { connection.CloseNow() })
	return &player{t: t, connection: connection, id: (name + strings.Repeat("-", 20))[:20]}
}

func (p *player) send(body map[string]any) {
	p.t.Helper()
	raw, _ := json.Marshal(body)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := p.connection.Write(ctx, websocket.MessageText, raw); err != nil {
		p.t.Fatalf("write: %v", err)
	}
}

func (p *player) announce(more map[string]any) {
	body := map[string]any{"action": "announce", "info_hash": swarm, "peer_id": p.id, "numwant": 5}
	for key, value := range more {
		body[key] = value
	}
	p.send(body)
}

func (p *player) read() map[string]any {
	p.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, raw, err := p.connection.Read(ctx)
	if err != nil {
		p.t.Fatalf("read: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		p.t.Fatal(err)
	}
	return decoded
}

func TestTwoPlayersOfTheSameSwarmExchangeOfferAndAnswer(t *testing.T) {
	tr := start(t, nil)
	anna, ben := tr.join(t, "anna"), tr.join(t, "ben")

	ben.announce(nil)
	if got := ben.read(); got["incomplete"] != float64(1) {
		t.Fatalf("ben got %v", got)
	}
	anna.announce(map[string]any{"offers": []map[string]any{
		{"offer": map[string]any{"type": "offer", "sdp": "annas-sdp"}, "offer_id": "offer-1"},
	}})
	if got := anna.read(); got["incomplete"] != float64(2) {
		t.Fatalf("anna got %v", got)
	}

	offered := ben.read()
	if offered["peer_id"] != anna.id || offered["offer"].(map[string]any)["sdp"] != "annas-sdp" {
		t.Fatalf("ben got %v", offered)
	}
	ben.announce(map[string]any{
		"to_peer_id": anna.id,
		"offer_id":   offered["offer_id"],
		"answer":     map[string]any{"type": "answer", "sdp": "bens-sdp"},
	})
	answered := anna.read()
	if answered["peer_id"] != ben.id || answered["answer"].(map[string]any)["sdp"] != "bens-sdp" {
		t.Fatalf("anna got %v", answered)
	}
}

func TestAPlayerThatDisconnectsLeavesItsSwarms(t *testing.T) {
	tr := start(t, nil)
	anna := tr.join(t, "anna")
	anna.announce(nil)
	anna.read()
	if stats := tr.handler.hub.Stats(); stats.Peers != 1 || tr.handler.connections.Load() != 1 {
		t.Fatalf("before: %+v", stats)
	}

	anna.connection.Close(websocket.StatusNormalClosure, "")
	deadline := time.Now().Add(3 * time.Second)
	for tr.handler.connections.Load() != 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if stats := tr.handler.hub.Stats(); stats.Peers != 0 || tr.handler.connections.Load() != 0 {
		t.Fatalf("after: %+v, %d connections", stats, tr.handler.connections.Load())
	}
}

func TestRefusesConnectionsWithoutAGoodToken(t *testing.T) {
	tr := start(t, nil)
	cases := map[string]string{
		"no token":             "",
		"a token that ran out": token.Sign(SubjectConnect, time.Now().Add(-time.Minute), secret),
		"another secret":       token.Sign(SubjectConnect, time.Now().Add(time.Hour), strings.Repeat("x", 40)),
		"a token for figures":  token.Sign(SubjectStats, time.Now().Add(time.Hour), secret),
	}
	for name, tokenText := range cases {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_, response, err := websocket.Dial(ctx, tr.url(tokenText), nil)
		cancel()
		if err == nil || response == nil || response.StatusCode != http.StatusUnauthorized {
			t.Errorf("%s: %v, %v", name, err, response)
		}
	}
	if tr.handler.refused.Load() != 4 {
		t.Errorf("counted %d refusals", tr.handler.refused.Load())
	}
}

func TestLetsInOnlyPagesOfAllowedWebsites(t *testing.T) {
	tr := start(t, func(c *config.Config) { c.AllowedOrigins = []string{"stream.example.com"} })
	dial := func(origin string) error {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		connection, _, err := websocket.Dial(ctx, tr.url(good()), &websocket.DialOptions{
			HTTPHeader: http.Header{"Origin": []string{origin}},
		})
		if err == nil {
			connection.CloseNow()
		}
		return err
	}
	if err := dial("https://stream.example.com"); err != nil {
		t.Errorf("the allowed website was refused: %v", err)
	}
	if err := dial("https://elsewhere.example.net"); err == nil {
		t.Error("another website was let in")
	}
}

func TestKeepsToTheLimitOfConnectionsPerAddress(t *testing.T) {
	tr := start(t, func(c *config.Config) { c.MaxPerAddress = 2 })
	tr.join(t, "anna")
	tr.join(t, "ben")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, response, err := websocket.Dial(ctx, tr.url(good()), nil)
	if err == nil || response == nil || response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("a third connection: %v, %v", err, response)
	}
}

func TestClosesAConnectionThatFloodsOrTalksNonsense(t *testing.T) {
	tr := start(t, nil)
	closed := func(p *player) bool {
		for range 200 {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			_, _, err := p.connection.Read(ctx)
			cancel()
			if err != nil {
				return websocket.CloseStatus(err) == websocket.StatusPolicyViolation
			}
		}
		return false
	}

	nonsense := tr.join(t, "nonsense")
	for range maxBadMessages {
		nonsense.send(map[string]any{"action": "dance"})
	}
	if !closed(nonsense) {
		t.Error("a connection that talks nonsense stayed open")
	}

	flood := tr.join(t, "flood")
	for range burst + 10 {
		raw, _ := json.Marshal(map[string]any{"action": "announce", "info_hash": swarm, "peer_id": flood.id})
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		err := flood.connection.Write(ctx, websocket.MessageText, raw)
		cancel()
		if err != nil {
			break
		}
	}
	if !closed(flood) {
		t.Error("a connection that floods stayed open")
	}
}

func TestGivesItsFiguresOnlyToTheMainServer(t *testing.T) {
	tr := start(t, nil)
	anna := tr.join(t, "anna")
	anna.announce(nil)
	anna.read()

	get := func(bearer string) *http.Response {
		request, _ := http.NewRequest(http.MethodGet, tr.URL+"/stats", nil)
		if bearer != "" {
			request.Header.Set("Authorization", "Bearer "+bearer)
		}
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		return response
	}
	for name, bearer := range map[string]string{"nothing": "", "a player's token": good(), "the secret itself": secret} {
		if response := get(bearer); response.StatusCode != http.StatusUnauthorized {
			t.Errorf("%s: %d", name, response.StatusCode)
		}
	}

	response := get(token.Sign(SubjectStats, time.Now().Add(time.Minute), secret))
	var stats map[string]any
	if err := json.NewDecoder(response.Body).Decode(&stats); err != nil || response.StatusCode != 200 {
		t.Fatalf("%d %v", response.StatusCode, err)
	}
	if stats["connections"] != float64(1) || stats["peers"] != float64(1) || stats["swarms"] != float64(1) || stats["version"] != "test" {
		t.Errorf("stats %v", stats)
	}

	if health, _ := http.Get(tr.URL + "/healthz"); health.StatusCode != 200 {
		t.Errorf("health %d", health.StatusCode)
	}
	if other, _ := http.Get(tr.URL + "/anything"); other.StatusCode != 404 {
		t.Errorf("a plain request: %d", other.StatusCode)
	}
}
