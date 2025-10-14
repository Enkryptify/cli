package enkryptify

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/Enkryptify/cli/internal/auth"
)

const (
	BaseAPIURL = "https://api.enkryptify.com/v1"
)

type Client struct {
	httpClient *http.Client
	auth       *auth.EnkryptifyAuth
}

type Workspace struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Slug    string `json:"slug"`
	OwnerID string `json:"ownerId"`
}

type Project struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	Secrets      int    `json:"secrets"`
	Environments int    `json:"environments"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

type TeamWithProjects struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Projects []Project `json:"projects"`
}

type ProjectDetail struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	Slug         string        `json:"slug"`
	Environments []Environment `json:"environments"`
}

type Environment struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Secret struct {
	ID       string        `json:"id"`
	Name     string        `json:"name"`
	Note     string        `json:"note"`
	Type     string        `json:"type"`
	DataType string        `json:"dataType"`
	Values   []SecretValue `json:"values"`
	CreatedAt string       `json:"createdAt"`
	UpdatedAt string       `json:"updatedAt"`
}

type SecretValue struct {
	EnvironmentID string `json:"environmentId"`
	Value         string `json:"value"`
}

type ProjectTokenResponse struct {
	ID        string `json:"id"`
	Workspace struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
	} `json:"workspace"`
	Project struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
	} `json:"project"`
	EnvironmentID string `json:"environmentId"`
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		auth:       auth.NewEnkryptifyAuth(),
	}
}

func (c *Client) makeRequest(method, endpoint string, result interface{}) error {
	accessToken, err := c.auth.GetAccessToken()
	if err != nil {
		return fmt.Errorf("failed to get access token: %w", err)
	}

	req, err := http.NewRequest(method, BaseAPIURL+endpoint, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("X-API-Key", accessToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API request failed with status %d", resp.StatusCode)
	}

	if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
		return fmt.Errorf("failed to decode response: %w", err)
	}

	return nil
}

func (c *Client) GetWorkspaces() ([]Workspace, error) {
	var workspaces []Workspace

	if err := c.makeRequest("GET", "/workspace", &workspaces); err != nil {
		return nil, fmt.Errorf("failed to get workspaces: %w", err)
	}

	return workspaces, nil
}

func (c *Client) GetProjects(workspaceSlug string) ([]Project, error) {
	var teamsWithProjects []TeamWithProjects

	endpoint := fmt.Sprintf("/workspace/%s/project", workspaceSlug)
	if err := c.makeRequest("GET", endpoint, &teamsWithProjects); err != nil {
		return nil, fmt.Errorf("failed to get projects: %w", err)
	}

	var allProjects []Project
	for _, team := range teamsWithProjects {
		allProjects = append(allProjects, team.Projects...)
	}

	return allProjects, nil
}

func (c *Client) GetProjectDetail(workspaceSlug, projectSlug string) (*ProjectDetail, error) {
	var projectDetail ProjectDetail

	endpoint := fmt.Sprintf("/workspace/%s/project/%s", workspaceSlug, projectSlug)
	if err := c.makeRequest("GET", endpoint, &projectDetail); err != nil {
		return nil, fmt.Errorf("failed to get project detail: %w", err)
	}

	return &projectDetail, nil
}

func (c *Client) GetSecrets(workspaceSlug, projectSlug, environmentID string) ([]Secret, error) {
	var secrets []Secret

	endpoint := fmt.Sprintf("/workspace/%s/project/%s/secret?environmentId=%s", workspaceSlug, projectSlug, environmentID)
	if err := c.makeRequest("GET", endpoint, &secrets); err != nil {
		return nil, fmt.Errorf("failed to get secrets: %w", err)
	}

	return secrets, nil
}

func (c *Client) GetProjectTokenDetails() (*ProjectTokenResponse, error) {
	var tokenDetails ProjectTokenResponse

	if err := c.makeRequest("GET", "/auth/project-token", &tokenDetails); err != nil {
		return nil, fmt.Errorf("failed to get project token details: %w", err)
	}

	return &tokenDetails, nil
}