// SPDX-License-Identifier: AGPL-3.0-only

// Package config reads the settings of the tracker from the environment.
package config

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// Config is everything the tracker is told from outside.
type Config struct {
	// Secret is shared with the main server, which signs the tokens players connect with.
	Secret string
	// Listen is the address players connect to.
	Listen string
	// AllowedOrigins are the websites whose pages may connect, as host
	// patterns such as "stream.example.com" or "*.example.com". Empty allows
	// any page that has a token.
	AllowedOrigins []string
	MaxConnections int
	MaxPerAddress  int
	// TrustProxy takes the address of a player from X-Forwarded-For, for a
	// tracker behind the gateway.
	TrustProxy bool
}

// MinSecretLength is that of the other secrets of the platform.
const MinSecretLength = 32

// Load reads and checks the settings. lookup is os.LookupEnv outside of tests.
func Load(lookup func(string) (string, bool)) (Config, error) {
	get := func(name, fallback string) string {
		if value, ok := lookup(name); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
		return fallback
	}
	var problems []string
	number := func(name string, fallback, lowest int) int {
		text := get(name, "")
		if text == "" {
			return fallback
		}
		value, err := strconv.Atoi(text)
		if err != nil || value < lowest {
			problems = append(problems, fmt.Sprintf("%s must be a whole number of at least %d", name, lowest))
			return fallback
		}
		return value
	}

	c := Config{
		Secret:         get("ONYX_TRACKER_SECRET", ""),
		Listen:         get("ONYX_TRACKER_LISTEN", ":8070"),
		MaxConnections: number("ONYX_TRACKER_MAX_CONNECTIONS", 50000, 1),
		MaxPerAddress:  number("ONYX_TRACKER_MAX_PER_ADDRESS", 200, 1),
	}
	switch strings.ToLower(get("ONYX_TRACKER_TRUST_PROXY", "false")) {
	case "1", "true", "yes":
		c.TrustProxy = true
	case "0", "false", "no":
	default:
		problems = append(problems, "ONYX_TRACKER_TRUST_PROXY must be true or false")
	}
	for _, origin := range strings.FieldsFunc(get("ONYX_TRACKER_ALLOWED_ORIGINS", ""), func(r rune) bool { return r == ',' || r == ' ' }) {
		// A full address is accepted and reduced to its host.
		origin = strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://")
		if origin = strings.TrimRight(origin, "/"); origin != "" {
			c.AllowedOrigins = append(c.AllowedOrigins, origin)
		}
	}

	if c.Secret == "" {
		problems = append(problems, "ONYX_TRACKER_SECRET is missing: the value of P2P_TRACKER_SECRET of the main server")
	} else if len(c.Secret) < MinSecretLength {
		problems = append(problems, fmt.Sprintf("ONYX_TRACKER_SECRET must have at least %d characters", MinSecretLength))
	}
	if len(problems) > 0 {
		return Config{}, errors.New(strings.Join(problems, "\n"))
	}
	return c, nil
}
