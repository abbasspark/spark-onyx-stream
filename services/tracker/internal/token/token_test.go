// SPDX-License-Identifier: AGPL-3.0-only
package token

import (
	"strings"
	"testing"
	"time"
)

const key = "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk"

func TestAcceptsItsOwnTokensUntilTheyRunOut(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	good := Sign("tracker", now.Add(time.Hour), key)
	if !Valid("tracker", good, key, now) {
		t.Fatal("a good token was refused")
	}
	for name, c := range map[string]struct{ subject, token, key string }{
		"another subject": {"tracker-stats", good, key},
		"another key":     {"tracker", good, strings.Repeat("x", 64)},
		"no key":          {"tracker", good, ""},
		"run out":         {"tracker", Sign("tracker", now.Add(-time.Second), key), key},
		"empty":           {"tracker", "", key},
		"no signature":    {"tracker", "4102444800.", key},
	} {
		if Valid(c.subject, c.token, c.key, now) {
			t.Errorf("%s: accepted", name)
		}
	}
}
