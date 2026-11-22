// SPDX-License-Identifier: AGPL-3.0-only

// Package cache keeps copies of files on disk, up to a size. When it is full,
// the copies that were not asked for the longest go first.
package cache

import (
	"container/list"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const tempFolder = ".tmp"

// Entry is one kept file.
type Entry struct {
	// Path of the file on disk.
	Path     string
	Size     int64
	StoredAt time.Time
}

type item struct {
	key      string
	size     int64
	storedAt time.Time
}

// Cache is safe for use by many requests at once.
type Cache struct {
	dir   string
	limit int64

	mu      sync.Mutex
	items   map[string]*list.Element
	order   *list.List // front: asked for last
	bytes   int64
	tempSeq uint64
}

// Open prepares the folder and takes over the files a previous run left there.
func Open(dir string, limit int64) (*Cache, error) {
	if limit <= 0 {
		return nil, errors.New("the cache size must be more than nothing")
	}
	absolute, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	c := &Cache{dir: absolute, limit: limit, items: map[string]*list.Element{}, order: list.New()}
	if err := os.RemoveAll(filepath.Join(absolute, tempFolder)); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Join(absolute, tempFolder), 0o750); err != nil {
		return nil, err
	}
	if err := c.load(); err != nil {
		return nil, err
	}
	c.mu.Lock()
	c.evict()
	c.mu.Unlock()
	return c, nil
}

// load registers what is on disk, oldest first, so that the files written
// last are the last to go.
func (c *Cache) load() error {
	var found []item
	err := filepath.WalkDir(c.dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if entry.Name() == tempFolder {
				return filepath.SkipDir
			}
			return nil
		}
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() {
			return nil
		}
		relative, err := filepath.Rel(c.dir, path)
		if err != nil {
			return nil
		}
		found = append(found, item{key: filepath.ToSlash(relative), size: info.Size(), storedAt: info.ModTime()})
		return nil
	})
	if err != nil {
		return err
	}
	sortByTime(found)
	for index := range found {
		entry := found[index]
		c.items[entry.key] = c.order.PushFront(&entry)
		c.bytes += entry.size
	}
	return nil
}

// Get finds a kept file and notes that it was asked for.
func (c *Cache) Get(key string) (Entry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	element, ok := c.items[key]
	if !ok {
		return Entry{}, false
	}
	c.order.MoveToFront(element)
	entry := element.Value.(*item)
	return Entry{Path: c.pathOf(key), Size: entry.size, StoredAt: entry.storedAt}, true
}

// NewTemp opens a file to download into. Give it to Put, or remove it.
func (c *Cache) NewTemp() (*os.File, error) {
	return os.CreateTemp(filepath.Join(c.dir, tempFolder), "fetch-*")
}

// Put moves a finished download into the cache under key.
func (c *Cache) Put(key, tempPath string) (Entry, error) {
	if !safeKey(key) {
		return Entry{}, errors.New("not a name a file can be kept under")
	}
	info, err := os.Stat(tempPath)
	if err != nil {
		return Entry{}, err
	}
	target := c.pathOf(key)
	if err := os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
		return Entry{}, err
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if err := os.Rename(tempPath, target); err != nil {
		return Entry{}, err
	}
	if element, ok := c.items[key]; ok {
		c.bytes -= element.Value.(*item).size
		c.order.Remove(element)
	}
	entry := &item{key: key, size: info.Size(), storedAt: time.Now()}
	c.items[key] = c.order.PushFront(entry)
	c.bytes += entry.size
	c.evict()
	return Entry{Path: target, Size: entry.size, StoredAt: entry.storedAt}, nil
}

// RemovePrefix drops every file whose key starts with prefix, except those
// under keep (which may be empty).
func (c *Cache) RemovePrefix(prefix, keep string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	removed := 0
	for key, element := range c.items {
		if strings.HasPrefix(key, prefix) && (keep == "" || !strings.HasPrefix(key, keep)) {
			c.drop(key, element)
			removed++
		}
	}
	return removed
}

// RemoveOlder drops the files under prefix that were stored before the given time.
func (c *Cache) RemoveOlder(prefix string, before time.Time) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	removed := 0
	for key, element := range c.items {
		if strings.HasPrefix(key, prefix) && element.Value.(*item).storedAt.Before(before) {
			c.drop(key, element)
			removed++
		}
	}
	return removed
}

// Usage tells how much is kept.
func (c *Cache) Usage() (bytes int64, files int, limit int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.bytes, len(c.items), c.limit
}

// Dir is the folder of the cache.
func (c *Cache) Dir() string { return c.dir }

// evict makes room. The caller holds the lock.
func (c *Cache) evict() {
	for c.bytes > c.limit {
		oldest := c.order.Back()
		if oldest == nil {
			return
		}
		c.drop(oldest.Value.(*item).key, oldest)
	}
}

func (c *Cache) drop(key string, element *list.Element) {
	c.bytes -= element.Value.(*item).size
	c.order.Remove(element)
	delete(c.items, key)
	// A request that is sending this file keeps it open and finishes.
	_ = os.Remove(c.pathOf(key))
}

func (c *Cache) pathOf(key string) string {
	return filepath.Join(c.dir, filepath.FromSlash(key))
}

// safeKey allows only plain relative paths, so nothing is written outside the folder.
func safeKey(key string) bool {
	if key == "" || strings.HasPrefix(key, "/") || strings.Contains(key, "\\") {
		return false
	}
	for _, part := range strings.Split(key, "/") {
		if part == "" || part == "." || part == ".." || strings.HasPrefix(part, ".") {
			return false
		}
	}
	return true
}

func sortByTime(items []item) {
	sort.SliceStable(items, func(a, b int) bool { return items[a].storedAt.Before(items[b].storedAt) })
}
