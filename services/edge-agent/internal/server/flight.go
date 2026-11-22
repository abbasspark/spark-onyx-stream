// SPDX-License-Identifier: AGPL-3.0-only
package server

import "sync"

// flight makes sure that many requests for the same thing cause one piece of
// work, and all of them get its result.
type flight[Value any] struct {
	mu    sync.Mutex
	calls map[string]*call[Value]
}

type call[Value any] struct {
	done  chan struct{}
	value Value
	err   error
}

func (f *flight[Value]) do(key string, work func() (Value, error)) (Value, error) {
	f.mu.Lock()
	if f.calls == nil {
		f.calls = map[string]*call[Value]{}
	}
	if running, ok := f.calls[key]; ok {
		f.mu.Unlock()
		<-running.done
		return running.value, running.err
	}
	mine := &call[Value]{done: make(chan struct{})}
	f.calls[key] = mine
	f.mu.Unlock()

	mine.value, mine.err = work()
	f.mu.Lock()
	delete(f.calls, key)
	f.mu.Unlock()
	close(mine.done)
	return mine.value, mine.err
}
