package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	defaultBaseURL = "https://api.enkryptify.com/v1"
	defaultTimeout = 10 * time.Second
)

type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

type ClientOption func(*Client)

type RequestOption func(*http.Request)

func WithHeader(key, value string) RequestOption {
	return func(r *http.Request) {
		r.Header.Set(key, value)
	}
}

func WithQuery(params map[string]string) RequestOption {
	return func(r *http.Request) {
		q := r.URL.Query()
		for k, v := range params {
			q.Add(k, v)
		}
		r.URL.RawQuery = q.Encode()
	}
}

func NewClient(apiKey string, opts ...ClientOption) *Client {
	client := &Client{
		baseURL: defaultBaseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: defaultTimeout,
		},
	}

	for _, opt := range opts {
		opt(client)
	}

	return client
}

func (c *Client) doRequest(ctx context.Context, method, path string, body interface{}, result interface{}, opts ...RequestOption) error {
	url := fmt.Sprintf("%s%s", c.baseURL, path)

	var bodyReader io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(jsonBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	for _, opt := range opts {
		opt(req)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var apiErr APIError
		if err := json.Unmarshal(respBody, &apiErr); err != nil {
			return fmt.Errorf("request failed with status %d: %s", resp.StatusCode, string(respBody))
		}
		return &apiErr
	}

	if result != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, result); err != nil {
			return fmt.Errorf("failed to unmarshal response: %w", err)
		}
	}

	return nil
}

type APIError struct {
	StatusCode int    `json:"status_code"`
	Message    string `json:"message"`
	Code       string `json:"code"`
}

func (e *APIError) Error() string {
	return fmt.Sprintf("API error: %s (code: %s, status: %d)", e.Message, e.Code, e.StatusCode)
}
