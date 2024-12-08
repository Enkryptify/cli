package api

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

type Token struct {
	ID            int64     `json:"id"`
	Name          string    `json:"name"`
	ProjectID     int64     `json:"projectId"`
	EnvironmentID int64     `json:"environmentId"`
	ExpiresAt     time.Time `json:"expiresAt"`
	Key           string    `json:"key"`
	PublicKey     string    `json:"publicKey"`
}

type TokenResponse struct {
	Data Token `json:"data"`
}

func (c *Client) GetToken(ctx context.Context, token *TokenResponse) error {
	return c.doRequest(ctx, http.MethodGet, "/integrations/token", nil, token)
}

type Environment struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type EnvironmentResponse struct {
	Data []Environment `json:"data"`
}

func (c *Client) GetEnvironments(ctx context.Context, projectId int64, environments *EnvironmentResponse) error {
	return c.doRequest(ctx, http.MethodGet, fmt.Sprintf("/integrations/project/%d/environment", projectId), nil, environments)
}

type Secret struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Value string `json:"value"`
}

type SecretResponse struct {
	Data []Secret `json:"data"`
}

func (c *Client) GetSecrets(ctx context.Context, projectId int64, environmentId int64, secrets *SecretResponse) error {
	return c.doRequest(ctx, http.MethodGet, fmt.Sprintf("/integrations/project/%d/environment/%d/secret", projectId, environmentId), nil, secrets)
}
