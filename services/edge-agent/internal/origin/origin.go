// SPDX-License-Identifier: AGPL-3.0-only

// Package origin talks to the main server: heartbeats, and the files viewers ask for.
package origin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"
)

// ErrNotFound means the main server has no such file, or will not give it.
var ErrNotFound = errors.New("not found on the main server")

// ErrRefused means the token of this edge was not accepted.
var ErrRefused = errors.New("the main server refused the token of this edge")

// ErrTooOld means this agent is older than the main server can work with.
var ErrTooOld = errors.New("the main server asks for a newer edge agent")

// Client is safe for use by many requests at once.
type Client struct {
	base  string
	token string
	http  *http.Client
}

// New makes a client for the main server at base, such as https://stream.example.com.
func New(base, token string) *Client {
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          64,
		MaxIdleConnsPerHost:   64,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
	}
	return &Client{base: base, token: token, http: &http.Client{Transport: transport}}
}

// Answer is what the main server says to a heartbeat.
type Answer struct {
	Edge struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		Enabled bool   `json:"enabled"`
	} `json:"edge"`
	SigningKey       string    `json:"signingKey"`
	HeartbeatSeconds int       `json:"heartbeatSeconds"`
	Protocol         int       `json:"protocol"`
	Commands         []Command `json:"commands"`
}

// Command is something the main server asks of the agent. The agent names its
// id in a later heartbeat once it is done.
type Command struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	// For "purge": "all", "video" or "live".
	Scope string `json:"scope"`
}

// Heartbeat sends a report and returns what the main server has to say.
func (c *Client) Heartbeat(ctx context.Context, report any) (Answer, error) {
	body, err := json.Marshal(report)
	if err != nil {
		return Answer{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/v1/edge-agent/heartbeat", bytes.NewReader(body))
	if err != nil {
		return Answer{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := c.do(request)
	if err != nil {
		return Answer{}, err
	}
	defer drain(response)

	var answer Answer
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&answer); err != nil {
		return Answer{}, fmt.Errorf("the answer to the heartbeat could not be read: %w", err)
	}
	if answer.SigningKey == "" {
		return Answer{}, errors.New("the answer to the heartbeat carries no key")
	}
	return answer, nil
}

// AssetVersion asks which processing of a video is current. ErrNotFound when it cannot be played.
func (c *Client) AssetVersion(ctx context.Context, assetID string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/v1/edge-agent/assets/"+assetID, nil)
	if err != nil {
		return "", err
	}
	response, err := c.do(request)
	if err != nil {
		return "", err
	}
	defer drain(response)
	var body struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<16)).Decode(&body); err != nil || body.Version == "" {
		return "", errors.New("the main server gave no version for the video")
	}
	return body.Version, nil
}

// Open starts fetching a file: "media/<assetId>/<file>" or "live/<channelId>/<file>".
// The caller reads and closes the body.
func (c *Client) Open(ctx context.Context, path string) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/v1/edge-agent/"+path, nil)
	if err != nil {
		return nil, err
	}
	return c.do(request)
}

func (c *Client) do(request *http.Request) (*http.Response, error) {
	request.Header.Set("Authorization", "Bearer "+c.token)
	request.Header.Set("User-Agent", "onyx-edge-agent")
	response, err := c.http.Do(request)
	if err != nil {
		return nil, err
	}
	switch {
	case response.StatusCode == http.StatusOK:
		return response, nil
	case response.StatusCode == http.StatusNotFound:
		drain(response)
		return nil, ErrNotFound
	case response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden:
		drain(response)
		return nil, ErrRefused
	case response.StatusCode == http.StatusUpgradeRequired:
		drain(response)
		return nil, ErrTooOld
	default:
		drain(response)
		return nil, fmt.Errorf("the main server answered %d", response.StatusCode)
	}
}

func drain(response *http.Response) {
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1<<16))
	_ = response.Body.Close()
}
