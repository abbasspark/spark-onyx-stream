// SPDX-License-Identifier: AGPL-3.0-only
package config

import (
	"strings"
	"testing"
)

func env(values map[string]string) func(string) (string, bool) {
	return func(name string) (string, bool) {
		value, ok := values[name]
		return value, ok
	}
}

func TestReadsSettingsWithDefaults(t *testing.T) {
	c, err := Load(env(map[string]string{
		"ONYX_ORIGIN_URL": "https://stream.example.com/",
		"ONYX_EDGE_TOKEN": "onyx-edge.id.secret",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.OriginURL != "https://stream.example.com" || c.Listen != ":8080" || c.CacheBytes != 20<<30 {
		t.Errorf("got %+v", c)
	}
}

func TestNamesEverythingThatIsWrong(t *testing.T) {
	_, err := Load(env(map[string]string{
		"ONYX_ORIGIN_URL":      "stream.example.com/path",
		"ONYX_EDGE_CACHE_SIZE": "plenty",
		"ONYX_EDGE_TLS_CERT":   "/cert.pem",
	}))
	if err == nil {
		t.Fatal("accepted")
	}
	for _, name := range []string{"ONYX_ORIGIN_URL", "ONYX_EDGE_TOKEN", "ONYX_EDGE_CACHE_SIZE", "ONYX_EDGE_TLS_KEY"} {
		if !strings.Contains(err.Error(), name) {
			t.Errorf("%s is not named in: %v", name, err)
		}
	}
}

func TestReadsSizes(t *testing.T) {
	cases := map[string]int64{"50GB": 50 << 30, "500 mb": 500 << 20, "1TB": 1 << 40, "1.5g": 3 << 29, "134217728": 128 << 20, "": 7}
	for text, want := range cases {
		if got, err := ParseSize(text, 7); err != nil || got != want {
			t.Errorf("%q: got %d, %v", text, got, err)
		}
	}
	for _, text := range []string{"big", "-5GB", "0", "1MB"} {
		if _, err := ParseSize(text, 7); err == nil {
			t.Errorf("%q was accepted", text)
		}
	}
}
