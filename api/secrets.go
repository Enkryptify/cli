package api

import (
	"context"
	"fmt"
	"net/http"
)

type Workspace struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type WorkspaceResponse struct {
	Data []Workspace `json:"data"`
}

func (c *Client) GetWorkspaces(ctx context.Context, workspaces *WorkspaceResponse) error {
	return c.doRequest(ctx, http.MethodGet, "/integrations/workspaces", nil, workspaces)
}

type Project struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type ProjectResponse struct {
	Data []Project `json:"data"`
}

func (c *Client) GetProjects(ctx context.Context, workspaceId string, projects *ProjectResponse) error {
	return c.doRequest(ctx, http.MethodGet, fmt.Sprintf("/integrations/projects?workspaceId=%s", workspaceId), nil, projects)
}

type ProjectKey struct {
	ID        int    `json:"id"`
	Key       string `json:"key"`
	PublicKey string `json:"publicKey"`
}

type ProjectKeyResponse struct {
	Data ProjectKey `json:"data"`
}

func (c *Client) GetProjectKey(ctx context.Context, projectId string, projectKey *ProjectKeyResponse) error {
	return c.doRequest(ctx, http.MethodGet, fmt.Sprintf("/integrations/projects/%s/key", projectId), nil, projectKey)
}

type Environment struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type EnvironmentResponse struct {
	Data []Environment `json:"data"`
}

func (c *Client) GetEnvironments(ctx context.Context, projectId string, environments *EnvironmentResponse) error {
	return c.doRequest(ctx, http.MethodGet, fmt.Sprintf("/integrations/projects/%s/environments", projectId), nil, environments)
}

type Secret struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Value string `json:"value"`
}

type SecretResponse struct {
	Data []Secret `json:"data"`
}

func (c *Client) GetSecrets(ctx context.Context, projectId string, environmentId string, secrets *SecretResponse) error {
	return c.doRequest(ctx, http.MethodGet, fmt.Sprintf("/integrations/projects/%s/environments/%s/secrets", projectId, environmentId), nil, secrets)
}
