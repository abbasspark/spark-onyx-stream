// SPDX-License-Identifier: AGPL-3.0-only

// Package hub knows which viewers watch the same thing and passes the
// messages between them that set up a direct connection.
//
// It speaks the protocol of WebTorrent trackers, which the P2P library in the
// player uses. A viewer announces itself for a swarm (the "info hash") and
// sends offers for direct connections along. The hub hands each offer to
// another viewer of the swarm, and carries that viewer's answer back. After
// that the two talk to each other and the hub is out of it: no video ever
// passes through here.
package hub

import (
	"encoding/json"
	"math/rand/v2"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"
)

const (
	// Ids are 20 bytes, each carried as one character of a string.
	idLength = 20
	// How often a viewer is asked to announce itself again, in seconds.
	announceInterval = 120
)

// Limits keep one connection from taking more than its share.
type Limits struct {
	// Offers passed on from one announce.
	MaxOffers int
	// Swarms one connection may be in at a time.
	MaxSwarmsPerPeer int
	// Viewers in one swarm. More are still told about the swarm, but not added.
	MaxSwarmSize int
}

// DefaultLimits suit a player that shares one video or channel at a time.
func DefaultLimits() Limits {
	return Limits{MaxOffers: 10, MaxSwarmsPerPeer: 8, MaxSwarmSize: 20000}
}

// Peer is one connected player. Send must not block: it reports false when
// the player cannot take more, and the caller then drops the connection.
type Peer struct {
	Send func(message []byte) bool

	// The swarms this connection is in, and the id it uses in each.
	swarms map[string]string
}

// NewPeer wraps a connection.
func NewPeer(send func([]byte) bool) *Peer {
	return &Peer{Send: send, swarms: map[string]string{}}
}

type member struct {
	peer *Peer
	// Has everything, in the words of the protocol. Players that watch never do.
	complete bool
}

// Hub is safe for use by many connections at once.
type Hub struct {
	limits Limits

	mu     sync.Mutex
	swarms map[string]map[string]*member // info hash -> peer id -> member

	announces      atomic.Int64
	offersRelayed  atomic.Int64
	answersRelayed atomic.Int64
	refused        atomic.Int64
	startedAt      time.Time
}

// New makes an empty hub.
func New(limits Limits) *Hub {
	return &Hub{limits: limits, swarms: map[string]map[string]*member{}, startedAt: time.Now()}
}

// message is what a player sends. Ids are opaque strings of 20 characters.
type message struct {
	Action   string          `json:"action"`
	InfoHash json.RawMessage `json:"info_hash"`
	PeerID   string          `json:"peer_id"`
	Event    string          `json:"event"`
	NumWant  *int            `json:"numwant"`
	Left     *float64        `json:"left"`
	Offers   []offer         `json:"offers"`
	// An answer to an offer that was passed on to this player.
	Answer   json.RawMessage `json:"answer"`
	ToPeerID string          `json:"to_peer_id"`
	OfferID  string          `json:"offer_id"`
}

type offer struct {
	Offer   json.RawMessage `json:"offer"`
	OfferID string          `json:"offer_id"`
}

// Handle takes one message of a player and sends what follows from it. It
// returns false when the message makes no sense, which counts against the sender.
func (h *Hub) Handle(peer *Peer, raw []byte) bool {
	var m message
	if err := json.Unmarshal(raw, &m); err != nil {
		h.refused.Add(1)
		return false
	}
	switch m.Action {
	case "announce":
		return h.announce(peer, &m)
	case "scrape":
		return h.scrape(peer, &m)
	default:
		h.refused.Add(1)
		return false
	}
}

func (h *Hub) announce(peer *Peer, m *message) bool {
	var infoHash string
	if json.Unmarshal(m.InfoHash, &infoHash) != nil || !validID(infoHash) || !validID(m.PeerID) {
		h.refused.Add(1)
		fail(peer, "", "invalid info_hash or peer_id")
		return false
	}
	h.announces.Add(1)

	// An answer travels back to the player that made the offer. Nothing else happens.
	if len(m.Answer) > 0 {
		if !validID(m.ToPeerID) || m.OfferID == "" {
			h.refused.Add(1)
			return false
		}
		h.mu.Lock()
		target := h.swarms[infoHash][m.ToPeerID]
		// Only a member of the swarm may answer in it.
		_, isMember := peer.swarms[infoHash]
		h.mu.Unlock()
		if target != nil && isMember {
			send(target.peer, map[string]any{
				"action":    "announce",
				"answer":    m.Answer,
				"offer_id":  m.OfferID,
				"peer_id":   m.PeerID,
				"info_hash": infoHash,
			})
			h.answersRelayed.Add(1)
		}
		return true
	}

	h.mu.Lock()
	if m.Event == "stopped" {
		h.leave(peer, infoHash)
		complete, incomplete := h.count(infoHash)
		h.mu.Unlock()
		send(peer, response(infoHash, complete, incomplete))
		return true
	}

	swarm := h.swarms[infoHash]
	known, joined := peer.swarms[infoHash]
	if joined && known != m.PeerID {
		// One connection is one viewer in a swarm.
		delete(swarm, known)
		joined = false
	}
	if !joined {
		if len(peer.swarms) >= h.limits.MaxSwarmsPerPeer {
			h.mu.Unlock()
			h.refused.Add(1)
			fail(peer, infoHash, "too many swarms on one connection")
			return false
		}
		if swarm == nil {
			swarm = map[string]*member{}
			h.swarms[infoHash] = swarm
		}
		if len(swarm) < h.limits.MaxSwarmSize {
			if other := swarm[m.PeerID]; other != nil && other.peer != peer {
				// The same id from a newer connection replaces the older one.
				delete(other.peer.swarms, infoHash)
			}
			swarm[m.PeerID] = &member{peer: peer}
			peer.swarms[infoHash] = m.PeerID
		}
	}
	if self := swarm[m.PeerID]; self != nil && self.peer == peer {
		self.complete = m.Event == "completed" || (m.Left != nil && *m.Left == 0)
	}

	// Who gets the offers: other viewers of the swarm, picked by chance.
	wanted := len(m.Offers)
	if m.NumWant != nil && *m.NumWant < wanted {
		wanted = *m.NumWant
	}
	wanted = min(wanted, h.limits.MaxOffers)
	var targets []*Peer
	if wanted > 0 {
		targets = pick(swarm, m.PeerID, wanted)
	}
	complete, incomplete := h.count(infoHash)
	h.mu.Unlock()

	send(peer, response(infoHash, complete, incomplete))
	for index, target := range targets {
		o := m.Offers[index]
		if len(o.Offer) == 0 || o.OfferID == "" {
			continue
		}
		send(target, map[string]any{
			"action":    "announce",
			"offer":     o.Offer,
			"offer_id":  o.OfferID,
			"peer_id":   m.PeerID,
			"info_hash": infoHash,
		})
		h.offersRelayed.Add(1)
	}
	return true
}

func (h *Hub) scrape(peer *Peer, m *message) bool {
	var hashes []string
	var one string
	if json.Unmarshal(m.InfoHash, &one) == nil {
		hashes = []string{one}
	} else if json.Unmarshal(m.InfoHash, &hashes) != nil || len(hashes) > 16 {
		h.refused.Add(1)
		return false
	}
	files := map[string]any{}
	h.mu.Lock()
	for _, hash := range hashes {
		if !validID(hash) {
			continue
		}
		complete, incomplete := h.count(hash)
		files[hash] = map[string]int{"complete": complete, "incomplete": incomplete, "downloaded": complete}
	}
	h.mu.Unlock()
	send(peer, map[string]any{"action": "scrape", "files": files})
	return true
}

// Remove takes a player that went away out of every swarm.
func (h *Hub) Remove(peer *Peer) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for infoHash := range peer.swarms {
		h.leave(peer, infoHash)
	}
}

// leave removes a player from one swarm. The caller holds the lock.
func (h *Hub) leave(peer *Peer, infoHash string) {
	id, ok := peer.swarms[infoHash]
	if !ok {
		return
	}
	delete(peer.swarms, infoHash)
	swarm := h.swarms[infoHash]
	if self := swarm[id]; self != nil && self.peer == peer {
		delete(swarm, id)
	}
	if len(swarm) == 0 {
		delete(h.swarms, infoHash)
	}
}

// count tells how many of a swarm have everything and how many do not. The caller holds the lock.
func (h *Hub) count(infoHash string) (complete, incomplete int) {
	for _, m := range h.swarms[infoHash] {
		if m.complete {
			complete++
		} else {
			incomplete++
		}
	}
	return complete, incomplete
}

// pick chooses up to n members of a swarm other than the asker, by chance.
func pick(swarm map[string]*member, asker string, n int) []*Peer {
	others := make([]*Peer, 0, min(len(swarm), 64))
	seen := 0
	// Reservoir sampling: every other member has the same chance, in one pass.
	for id, m := range swarm {
		if id == asker {
			continue
		}
		seen++
		if len(others) < n {
			others = append(others, m.peer)
		} else if at := rand.IntN(seen); at < n {
			others[at] = m.peer
		}
	}
	return others
}

// Stats is what the hub tells about itself.
type Stats struct {
	// Viewers in swarms, counted once per swarm they are in.
	Peers  int `json:"peers"`
	Swarms int `json:"swarms"`
	// The size of the largest swarms, largest first.
	LargestSwarms  []int  `json:"largestSwarms"`
	Announces      int64  `json:"announces"`
	OffersRelayed  int64  `json:"offersRelayed"`
	AnswersRelayed int64  `json:"answersRelayed"`
	Refused        int64  `json:"refused"`
	StartedAt      string `json:"startedAt"`
}

// Stats takes a count.
func (h *Hub) Stats() Stats {
	stats := Stats{
		Announces:      h.announces.Load(),
		OffersRelayed:  h.offersRelayed.Load(),
		AnswersRelayed: h.answersRelayed.Load(),
		Refused:        h.refused.Load(),
		StartedAt:      h.startedAt.UTC().Format(time.RFC3339),
		LargestSwarms:  []int{},
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	stats.Swarms = len(h.swarms)
	for _, swarm := range h.swarms {
		stats.Peers += len(swarm)
		stats.LargestSwarms = insertLargest(stats.LargestSwarms, len(swarm), 5)
	}
	return stats
}

// insertLargest keeps the n largest values, largest first.
func insertLargest(values []int, value, n int) []int {
	at := len(values)
	for at > 0 && values[at-1] < value {
		at--
	}
	if at >= n {
		return values
	}
	values = append(values, 0)
	copy(values[at+1:], values[at:])
	values[at] = value
	if len(values) > n {
		values = values[:n]
	}
	return values
}

func response(infoHash string, complete, incomplete int) map[string]any {
	return map[string]any{
		"action":     "announce",
		"interval":   announceInterval,
		"info_hash":  infoHash,
		"complete":   complete,
		"incomplete": incomplete,
	}
}

func fail(peer *Peer, infoHash, reason string) {
	body := map[string]any{"action": "announce", "failure reason": reason}
	if infoHash != "" {
		body["info_hash"] = infoHash
	}
	send(peer, body)
}

func send(peer *Peer, body map[string]any) {
	encoded, err := json.Marshal(body)
	if err != nil {
		return
	}
	peer.Send(encoded)
}

// validID accepts the 20-character ids of the protocol and nothing else.
func validID(id string) bool {
	return len(id) <= idLength*4 && utf8.RuneCountInString(id) == idLength
}
