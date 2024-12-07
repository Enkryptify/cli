package api

import (
	"context"
	"net/http"
)

func (c *Client) ValidateAPIKey(ctx context.Context) error {
	return c.doRequest(ctx, http.MethodGet, "/integrations/validate", nil, nil)
}
