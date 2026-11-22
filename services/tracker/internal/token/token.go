// SPDX-License-Identifier: AGPL-3.0-only

// Package token checks the tokens players connect to the tracker with.
//
// A token is "<expiry>.<signature>":
//
//	expiry     Unix time in seconds after which the token is refused
//	signature  HMAC-SHA256 over "<subject>:<expiry>", in base64url without padding
//
// The main server makes one for every viewer it lets watch, with the secret
// it shares with the tracker. The format is the one of the playback token in
// apps/api/src/playback/playback-token.ts and must stay in step with it.
package token

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"strings"
	"time"
)

const signatureLength = 43

// Valid says whether a token is good for the subject at the given time.
// An empty key refuses everything.
func Valid(id, token, key string, now time.Time) bool {
	if key == "" || id == "" {
		return false
	}
	expiryText, signature, found := strings.Cut(token, ".")
	if !found || len(expiryText) == 0 || len(expiryText) > 12 || len(signature) != signatureLength {
		return false
	}
	for _, character := range expiryText {
		if character < '0' || character > '9' {
			return false
		}
	}
	expiry, err := strconv.ParseInt(expiryText, 10, 64)
	if err != nil {
		return false
	}
	given, err := base64.RawURLEncoding.DecodeString(signature)
	if err != nil {
		return false
	}

	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(id + ":" + expiryText))
	// The signature is checked before the expiry, so a forged token learns nothing about time.
	if !hmac.Equal(given, mac.Sum(nil)) {
		return false
	}
	return expiry > now.Unix()
}

// Sign makes a token. The tracker never needs one; tests do.
func Sign(id string, expiry time.Time, key string) string {
	expiryText := strconv.FormatInt(expiry.Unix(), 10)
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(id + ":" + expiryText))
	return expiryText + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
