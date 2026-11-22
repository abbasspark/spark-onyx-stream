// SPDX-License-Identifier: AGPL-3.0-only

// Package stats counts what the edge does, for the heartbeat.
package stats

import "sync/atomic"

// Counters only grow while the agent runs.
type Counters struct {
	Requests     atomic.Int64
	BytesSent    atomic.Int64
	Hits         atomic.Int64
	Misses       atomic.Int64
	Refused      atomic.Int64
	OriginErrors atomic.Int64
	// Bytes fetched from the main server.
	BytesFetched atomic.Int64
	Active       atomic.Int64
}

// Snapshot is the form the main server expects.
type Snapshot struct {
	Requests     int64 `json:"requests"`
	BytesSent    int64 `json:"bytesSent"`
	Hits         int64 `json:"hits"`
	Misses       int64 `json:"misses"`
	Refused      int64 `json:"refused"`
	OriginErrors int64 `json:"originErrors"`
	BytesFetched int64 `json:"bytesFetched"`
}

func (c *Counters) Snapshot() Snapshot {
	return Snapshot{
		Requests:     c.Requests.Load(),
		BytesSent:    c.BytesSent.Load(),
		Hits:         c.Hits.Load(),
		Misses:       c.Misses.Load(),
		Refused:      c.Refused.Load(),
		OriginErrors: c.OriginErrors.Load(),
		BytesFetched: c.BytesFetched.Load(),
	}
}
