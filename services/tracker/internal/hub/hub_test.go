// SPDX-License-Identifier: AGPL-3.0-only
package hub

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

const (
	swarmA = "AAAAAAAAAAAAAAAAAAAA"
	swarmB = "BBBBBBBBBBBBBBBBBBBB"
)

// viewer is a player in a test, with what the hub sent it.
type viewer struct {
	*Peer
	id       string
	received []map[string]any
}

func newViewer(name string) *viewer {
	v := &viewer{id: (name + strings.Repeat("-", 20))[:20]}
	v.Peer = NewPeer(func(message []byte) bool {
		var decoded map[string]any
		if err := json.Unmarshal(message, &decoded); err != nil {
			panic(err)
		}
		v.received = append(v.received, decoded)
		return true
	})
	return v
}

func (v *viewer) take() []map[string]any {
	got := v.received
	v.received = nil
	return got
}

func (v *viewer) announce(t *testing.T, h *Hub, swarm string, more map[string]any) bool {
	t.Helper()
	body := map[string]any{"action": "announce", "info_hash": swarm, "peer_id": v.id, "numwant": 5}
	for key, value := range more {
		body[key] = value
	}
	raw, _ := json.Marshal(body)
	return h.Handle(v.Peer, raw)
}

func offers(count int) []map[string]any {
	list := make([]map[string]any, count)
	for index := range list {
		list[index] = map[string]any{
			"offer":    map[string]any{"type": "offer", "sdp": fmt.Sprintf("sdp-%d", index)},
			"offer_id": fmt.Sprintf("offer-%d", index),
		}
	}
	return list
}

func TestAViewerAloneIsToldTheSwarmIsEmpty(t *testing.T) {
	h := New(DefaultLimits())
	anna := newViewer("anna")
	if !anna.announce(t, h, swarmA, map[string]any{"offers": offers(3)}) {
		t.Fatal("refused")
	}
	got := anna.take()
	if len(got) != 1 || got[0]["info_hash"] != swarmA || got[0]["incomplete"] != float64(1) || got[0]["interval"] != float64(120) {
		t.Fatalf("got %v", got)
	}
}

func TestOffersGoToOtherViewersOfTheSameSwarmAndAnswersComeBack(t *testing.T) {
	h := New(DefaultLimits())
	anna, ben, cara, dora := newViewer("anna"), newViewer("ben"), newViewer("cara"), newViewer("dora")
	ben.announce(t, h, swarmA, nil)
	cara.announce(t, h, swarmA, nil)
	dora.announce(t, h, swarmB, nil)
	ben.take()
	cara.take()
	dora.take()

	anna.announce(t, h, swarmA, map[string]any{"offers": offers(5)})
	if got := anna.take(); len(got) != 1 || got[0]["incomplete"] != float64(3) {
		t.Fatalf("anna got %v", got)
	}
	// Two others in the swarm: each gets one offer, and they are different ones.
	benGot, caraGot := ben.take(), cara.take()
	if len(benGot) != 1 || len(caraGot) != 1 {
		t.Fatalf("ben got %d, cara got %d", len(benGot), len(caraGot))
	}
	if benGot[0]["peer_id"] != anna.id || benGot[0]["offer_id"] == caraGot[0]["offer_id"] {
		t.Fatalf("ben got %v, cara got %v", benGot[0], caraGot[0])
	}
	if sdp := benGot[0]["offer"].(map[string]any)["sdp"]; !strings.HasPrefix(sdp.(string), "sdp-") {
		t.Errorf("the offer did not arrive whole: %v", benGot[0])
	}
	if len(dora.take()) != 0 {
		t.Error("a viewer of another swarm got an offer")
	}

	// Ben answers. Only Anna hears of it.
	ben.announce(t, h, swarmA, map[string]any{
		"to_peer_id": anna.id,
		"offer_id":   benGot[0]["offer_id"],
		"answer":     map[string]any{"type": "answer", "sdp": "bens-sdp"},
	})
	got := anna.take()
	if len(got) != 1 || got[0]["peer_id"] != ben.id || got[0]["offer_id"] != benGot[0]["offer_id"] {
		t.Fatalf("anna got %v", got)
	}
	if got[0]["answer"].(map[string]any)["sdp"] != "bens-sdp" {
		t.Errorf("the answer did not arrive whole: %v", got[0])
	}
	if len(ben.take()) != 0 || len(cara.take()) != 0 {
		t.Error("an answer went to someone it was not for")
	}

	stats := h.Stats()
	if stats.Peers != 4 || stats.Swarms != 2 || stats.OffersRelayed != 2 || stats.AnswersRelayed != 1 {
		t.Errorf("stats %+v", stats)
	}
	if fmt.Sprint(stats.LargestSwarms) != "[3 1]" {
		t.Errorf("largest swarms %v", stats.LargestSwarms)
	}
}

func TestAnAnswerFromOutsideTheSwarmGoesNowhere(t *testing.T) {
	h := New(DefaultLimits())
	anna, eve := newViewer("anna"), newViewer("eve")
	anna.announce(t, h, swarmA, nil)
	anna.take()

	eve.announce(t, h, swarmA, map[string]any{
		"to_peer_id": anna.id,
		"offer_id":   "made-up",
		"answer":     map[string]any{"type": "answer", "sdp": "x"},
	})
	if got := anna.take(); len(got) != 0 {
		t.Fatalf("anna got %v", got)
	}
}

func TestAViewerWhoLeavesGetsNoMoreOffers(t *testing.T) {
	h := New(DefaultLimits())
	anna, ben, cara := newViewer("anna"), newViewer("ben"), newViewer("cara")
	ben.announce(t, h, swarmA, nil)
	cara.announce(t, h, swarmA, nil)

	h.Remove(ben.Peer)                                              // the connection closed
	cara.announce(t, h, swarmA, map[string]any{"event": "stopped"}) // said goodbye
	ben.take()
	cara.take()

	anna.announce(t, h, swarmA, map[string]any{"offers": offers(2)})
	if len(ben.take()) != 0 || len(cara.take()) != 0 {
		t.Error("someone who left got an offer")
	}
	if stats := h.Stats(); stats.Peers != 1 || stats.Swarms != 1 {
		t.Errorf("stats %+v", stats)
	}
	h.Remove(anna.Peer)
	if stats := h.Stats(); stats.Peers != 0 || stats.Swarms != 0 {
		t.Errorf("an empty swarm was kept: %+v", stats)
	}
}

func TestKeepsToItsLimits(t *testing.T) {
	h := New(Limits{MaxOffers: 2, MaxSwarmsPerPeer: 2, MaxSwarmSize: 3})
	anna := newViewer("anna")
	others := []*viewer{newViewer("ben"), newViewer("cara"), newViewer("dora")}
	for _, other := range others[:2] {
		other.announce(t, h, swarmA, nil)
		other.take()
	}

	// Five offers, two passed on.
	anna.announce(t, h, swarmA, map[string]any{"offers": offers(5)})
	passed := 0
	for _, other := range others {
		passed += len(other.take())
	}
	if passed != 2 {
		t.Errorf("%d offers passed on", passed)
	}

	// The swarm is full: a fourth is told about it but gets no offers later.
	others[2].announce(t, h, swarmA, nil)
	if got := others[2].take(); len(got) != 1 || got[0]["incomplete"] != float64(3) {
		t.Errorf("the fourth got %v", got)
	}

	// A third swarm on one connection is refused.
	anna.announce(t, h, swarmB, nil)
	anna.take()
	if anna.announce(t, h, "CCCCCCCCCCCCCCCCCCCC", nil) {
		t.Error("a third swarm was accepted")
	}
	if got := anna.take(); len(got) != 1 || got[0]["failure reason"] == nil {
		t.Errorf("anna got %v", got)
	}
}

func TestRefusesWhatMakesNoSense(t *testing.T) {
	h := New(DefaultLimits())
	anna := newViewer("anna")
	for name, raw := range map[string]string{
		"not json":        `{"action":`,
		"no action":       `{"info_hash":"AAAAAAAAAAAAAAAAAAAA"}`,
		"another action":  `{"action":"shutdown"}`,
		"a short hash":    `{"action":"announce","info_hash":"short","peer_id":"anna----------------"}`,
		"a hash of bytes": `{"action":"announce","info_hash":12345,"peer_id":"anna----------------"}`,
		"no peer id":      `{"action":"announce","info_hash":"AAAAAAAAAAAAAAAAAAAA"}`,
	} {
		if h.Handle(anna.Peer, []byte(raw)) {
			t.Errorf("%s: accepted", name)
		}
	}
	if stats := h.Stats(); stats.Peers != 0 || stats.Refused != 6 {
		t.Errorf("stats %+v", stats)
	}
}

func TestIdsOfBytesBeyondLettersPassThroughUnchanged(t *testing.T) {
	h := New(DefaultLimits())
	// An info hash is 20 arbitrary bytes, each sent as one character.
	binary := "\u0000\u0001\u007f\u0080\u00ff<>&\"\\'ÄÖÜäöü\u0010\u001f\u00a0"
	if len([]rune(binary)) != 20 {
		t.Fatalf("the test id has %d characters", len([]rune(binary)))
	}
	anna := newViewer("anna")
	anna.announce(t, h, binary, nil)
	if got := anna.take(); len(got) != 1 || got[0]["info_hash"] != binary {
		t.Fatalf("got %q", got)
	}
}

func TestAnswersAScrape(t *testing.T) {
	h := New(DefaultLimits())
	anna, ben := newViewer("anna"), newViewer("ben")
	anna.announce(t, h, swarmA, nil)
	ben.announce(t, h, swarmA, map[string]any{"left": 0})
	anna.take()

	h.Handle(anna.Peer, []byte(`{"action":"scrape","info_hash":["AAAAAAAAAAAAAAAAAAAA","BBBBBBBBBBBBBBBBBBBB"]}`))
	got := anna.take()
	files := got[0]["files"].(map[string]any)
	a := files[swarmA].(map[string]any)
	if a["complete"] != float64(1) || a["incomplete"] != float64(1) {
		t.Errorf("swarm A: %v", a)
	}
	if b := files[swarmB].(map[string]any); b["incomplete"] != float64(0) {
		t.Errorf("swarm B: %v", b)
	}
}
