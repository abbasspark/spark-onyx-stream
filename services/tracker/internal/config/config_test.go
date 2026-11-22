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
		"ONYX_TRACKER_SECRET":          strings.Repeat("s", 40),
		"ONYX_TRACKER_ALLOWED_ORIGINS": "https://stream.example.com/, *.example.org",
		"ONYX_TRACKER_TRUST_PROXY":     "true",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.Listen != ":8070" || c.MaxConnections != 50000 || c.MaxPerAddress != 200 || !c.TrustProxy {
		t.Errorf("got %+v", c)
	}
	if strings.Join(c.AllowedOrigins, "|") != "stream.example.com|*.example.org" {
		t.Errorf("origins %v", c.AllowedOrigins)
	}
}

func TestNamesEverythingThatIsWrong(t *testing.T) {
	_, err := Load(env(map[string]string{
		"ONYX_TRACKER_SECRET":          "short",
		"ONYX_TRACKER_MAX_CONNECTIONS": "many",
		"ONYX_TRACKER_TRUST_PROXY":     "maybe",
	}))
	if err == nil {
		t.Fatal("accepted")
	}
	for _, name := range []string{"ONYX_TRACKER_SECRET", "ONYX_TRACKER_MAX_CONNECTIONS", "ONYX_TRACKER_TRUST_PROXY"} {
		if !strings.Contains(err.Error(), name) {
			t.Errorf("%s is not named in: %v", name, err)
		}
	}
	if _, err := Load(env(nil)); err == nil || !strings.Contains(err.Error(), "missing") {
		t.Errorf("no secret: %v", err)
	}
}
