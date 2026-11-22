// SPDX-License-Identifier: AGPL-3.0-only
package token

import (
	"strings"
	"testing"
	"time"
)

const (
	id  = "01a20262-a2c7-7618-9aab-0b658aa091df"
	key = "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk"
	// Made by the main server's own code for the id and key above, expiring in 2100.
	fromMainServer = "4102444800.rEBVwsC1TIHcy0mGnC08bkyGfUeDQ8QWHYuTzBTlsmI"
)

func TestAcceptsTheTokensOfTheMainServer(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	if !Valid(id, fromMainServer, key, now) {
		t.Fatal("a token of the main server was refused")
	}
	if got := Sign(id, time.Unix(4102444800, 0), key); got != fromMainServer {
		t.Fatalf("signed %q, the main server signs %q", got, fromMainServer)
	}
}

func TestRefuses(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	good := Sign(id, now.Add(time.Hour), key)
	cases := map[string]struct{ id, token, key string }{
		"another video":     {"01a20262-a2c7-7618-9aab-000000000000", good, key},
		"another key":       {id, good, strings.Repeat("x", 64)},
		"no key":            {id, good, ""},
		"run out":           {id, Sign(id, now.Add(-time.Second), key), key},
		"ends this second":  {id, Sign(id, now, key), key},
		"a changed expiry":  {id, "9" + good, key},
		"no signature":      {id, "4102444800.", key},
		"no separator":      {id, "4102444800", key},
		"letters as expiry": {id, "soon." + strings.Repeat("A", 43), key},
		"a short signature": {id, "4102444800." + strings.Repeat("A", 42), key},
		"not base64":        {id, "4102444800." + strings.Repeat("!", 43), key},
		"empty":             {id, "", key},
	}
	for name, c := range cases {
		if Valid(c.id, c.token, c.key, now) {
			t.Errorf("%s: accepted", name)
		}
	}
	if !Valid(id, good, key, now) {
		t.Error("a good token was refused")
	}
}
