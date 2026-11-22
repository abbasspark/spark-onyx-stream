// SPDX-License-Identifier: AGPL-3.0-only

// Package server answers viewers: it checks the token in the address, sends a
// kept copy of the file, or fetches the file from the main server first.
package server

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/abbasspark/spark-onyx-stream/services/edge-agent/internal/cache"
	"github.com/abbasspark/spark-onyx-stream/services/edge-agent/internal/origin"
	"github.com/abbasspark/spark-onyx-stream/services/edge-agent/internal/stats"
	"github.com/abbasspark/spark-onyx-stream/services/edge-agent/internal/token"
)

const (
	// How long the answer about a video's version is trusted. A video that is
	// processed again or taken away is noticed within this time.
	versionFor = 60 * time.Second
	// How long a live playlist is handed out again before it is fetched anew.
	playlistFor = time.Second
	// How long the content key of a video is kept in memory. It is never written to disk.
	keyFor = 60 * time.Second
	// Segments of live channels are of no use once they left every playlist.
	liveKeptFor = 6 * time.Hour
	// A file larger than this is not what an edge is for.
	maxFileBytes = 4 << 30

	contentKeyPath = "hls/key"
)

var (
	idPattern        = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	mediaFilePattern = regexp.MustCompile(`^(hls|thumbs)/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$`)
	liveFilePattern  = regexp.MustCompile(`^[A-Za-z0-9_-]{1,80}\.(m3u8|mp4|m4s)$`)
	versionPattern   = regexp.MustCompile(`^[A-Za-z0-9_-]{1,40}$`)
)

var contentTypes = map[string]string{
	".m3u8": "application/vnd.apple.mpegurl",
	".m4s":  "video/iso.segment",
	".mp4":  "video/mp4",
	".ts":   "video/mp2t",
	".vtt":  "text/vtt",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".png":  "image/png",
}

// Origin is what the server needs from the main server.
type Origin interface {
	AssetVersion(ctx context.Context, assetID string) (string, error)
	Open(ctx context.Context, path string) (*http.Response, error)
}

// Server is the HTTP handler of the edge.
type Server struct {
	cache    *cache.Cache
	origin   Origin
	counters *stats.Counters
	log      *slog.Logger
	now      func() time.Time

	// The key playback tokens are checked with. Empty until the main server sent it.
	signingKey atomic.Pointer[string]

	fills    flight[cache.Entry]
	versions flight[string]
	small    flight[*memoryFile]

	mu          sync.Mutex
	knownAssets map[string]assetVersion
	memory      map[string]*memoryFile
}

type assetVersion struct {
	version   string
	checkedAt time.Time
}

// memoryFile is a small answer kept in memory for a moment: a live playlist or a content key.
type memoryFile struct {
	body     []byte
	gzipped  []byte
	storedAt time.Time
}

// New makes the handler.
func New(files *cache.Cache, source Origin, counters *stats.Counters, log *slog.Logger) *Server {
	return &Server{
		cache:       files,
		origin:      source,
		counters:    counters,
		log:         log,
		now:         time.Now,
		knownAssets: map[string]assetVersion{},
		memory:      map[string]*memoryFile{},
	}
}

// SetSigningKey takes the key from a heartbeat. An empty key closes the edge.
func (s *Server) SetSigningKey(key string) { s.signingKey.Store(&key) }

// Ready says whether the edge can check tokens, which it can after its first heartbeat.
func (s *Server) Ready() bool {
	key := s.signingKey.Load()
	return key != nil && *key != ""
}

// Purge drops the copies: all of them, or those of videos or of live channels.
// What viewers ask for afterwards is fetched again. It returns how many files went.
func (s *Server) Purge(scope string) (int, bool) {
	var prefix string
	switch scope {
	case "all":
		prefix = ""
	case "video":
		prefix = "media/"
	case "live":
		prefix = "live/"
	default:
		return 0, false
	}
	removed := s.cache.RemovePrefix(prefix, "")
	s.mu.Lock()
	if scope != "live" {
		// Ask again which processing of each video is current.
		s.knownAssets = map[string]assetVersion{}
	}
	s.memory = map[string]*memoryFile{}
	s.mu.Unlock()
	return removed, true
}

// Tidy drops what has no use any more. Called now and then.
func (s *Server) Tidy() {
	removed := s.cache.RemoveOlder("live/", s.now().Add(-liveKeptFor))
	s.mu.Lock()
	for key, file := range s.memory {
		if s.now().Sub(file.storedAt) > keyFor {
			delete(s.memory, key)
		}
	}
	for id, known := range s.knownAssets {
		if s.now().Sub(known.checkedAt) > 24*time.Hour {
			delete(s.knownAssets, id)
		}
	}
	s.mu.Unlock()
	if removed > 0 {
		s.log.Info("dropped old live segments", "files", removed)
	}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/healthz" {
		s.health(w)
		return
	}

	kind, id, tokenText, file, ok := parsePath(r.URL.Path)
	if !ok {
		http.NotFound(w, r)
		return
	}

	s.counters.Requests.Add(1)
	s.counters.Active.Add(1)
	counted := &countingWriter{ResponseWriter: w}
	defer func() {
		s.counters.Active.Add(-1)
		s.counters.BytesSent.Add(counted.bytes)
	}()
	w = counted

	// Players on any website may read media. The signed address is the permission.
	header := w.Header()
	header.Set("Access-Control-Allow-Origin", "*")
	header.Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
	header.Set("Access-Control-Allow-Headers", "Range")
	header.Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
	header.Set("Access-Control-Max-Age", "600")
	header.Set("X-Content-Type-Options", "nosniff")

	switch r.Method {
	case http.MethodOptions:
		w.WriteHeader(http.StatusNoContent)
		return
	case http.MethodGet, http.MethodHead:
	default:
		header.Set("Allow", "GET, HEAD, OPTIONS")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	key := s.signingKey.Load()
	if key == nil || *key == "" {
		// Not connected to the main server yet. A player tries again.
		header.Set("Retry-After", "5")
		http.Error(w, "The edge is starting", http.StatusServiceUnavailable)
		return
	}
	// Every refusal looks the same, as it does on the main server.
	if !token.Valid(id, tokenText, *key, s.now()) {
		s.counters.Refused.Add(1)
		http.NotFound(w, r)
		return
	}

	if kind == "media" {
		s.serveMedia(w, r, id, file)
	} else {
		s.serveLive(w, r, id, file)
	}
}

// parsePath takes "/v1/<media|live>/<id>/<token>/<file>" apart.
func parsePath(urlPath string) (kind, id, tokenText, file string, ok bool) {
	rest, found := strings.CutPrefix(urlPath, "/v1/")
	if !found {
		return "", "", "", "", false
	}
	parts := strings.SplitN(rest, "/", 4)
	if len(parts) != 4 || (parts[0] != "media" && parts[0] != "live") || !idPattern.MatchString(parts[1]) {
		return "", "", "", "", false
	}
	kind, id, tokenText, file = parts[0], parts[1], parts[2], parts[3]
	if kind == "media" {
		ok = file == contentKeyPath || (mediaFilePattern.MatchString(file) && !strings.Contains(file, ".."))
	} else {
		ok = liveFilePattern.MatchString(file)
	}
	return kind, id, tokenText, file, ok
}

func (s *Server) serveMedia(w http.ResponseWriter, r *http.Request, assetID, file string) {
	version, err := s.versionOf(r.Context(), assetID)
	if err != nil {
		s.fail(w, r, err, "media/"+assetID)
		return
	}

	if file == contentKeyPath {
		key, err := s.smallFile(r.Context(), "key/"+assetID+"/"+version, "media/"+assetID+"/"+contentKeyPath, keyFor, 64)
		if err != nil {
			s.fail(w, r, err, "media/"+assetID+"/key")
			return
		}
		// A key must not be kept by caches or proxies between the player and the server.
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Length", strconv.Itoa(len(key.body)))
		if r.Method != http.MethodHead {
			_, _ = w.Write(key.body)
		}
		return
	}

	// The files of a video never change under one version.
	w.Header().Set("Cache-Control", "private, max-age=3600")
	s.serveFile(w, r, "media/"+assetID+"/"+version+"/"+file, "media/"+assetID+"/"+file)
}

func (s *Server) serveLive(w http.ResponseWriter, r *http.Request, channelID, file string) {
	if strings.HasSuffix(file, ".m3u8") {
		playlist, err := s.smallFile(r.Context(), "live/"+channelID+"/"+file, "live/"+channelID+"/"+file, playlistFor, 8<<20)
		if err != nil {
			s.fail(w, r, err, "live/"+channelID+"/"+file)
			return
		}
		// The playlist changes with every segment.
		w.Header().Set("Cache-Control", "no-cache, no-store")
		w.Header().Set("Content-Type", contentTypes[".m3u8"])
		body := playlist.body
		if playlist.gzipped != nil && strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			w.Header().Set("Content-Encoding", "gzip")
			w.Header().Set("Vary", "Accept-Encoding")
			body = playlist.gzipped
		}
		w.Header().Set("Content-Length", strconv.Itoa(len(body)))
		if r.Method != http.MethodHead {
			_, _ = w.Write(body)
		}
		return
	}

	// A segment never changes once it is written.
	w.Header().Set("Cache-Control", "private, max-age=60")
	s.serveFile(w, r, "live/"+channelID+"/"+file, "live/"+channelID+"/"+file)
}

// serveFile sends a kept copy, fetching the file first when there is none.
func (s *Server) serveFile(w http.ResponseWriter, r *http.Request, cacheKey, originPath string) {
	entry, hit := s.cache.Get(cacheKey)
	if hit {
		s.counters.Hits.Add(1)
	} else {
		s.counters.Misses.Add(1)
		var err error
		entry, err = s.fills.do(cacheKey, func() (cache.Entry, error) {
			// Another request may have finished the same fetch a moment ago.
			if kept, ok := s.cache.Get(cacheKey); ok {
				return kept, nil
			}
			// Not the request's context: others wait for this fetch too, and
			// the copy is worth having even when the first viewer leaves.
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()
			return s.fetch(ctx, cacheKey, originPath)
		})
		if err != nil {
			s.fail(w, r, err, originPath)
			return
		}
	}

	file, err := os.Open(entry.Path)
	if err != nil {
		// Dropped to make room between finding and opening it. The player asks again.
		s.fail(w, r, err, originPath)
		return
	}
	defer file.Close()

	if hit {
		w.Header().Set("X-Cache", "HIT")
	} else {
		w.Header().Set("X-Cache", "MISS")
	}
	if contentType, ok := contentTypes[strings.ToLower(path.Ext(originPath))]; ok {
		w.Header().Set("Content-Type", contentType)
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	// Answers ranges, and "not modified" for a player that asks again.
	http.ServeContent(w, r, "", entry.StoredAt, file)
}

// fetch downloads a file from the main server into the cache.
func (s *Server) fetch(ctx context.Context, cacheKey, originPath string) (cache.Entry, error) {
	response, err := s.origin.Open(ctx, originPath)
	if err != nil {
		return cache.Entry{}, err
	}
	defer response.Body.Close()

	temp, err := s.cache.NewTemp()
	if err != nil {
		return cache.Entry{}, err
	}
	written, err := io.Copy(temp, io.LimitReader(response.Body, maxFileBytes+1))
	closeErr := temp.Close()
	if err == nil {
		err = closeErr
	}
	if err == nil && written > maxFileBytes {
		err = errors.New("the file is too large for an edge")
	}
	if err == nil && response.ContentLength >= 0 && written != response.ContentLength {
		err = errors.New("the main server ended the file early")
	}
	if err != nil {
		_ = os.Remove(temp.Name())
		return cache.Entry{}, err
	}
	s.counters.BytesFetched.Add(written)
	entry, err := s.cache.Put(cacheKey, temp.Name())
	if err != nil {
		_ = os.Remove(temp.Name())
	}
	return entry, err
}

// versionOf says which processing of a video is current, asking the main
// server when the last answer is old. A new version drops the copies of the old.
func (s *Server) versionOf(ctx context.Context, assetID string) (string, error) {
	s.mu.Lock()
	known, ok := s.knownAssets[assetID]
	s.mu.Unlock()
	if ok && s.now().Sub(known.checkedAt) < versionFor {
		return known.version, nil
	}

	return s.versions.do(assetID, func() (string, error) {
		asked, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
		defer cancel()
		version, err := s.origin.AssetVersion(asked, assetID)
		switch {
		case errors.Is(err, origin.ErrNotFound):
			// Deleted, or no longer playable: nothing of it is served from here.
			s.mu.Lock()
			delete(s.knownAssets, assetID)
			s.mu.Unlock()
			s.cache.RemovePrefix("media/"+assetID+"/", "")
			return "", err
		case err != nil:
			if ok {
				// The main server cannot be asked right now. Viewers keep
				// watching what is here, which is the point of an edge.
				s.log.Warn("could not ask for the version of a video, serving the copies", "asset", assetID, "error", err.Error())
				return known.version, nil
			}
			return "", err
		case !versionPattern.MatchString(version):
			return "", errors.New("the main server sent a version that cannot be used")
		}

		s.mu.Lock()
		s.knownAssets[assetID] = assetVersion{version: version, checkedAt: s.now()}
		s.mu.Unlock()
		if removed := s.cache.RemovePrefix("media/"+assetID+"/", "media/"+assetID+"/"+version+"/"); removed > 0 {
			s.log.Info("dropped the copies of an older version of a video", "asset", assetID, "files", removed)
		}
		return version, nil
	})
}

// smallFile returns a small file of the main server, kept in memory for a moment.
func (s *Server) smallFile(ctx context.Context, memoryKey, originPath string, keep time.Duration, limit int64) (*memoryFile, error) {
	s.mu.Lock()
	kept, ok := s.memory[memoryKey]
	s.mu.Unlock()
	if ok && s.now().Sub(kept.storedAt) < keep {
		s.counters.Hits.Add(1)
		return kept, nil
	}
	s.counters.Misses.Add(1)

	return s.small.do(memoryKey, func() (*memoryFile, error) {
		asked, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
		defer cancel()
		response, err := s.origin.Open(asked, originPath)
		if err != nil {
			if errors.Is(err, origin.ErrNotFound) {
				s.mu.Lock()
				delete(s.memory, memoryKey)
				s.mu.Unlock()
			}
			return nil, err
		}
		defer response.Body.Close()
		body, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
		if err != nil {
			return nil, err
		}
		if int64(len(body)) > limit {
			return nil, errors.New("the file is larger than expected")
		}

		s.counters.BytesFetched.Add(int64(len(body)))
		file := &memoryFile{body: body, storedAt: s.now()}
		// A playlist of a channel that keeps hours is long, and packs to a tenth.
		if strings.HasSuffix(originPath, ".m3u8") && len(body) > 1024 {
			var packed bytes.Buffer
			writer := gzip.NewWriter(&packed)
			if _, err := writer.Write(body); err == nil && writer.Close() == nil {
				file.gzipped = packed.Bytes()
			}
		}
		s.mu.Lock()
		s.memory[memoryKey] = file
		s.mu.Unlock()
		return file, nil
	})
}

// fail answers a request that could not be served.
func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error, what string) {
	// Headers set for a good answer must not travel with a bad one.
	w.Header().Del("Cache-Control")
	w.Header().Del("Content-Encoding")
	if errors.Is(err, origin.ErrNotFound) {
		http.NotFound(w, r)
		return
	}
	s.counters.OriginErrors.Add(1)
	s.log.Warn("could not serve a file", "file", what, "error", err.Error())
	w.Header().Set("Retry-After", "2")
	http.Error(w, "The file could not be fetched", http.StatusBadGateway)
}

func (s *Server) health(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if s.Ready() {
		_, _ = w.Write([]byte(`{"status":"ok"}` + "\n"))
		return
	}
	w.WriteHeader(http.StatusServiceUnavailable)
	_, _ = w.Write([]byte(`{"status":"starting"}` + "\n"))
}

// countingWriter counts what is sent to a viewer.
type countingWriter struct {
	http.ResponseWriter
	bytes int64
}

func (c *countingWriter) Write(data []byte) (int, error) {
	written, err := c.ResponseWriter.Write(data)
	c.bytes += int64(written)
	return written, err
}

// ReadFrom keeps the fast path of sending a file straight from disk.
func (c *countingWriter) ReadFrom(source io.Reader) (int64, error) {
	if reader, ok := c.ResponseWriter.(io.ReaderFrom); ok {
		written, err := reader.ReadFrom(source)
		c.bytes += written
		return written, err
	}
	written, err := io.Copy(struct{ io.Writer }{c.ResponseWriter}, source)
	c.bytes += written
	return written, err
}

func (c *countingWriter) Unwrap() http.ResponseWriter { return c.ResponseWriter }
