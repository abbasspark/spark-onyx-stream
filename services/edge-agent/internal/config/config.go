// SPDX-License-Identifier: AGPL-3.0-only

// Package config reads the settings of the agent from the environment.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

// Config is everything the agent is told from outside.
type Config struct {
	// OriginURL is the address of the main server, such as https://stream.example.com.
	OriginURL string
	// Token is what the agent signs in with. Shown once when the edge is added in the panel.
	Token string
	// Listen is the address viewers are served on.
	Listen string
	// CacheDir holds the copies. CacheBytes is how much of them may be kept.
	CacheDir   string
	CacheBytes int64
	// With both set, the agent serves HTTPS itself.
	TLSCert string
	TLSKey  string
}

const defaultCacheBytes = 20 << 30

// Load reads and checks the settings. lookup is os.LookupEnv outside of tests.
func Load(lookup func(string) (string, bool)) (Config, error) {
	get := func(name, fallback string) string {
		if value, ok := lookup(name); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
		return fallback
	}

	c := Config{
		OriginURL: strings.TrimRight(get("ONYX_ORIGIN_URL", ""), "/"),
		Token:     get("ONYX_EDGE_TOKEN", ""),
		Listen:    get("ONYX_EDGE_LISTEN", ":8080"),
		CacheDir:  get("ONYX_EDGE_CACHE_DIR", "./cache"),
		TLSCert:   get("ONYX_EDGE_TLS_CERT", ""),
		TLSKey:    get("ONYX_EDGE_TLS_KEY", ""),
	}

	var problems []string
	if origin, err := url.Parse(c.OriginURL); c.OriginURL == "" {
		problems = append(problems, "ONYX_ORIGIN_URL is missing: the address of the main server, such as https://stream.example.com")
	} else if err != nil || (origin.Scheme != "http" && origin.Scheme != "https") || origin.Host == "" || strings.Trim(origin.Path, "/") != "" {
		problems = append(problems, "ONYX_ORIGIN_URL must be an address of the form https://host, without a path")
	}

	if file := get("ONYX_EDGE_TOKEN_FILE", ""); c.Token == "" && file != "" {
		content, err := os.ReadFile(file)
		if err != nil {
			problems = append(problems, "ONYX_EDGE_TOKEN_FILE could not be read: "+err.Error())
		}
		c.Token = strings.TrimSpace(string(content))
	}
	if c.Token == "" {
		problems = append(problems, "ONYX_EDGE_TOKEN is missing: the token shown when the edge was added in the admin panel")
	} else if !strings.HasPrefix(c.Token, "onyx-edge.") {
		problems = append(problems, "ONYX_EDGE_TOKEN does not look like the token of an edge, which starts with \"onyx-edge.\"")
	}

	size, err := ParseSize(get("ONYX_EDGE_CACHE_SIZE", ""), defaultCacheBytes)
	if err != nil {
		problems = append(problems, "ONYX_EDGE_CACHE_SIZE: "+err.Error())
	}
	c.CacheBytes = size

	if (c.TLSCert == "") != (c.TLSKey == "") {
		problems = append(problems, "ONYX_EDGE_TLS_CERT and ONYX_EDGE_TLS_KEY belong together: set both or neither")
	}

	if len(problems) > 0 {
		return Config{}, errors.New(strings.Join(problems, "\n"))
	}
	return c, nil
}

// ParseSize reads sizes such as "50GB", "500 MB", "1TB" or a plain number of bytes.
func ParseSize(text string, fallback int64) (int64, error) {
	text = strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(text), " ", ""))
	if text == "" {
		return fallback, nil
	}
	units := []struct {
		suffix string
		factor int64
	}{{"TB", 1 << 40}, {"GB", 1 << 30}, {"MB", 1 << 20}, {"KB", 1 << 10}, {"T", 1 << 40}, {"G", 1 << 30}, {"M", 1 << 20}, {"K", 1 << 10}, {"B", 1}}
	factor := int64(1)
	for _, unit := range units {
		if strings.HasSuffix(text, unit.suffix) {
			text, factor = strings.TrimSuffix(text, unit.suffix), unit.factor
			break
		}
	}
	number, err := strconv.ParseFloat(text, 64)
	if err != nil || number <= 0 {
		return 0, fmt.Errorf("%q is not a size. Write it like 50GB or 500MB", text)
	}
	bytes := int64(number * float64(factor))
	if bytes < 64<<20 {
		return 0, errors.New("the cache needs at least 64MB")
	}
	return bytes, nil
}
