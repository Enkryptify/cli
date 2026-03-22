import { HttpResponse, http } from "msw";
import { FAKE_API_SECRETS, FAKE_ENVIRONMENTS, FAKE_PROJECTS, FAKE_WORKSPACES } from "./fixtures";

const API_BASE = "https://api.enkryptify.com";

export const handlers = [
    // Workspaces
    http.get(`${API_BASE}/v1/workspace`, () => {
        return HttpResponse.json(FAKE_WORKSPACES);
    }),

    // Projects
    http.get(`${API_BASE}/v1/workspace/:slug/project`, () => {
        return HttpResponse.json(FAKE_PROJECTS);
    }),

    // Environments
    http.get(`${API_BASE}/v1/workspace/:wsSlug/project/:pSlug/environment`, () => {
        return HttpResponse.json(FAKE_ENVIRONMENTS);
    }),

    // Secrets (list + resolve)
    http.get(`${API_BASE}/v1/workspace/:wsSlug/project/:pSlug/secret`, () => {
        return HttpResponse.json(FAKE_API_SECRETS);
    }),

    // Create secret
    http.post(`${API_BASE}/v1/workspace/:wsSlug/project/:pSlug/secret`, () => {
        return HttpResponse.json({ success: true }, { status: 201 });
    }),

    // Update secret
    http.put(`${API_BASE}/v1/workspace/:wsSlug/project/:pSlug/secret/:id`, () => {
        return HttpResponse.json({ success: true });
    }),

    // Delete secret
    http.delete(`${API_BASE}/v1/workspace/:wsSlug/project/:pSlug/secret/:id`, () => {
        return HttpResponse.json({ success: true });
    }),

    // User info
    http.get(`${API_BASE}/v1/me`, () => {
        return HttpResponse.json({
            id: "user-test-123",
            email: "test@enkryptify.com",
            name: "Test User",
        });
    }),

    // Token exchange
    http.post(`${API_BASE}/v1/auth/token`, () => {
        return HttpResponse.json({
            access_token: "new-access-token",
            token_type: "Bearer",
        });
    }),

    // SDK token
    http.post(`${API_BASE}/v1/workspace/:slug/tokens/cli`, () => {
        return HttpResponse.json({
            token: "sdk-test-token",
        });
    }),

    // GitHub releases (for version check)
    http.get("https://api.github.com/repos/Enkryptify/cli/releases/latest", () => {
        return HttpResponse.json({
            tag_name: "v1.0.0",
            name: "v1.0.0",
        });
    }),
];
