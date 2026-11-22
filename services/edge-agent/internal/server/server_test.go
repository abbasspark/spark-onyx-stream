// SPDX-License-Identifier: AGPL-3.0-only
package server

import (
	"compress/gzip"
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/abbasspark/spark-onyx-stream/services/edge-agent/internal/cache"
	"github.com/abbasspark/spark-onyx-stream/services/edge-agent/internal/origin"
	"github.com/abbasspark/spark-onyx-stream/services/edge-agent/internal/stats"
	"github.com/abbasspark/spark-onyx-stream/services/edge-agent/internal/token"
)

const (
	asset   = "01a20262-a2c7-7618-9aab-0b658aa091df"
	channel = "01a20262-a2c7-7618-9aab-0b658aa0aaaa"
	key     = "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk"
)

// fakeOrigin stands in for the main server.
type fakeOrigin struct {
	mu       sync.Mutex
	files    map[string]string
	version  string
	gone     bool
	down     bool
	slow     time.Duration
	fetches  map[string]int
	versions atomic.Int64
}

func (f *fakeOrigin) AssetVersion(context.Context, string) (string, error) {
	f.versions.Add(1)
	f.mu.Lock()
	defer f.mu.Unlock()
	switch {
	case f.down:
		return "", errors.New("connection refused")
	case f.gone:
		return "", origin.ErrNotFound
	}
	return f.version, nil
}

func (f *fakeOrigin) Open(_ context.Context, path string) (*http.Response, error) {
	f.mu.Lock()
	f.fetches[path]++
	body, ok := f.files[path]
	down, slow := f.down, f.slow
	f.mu.Unlock()
	time.Sleep(slow)
	if down {
		return nil, errors.New("connection refused")
	}
	if !ok {
		return nil, origin.ErrNotFound
	}
	return &http.Response{StatusCode: 200, ContentLength: int64(len(body)), Body: io.NopCloser(strings.NewReader(body))}, nil
}

func (f *fakeOrigin) set(path, body string) {
	f.mu.Lock()
	f.files[path] = body
	f.mu.Unlock()
}

func (f *fakeOrigin) fetched(path string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.fetches[path]
}

type edge struct {
	*Server
	origin   *fakeOrigin
	counters *stats.Counters
	clock    *time.Time
}

func newEdge(t *testing.T) *edge {
	t.Helper()
	files, err := cache.Open(t.TempDir(), 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	source := &fakeOrigin{version: "100", fetches: map[string]int{}, files: map[string]string{
		"media/" + asset + "/hls/master.m3u8": "#EXTM3U\nv0/index.m3u8\n",
		"media/" + asset + "/hls/v0/seg1.m4s": "0123456789",
		"media/" + asset + "/hls/key":         "sixteen byte key",
		"live/" + channel + "/index.m3u8":     "#EXTM3U\nseg-1.m4s\n",
		"live/" + channel + "/seg-1.m4s":      "live segment one",
	}}
	counters := &stats.Counters{}
	server := New(files, source, counters, slog.New(slog.NewTextHandler(io.Discard, nil)))
	clock := time.Unix(1_800_000_000, 0)
	server.now = func() time.Time { return clock }
	server.SetSigningKey(key)
	return &edge{Server: server, origin: source, counters: counters, clock: &clock}
}

func (e *edge) url(kind, id, file string) string {
	return "/v1/" + kind + "/" + id + "/" + token.Sign(id, e.clock.Add(time.Hour), key) + "/" + file
}

func (e *edge) get(target string, headers ...string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodGet, target, nil)
	for index := 0; index+1 < len(headers); index += 2 {
		request.Header.Set(headers[index], headers[index+1])
	}
	recorder := httptest.NewRecorder()
	e.ServeHTTP(recorder, request)
	return recorder
}

func TestFetchesAFileOnceAndThenServesTheCopy(t *testing.T) {
	e := newEdge(t)
	target := e.url("media", asset, "hls/v0/seg1.m4s")

	first := e.get(target)
	if first.Code != 200 || first.Body.String() != "0123456789" || first.Header().Get("X-Cache") != "MISS" {
		t.Fatalf("first: %d %q %s", first.Code, first.Body.String(), first.Header().Get("X-Cache"))
	}
	if got := first.Header().Get("Content-Type"); got != "video/iso.segment" {
		t.Errorf("content type %q", got)
	}
	if got := first.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("players of other sites are not let in: %q", got)
	}

	second := e.get(target)
	if second.Code != 200 || second.Header().Get("X-Cache") != "HIT" {
		t.Fatalf("second: %d %s", second.Code, second.Header().Get("X-Cache"))
	}
	if fetched := e.origin.fetched("media/" + asset + "/hls/v0/seg1.m4s"); fetched != 1 {
		t.Errorf("fetched %d times", fetched)
	}
	// Sent twice, fetched once: that is what the edge took off the main server.
	if fetched := e.counters.BytesFetched.Load(); fetched != 10 {
		t.Errorf("counted %d bytes fetched", fetched)
	}
	if e.counters.Hits.Load() != 1 || e.counters.Misses.Load() != 1 || e.counters.BytesSent.Load() != 20 {
		t.Errorf("counted %d hits, %d misses, %d bytes", e.counters.Hits.Load(), e.counters.Misses.Load(), e.counters.BytesSent.Load())
	}
}

func TestAnswersTheRangeAPlayerAsksFor(t *testing.T) {
	e := newEdge(t)
	part := e.get(e.url("media", asset, "hls/v0/seg1.m4s"), "Range", "bytes=2-5")
	if part.Code != 206 || part.Body.String() != "2345" || part.Header().Get("Content-Range") != "bytes 2-5/10" {
		t.Fatalf("%d %q %s", part.Code, part.Body.String(), part.Header().Get("Content-Range"))
	}
}

func TestManyViewersOfANewFileCauseOneFetch(t *testing.T) {
	e := newEdge(t)
	e.origin.slow = 50 * time.Millisecond
	target := e.url("media", asset, "hls/v0/seg1.m4s")
	e.get(e.url("media", asset, "hls/master.m3u8")) // the version is known from here on

	var group sync.WaitGroup
	for viewer := 0; viewer < 20; viewer++ {
		group.Add(1)
		go func() {
			defer group.Done()
			if answer := e.get(target); answer.Code != 200 || answer.Body.String() != "0123456789" {
				t.Errorf("%d %q", answer.Code, answer.Body.String())
			}
		}()
	}
	group.Wait()
	if fetched := e.origin.fetched("media/" + asset + "/hls/v0/seg1.m4s"); fetched != 1 {
		t.Errorf("fetched %d times for 20 viewers", fetched)
	}
}

func TestRefusesWhatHasNoGoodToken(t *testing.T) {
	e := newEdge(t)
	good := token.Sign(asset, e.clock.Add(time.Hour), key)
	cases := map[string]string{
		"a token of another video": "/v1/media/" + asset + "/" + token.Sign(channel, e.clock.Add(time.Hour), key) + "/hls/master.m3u8",
		"a token that ran out":     "/v1/media/" + asset + "/" + token.Sign(asset, e.clock.Add(-time.Minute), key) + "/hls/master.m3u8",
		"a token of another key":   "/v1/media/" + asset + "/" + token.Sign(asset, e.clock.Add(time.Hour), strings.Repeat("x", 64)) + "/hls/master.m3u8",
		"a path out of the folder": "/v1/media/" + asset + "/" + good + "/hls/../../secret",
		"a file of another kind":   "/v1/media/" + asset + "/" + good + "/sources/film.mkv",
		"something else":           "/v1/admins",
	}
	for name, target := range cases {
		if answer := e.get(target); answer.Code != 404 {
			t.Errorf("%s: %d", name, answer.Code)
		}
	}
	if len(e.origin.fetches) != 0 {
		t.Errorf("the main server was asked: %v", e.origin.fetches)
	}
	if e.counters.Refused.Load() != 3 {
		t.Errorf("counted %d refusals", e.counters.Refused.Load())
	}
}

func TestServesNothingBeforeTheMainServerSentTheKey(t *testing.T) {
	e := newEdge(t)
	e.SetSigningKey("")
	answer := e.get(e.url("media", asset, "hls/master.m3u8"))
	if answer.Code != 503 || answer.Header().Get("Retry-After") == "" {
		t.Fatalf("%d", answer.Code)
	}
	if health := e.get("/healthz"); health.Code != 503 {
		t.Errorf("health %d", health.Code)
	}
	e.SetSigningKey(key)
	if health := e.get("/healthz"); health.Code != 200 {
		t.Errorf("health %d", health.Code)
	}
}

func TestDropsTheCopiesWhenAVideoIsProcessedAgain(t *testing.T) {
	e := newEdge(t)
	target := e.url("media", asset, "hls/v0/seg1.m4s")
	e.get(target)

	e.origin.mu.Lock()
	e.origin.version = "200"
	e.origin.files["media/"+asset+"/hls/v0/seg1.m4s"] = "new content"
	e.origin.mu.Unlock()

	// Within a minute the old answer is trusted.
	if answer := e.get(target); answer.Body.String() != "0123456789" {
		t.Fatalf("too early: %q", answer.Body.String())
	}
	*e.clock = e.clock.Add(61 * time.Second)
	if answer := e.get(target); answer.Body.String() != "new content" || answer.Header().Get("X-Cache") != "MISS" {
		t.Fatalf("after a minute: %q %s", answer.Body.String(), answer.Header().Get("X-Cache"))
	}
	if _, files, _ := e.cache.Usage(); files != 1 {
		t.Errorf("%d files kept, the old copy should be gone", files)
	}
}

func TestStopsServingAVideoThatWasTakenAway(t *testing.T) {
	e := newEdge(t)
	target := e.url("media", asset, "hls/v0/seg1.m4s")
	e.get(target)
	e.origin.mu.Lock()
	e.origin.gone = true
	e.origin.mu.Unlock()
	*e.clock = e.clock.Add(61 * time.Second)

	if answer := e.get(target); answer.Code != 404 {
		t.Fatalf("%d", answer.Code)
	}
	if _, files, _ := e.cache.Usage(); files != 0 {
		t.Errorf("%d files kept", files)
	}
}

func TestKeepsServingCopiesWhileTheMainServerIsAway(t *testing.T) {
	e := newEdge(t)
	target := e.url("media", asset, "hls/v0/seg1.m4s")
	e.get(target)
	e.origin.mu.Lock()
	e.origin.down = true
	e.origin.mu.Unlock()
	*e.clock = e.clock.Add(10 * time.Minute)

	if answer := e.get(target); answer.Code != 200 || answer.Body.String() != "0123456789" {
		t.Fatalf("a kept file: %d", answer.Code)
	}
	missing := e.get(e.url("media", asset, "hls/master.m3u8"))
	if missing.Code != 502 || missing.Header().Get("Cache-Control") != "" {
		t.Fatalf("a file that is not here: %d", missing.Code)
	}
	if e.counters.OriginErrors.Load() != 1 {
		t.Errorf("counted %d errors", e.counters.OriginErrors.Load())
	}
}

func TestHandsOutTheContentKeyWithoutKeepingItOnDisk(t *testing.T) {
	e := newEdge(t)
	target := e.url("media", asset, "hls/key")
	for range 3 {
		answer := e.get(target)
		if answer.Code != 200 || answer.Body.String() != "sixteen byte key" || answer.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("%d %q %s", answer.Code, answer.Body.String(), answer.Header().Get("Cache-Control"))
		}
	}
	if fetched := e.origin.fetched("media/" + asset + "/hls/key"); fetched != 1 {
		t.Errorf("fetched %d times", fetched)
	}
	if _, files, _ := e.cache.Usage(); files != 0 {
		t.Errorf("the key was written to disk")
	}
}

func TestFetchesALivePlaylistAgainAfterASecond(t *testing.T) {
	e := newEdge(t)
	target := e.url("live", channel, "index.m3u8")

	first := e.get(target)
	if first.Code != 200 || first.Header().Get("Cache-Control") != "no-cache, no-store" {
		t.Fatalf("%d %s", first.Code, first.Header().Get("Cache-Control"))
	}
	e.origin.set("live/"+channel+"/index.m3u8", "#EXTM3U\nseg-1.m4s\nseg-2.m4s\n")
	if again := e.get(target); again.Body.String() != first.Body.String() {
		t.Error("fetched again within the second")
	}
	*e.clock = e.clock.Add(1100 * time.Millisecond)
	if later := e.get(target); !strings.Contains(later.Body.String(), "seg-2.m4s") {
		t.Errorf("still the old playlist: %q", later.Body.String())
	}

	segment := e.get(e.url("live", channel, "seg-1.m4s"))
	if segment.Code != 200 || segment.Body.String() != "live segment one" {
		t.Fatalf("segment: %d", segment.Code)
	}
	if e.get(e.url("live", channel, "seg-1.m4s")).Header().Get("X-Cache") != "HIT" {
		t.Error("the segment was not kept")
	}
}

func TestPacksALongPlaylist(t *testing.T) {
	e := newEdge(t)
	long := "#EXTM3U\n" + strings.Repeat("#EXTINF:4.000,\nseg-1700000000.m4s\n", 500)
	e.origin.set("live/"+channel+"/index.m3u8", long)

	packed := e.get(e.url("live", channel, "index.m3u8"), "Accept-Encoding", "gzip, br")
	if packed.Header().Get("Content-Encoding") != "gzip" || packed.Body.Len() > len(long)/5 {
		t.Fatalf("encoding %q, %d of %d bytes", packed.Header().Get("Content-Encoding"), packed.Body.Len(), len(long))
	}
	reader, err := gzip.NewReader(packed.Body)
	if err != nil {
		t.Fatal(err)
	}
	if plain, _ := io.ReadAll(reader); string(plain) != long {
		t.Error("the packed playlist does not unpack to the playlist")
	}
	if plain := e.get(e.url("live", channel, "index.m3u8")); plain.Header().Get("Content-Encoding") != "" || plain.Body.String() != long {
		t.Error("a player that does not take packed answers got one")
	}
}

func TestAChannelThatIsOffAirIsNotFound(t *testing.T) {
	e := newEdge(t)
	other := "01a20262-a2c7-7618-9aab-0b658aa0bbbb"
	if answer := e.get(e.url("live", other, "index.m3u8")); answer.Code != 404 {
		t.Fatalf("%d", answer.Code)
	}
	if e.counters.OriginErrors.Load() != 0 {
		t.Error("counted as an error of the main server")
	}
}

func TestAnswersThePreflightOfABrowser(t *testing.T) {
	e := newEdge(t)
	request := httptest.NewRequest(http.MethodOptions, e.url("media", asset, "hls/master.m3u8"), nil)
	recorder := httptest.NewRecorder()
	e.ServeHTTP(recorder, request)
	if recorder.Code != 204 || recorder.Header().Get("Access-Control-Allow-Headers") != "Range" {
		t.Fatalf("%d %v", recorder.Code, recorder.Header())
	}
	post := httptest.NewRecorder()
	e.ServeHTTP(post, httptest.NewRequest(http.MethodPost, e.url("media", asset, "hls/master.m3u8"), nil))
	if post.Code != 405 {
		t.Errorf("POST: %d", post.Code)
	}
}

func TestDropsCopiesWhenAsked(t *testing.T) {
	e := newEdge(t)
	e.get(e.url("media", asset, "hls/v0/seg1.m4s"))
	e.get(e.url("live", channel, "seg-1.m4s"))
	e.get(e.url("media", asset, "hls/key"))

	if removed, ok := e.Purge("live"); !ok || removed != 1 {
		t.Fatalf("live: removed %d, %v", removed, ok)
	}
	if e.get(e.url("media", asset, "hls/v0/seg1.m4s")).Header().Get("X-Cache") != "HIT" {
		t.Error("the copy of the video went with the live ones")
	}
	if _, ok := e.Purge("everything"); ok {
		t.Error("an unknown kind was accepted")
	}

	asked := e.origin.versions.Load()
	if removed, ok := e.Purge("all"); !ok || removed != 1 {
		t.Fatalf("all: removed %d, %v", removed, ok)
	}
	again := e.get(e.url("media", asset, "hls/v0/seg1.m4s"))
	if again.Code != 200 || again.Header().Get("X-Cache") != "MISS" {
		t.Fatalf("after emptying: %d %s", again.Code, again.Header().Get("X-Cache"))
	}
	if e.origin.versions.Load() != asked+1 {
		t.Error("the version of the video was not asked for again")
	}
	e.get(e.url("media", asset, "hls/key"))
	if fetched := e.origin.fetched("media/" + asset + "/hls/key"); fetched != 2 {
		t.Errorf("the key was fetched %d times, it should have been dropped too", fetched)
	}
}
