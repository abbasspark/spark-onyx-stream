// SPDX-License-Identifier: AGPL-3.0-only
package cache

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func put(t *testing.T, c *Cache, key string, size int) {
	t.Helper()
	file, err := c.NewTemp()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write(make([]byte, size)); err != nil {
		t.Fatal(err)
	}
	file.Close()
	if _, err := c.Put(key, file.Name()); err != nil {
		t.Fatalf("put %s: %v", key, err)
	}
}

func has(c *Cache, key string) bool {
	entry, ok := c.Get(key)
	if !ok {
		return false
	}
	_, err := os.Stat(entry.Path)
	return err == nil
}

func TestKeepsFilesAndFindsThem(t *testing.T) {
	c, err := Open(t.TempDir(), 1000)
	if err != nil {
		t.Fatal(err)
	}
	put(t, c, "media/a/1/hls/seg1.m4s", 100)
	entry, ok := c.Get("media/a/1/hls/seg1.m4s")
	if !ok || entry.Size != 100 {
		t.Fatalf("got %+v, %v", entry, ok)
	}
	if _, ok := c.Get("media/a/1/hls/seg2.m4s"); ok {
		t.Fatal("found a file that was never kept")
	}
	if bytes, files, _ := c.Usage(); bytes != 100 || files != 1 {
		t.Fatalf("usage %d bytes in %d files", bytes, files)
	}
}

func TestDropsWhatWasNotAskedForTheLongest(t *testing.T) {
	c, _ := Open(t.TempDir(), 300)
	put(t, c, "live/x/a.m4s", 100)
	put(t, c, "live/x/b.m4s", 100)
	put(t, c, "live/x/c.m4s", 100)
	c.Get("live/x/a.m4s") // a is fresh again, b is now the oldest
	put(t, c, "live/x/d.m4s", 100)

	if has(c, "live/x/b.m4s") {
		t.Error("b should have gone")
	}
	for _, key := range []string{"live/x/a.m4s", "live/x/c.m4s", "live/x/d.m4s"} {
		if !has(c, key) {
			t.Errorf("%s should have stayed", key)
		}
	}
	if bytes, _, _ := c.Usage(); bytes != 300 {
		t.Errorf("kept %d bytes", bytes)
	}
}

func TestAFileLargerThanTheCacheIsNotKept(t *testing.T) {
	c, _ := Open(t.TempDir(), 100)
	put(t, c, "live/x/big.m4s", 500)
	if bytes, files, _ := c.Usage(); bytes != 0 || files != 0 {
		t.Errorf("kept %d bytes in %d files", bytes, files)
	}
}

func TestTakesOverTheFilesOfAPreviousRun(t *testing.T) {
	dir := t.TempDir()
	c, _ := Open(dir, 1000)
	put(t, c, "media/a/1/hls/old.m4s", 100)
	put(t, c, "media/a/1/hls/new.m4s", 100)
	past := time.Now().Add(-time.Hour)
	os.Chtimes(filepath.Join(dir, "media/a/1/hls/old.m4s"), past, past)
	os.WriteFile(filepath.Join(dir, tempFolder, "half-a-download"), []byte("x"), 0o600)

	again, err := Open(dir, 150)
	if err != nil {
		t.Fatal(err)
	}
	if has(again, "media/a/1/hls/old.m4s") || !has(again, "media/a/1/hls/new.m4s") {
		t.Error("the older file should have gone to fit the smaller size")
	}
	if entries, _ := os.ReadDir(filepath.Join(dir, tempFolder)); len(entries) != 0 {
		t.Error("half a download was left behind")
	}
}

func TestRemovesByPrefix(t *testing.T) {
	c, _ := Open(t.TempDir(), 1000)
	put(t, c, "media/a/1/hls/x.m4s", 10)
	put(t, c, "media/a/2/hls/x.m4s", 10)
	put(t, c, "media/b/1/hls/x.m4s", 10)

	if removed := c.RemovePrefix("media/a/", "media/a/2/"); removed != 1 {
		t.Fatalf("removed %d", removed)
	}
	if has(c, "media/a/1/hls/x.m4s") || !has(c, "media/a/2/hls/x.m4s") || !has(c, "media/b/1/hls/x.m4s") {
		t.Error("the wrong files went")
	}
	if removed := c.RemoveOlder("media/", time.Now().Add(time.Minute)); removed != 2 {
		t.Errorf("removed %d by age", removed)
	}
}

func TestRefusesNamesThatLeaveTheFolder(t *testing.T) {
	c, _ := Open(t.TempDir(), 1000)
	for _, key := range []string{"", "/etc/passwd", "../x", "a/../../x", "a//b", "a/./b", ".tmp/x", `a\b`} {
		file, _ := c.NewTemp()
		file.Close()
		if _, err := c.Put(key, file.Name()); err == nil {
			t.Errorf("%q was accepted", key)
		}
		os.Remove(file.Name())
	}
}
