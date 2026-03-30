import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosRequestConfig } from "axios";
import { CLIError } from "@/lib/errors";
import { InMemoryKeyring } from "../helpers/mock-keyring";
import { FAKE_AUTH_DATA, FAKE_TOKEN } from "../helpers/fixtures";

const mockKeyring = new InMemoryKeyring();

vi.mock("@/lib/keyring", () => ({
    keyring: {
        get: (...args: unknown[]) => mockKeyring.get(...(args as [string])),
        set: (...args: unknown[]) => mockKeyring.set(...(args as [string, string])),
        delete: (...args: unknown[]) => mockKeyring.delete(...(args as [string])),
        has: (...args: unknown[]) => mockKeyring.has(...(args as [string])),
    },
}));

vi.mock("@/lib/logger", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock("@/lib/config", () => ({
    config: {
        markAuthenticated: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock("@/api/httpClient", () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock("open", () => ({
    default: vi.fn().mockResolvedValue(undefined),
}));

import http from "@/api/httpClient";
import { config as configManager } from "@/lib/config";
import open from "open";
import { Auth } from "@/api/auth";

describe("Auth.login() flow (integration)", () => {
    let auth: Auth;
    let capturedRoutes: Record<string, Function>;
    let mockServer: { stop: ReturnType<typeof vi.fn>; port: number };

    beforeEach(() => {
        vi.clearAllMocks();
        mockKeyring.reset();

        capturedRoutes = {};
        mockServer = { stop: vi.fn(), port: 51823 };

        vi.stubGlobal("Bun", {
            serve: vi.fn((serverConfig: Record<string, unknown>) => {
                const routes = serverConfig.routes as Record<string, Function> | undefined;
                if (routes) {
                    for (const [path, handler] of Object.entries(routes)) {
                        capturedRoutes[path] = handler;
                    }
                }
                return mockServer;
            }),
        });

        // Default: getUserInfo returns valid user for token validation
        vi.mocked(http.get).mockImplementation((_url: string, reqConfig?: AxiosRequestConfig) => {
            if (_url === "/v1/me") {
                const authHeader = (reqConfig?.headers as Record<string, string> | undefined)?.Authorization;
                if (authHeader) {
                    return Promise.resolve({
                        status: 200,
                        data: { id: "user-test-123", email: "test@enkryptify.com", name: "Test User" },
                    });
                }
                return Promise.resolve({ status: 401, data: null });
            }
            return Promise.reject(new Error(`Unexpected URL: ${_url}`));
        });

        // Default: token exchange succeeds
        vi.mocked(http.post).mockImplementation((_url: string) => {
            if (_url === "/v1/auth/token") {
                return Promise.resolve({
                    status: 200,
                    data: { accessToken: "new-access-token-xyz", tokenType: "Bearer", expiresIn: 3600 },
                });
            }
            return Promise.reject(new Error(`Unexpected URL: ${_url}`));
        });

        auth = new Auth();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    // --- Helpers ---

    /** Give the async login flow time to reach Bun.serve + open */
    async function waitForPkceSetup() {
        await new Promise((r) => setTimeout(r, 100));
    }

    /** Simulate the OAuth callback hitting the local server */
    async function simulateCallback(params: Record<string, string>): Promise<Response> {
        const handler = capturedRoutes["/callback"];
        expect(handler).toBeDefined();

        const url = new URL("http://localhost:51823/callback");
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
        return (handler as (req: Request) => Promise<Response>)(new Request(url.toString()));
    }

    /** Extract the state parameter from the auth URL that `open` was called with */
    function extractState(): string {
        const openCall = vi.mocked(open).mock.calls[0];
        expect(openCall).toBeDefined();
        const authUrl = new URL(openCall![0] as string);
        const state = authUrl.searchParams.get("state");
        expect(state).toBeTruthy();
        return state!;
    }

    // --- Skip login when already authenticated ---

    it("skips login when valid token exists and --force is not set", async () => {
        await mockKeyring.set("enkryptify", JSON.stringify(FAKE_AUTH_DATA));

        await auth.login();

        // Should NOT have started Bun.serve (no PKCE flow needed)
        expect(Bun.serve).not.toHaveBeenCalled();
        // Should have called markAuthenticated
        expect(configManager.markAuthenticated).toHaveBeenCalled();
    });

    it("deletes old token and re-authenticates when --force is set", async () => {
        await mockKeyring.set("enkryptify", JSON.stringify(FAKE_AUTH_DATA));

        const loginPromise = auth.login({ force: true });
        await waitForPkceSetup();

        // Should have started Bun.serve for PKCE flow
        expect(Bun.serve).toHaveBeenCalled();

        // Complete the flow
        const state = extractState();
        await simulateCallback({ code: "test-auth-code", state });
        await loginPromise;

        // New token should be stored (old one replaced)
        const stored = await mockKeyring.get("enkryptify");
        const parsed = JSON.parse(stored!);
        expect(parsed.accessToken).toBe("new-access-token-xyz");
    }, 5000);

    // --- PKCE flow ---

    it("starts server and opens browser with correct auth URL params", async () => {
        const loginPromise = auth.login();
        await waitForPkceSetup();

        expect(Bun.serve).toHaveBeenCalledOnce();

        const openCall = vi.mocked(open).mock.calls[0];
        expect(openCall).toBeDefined();
        const authUrl = new URL(openCall![0] as string);

        expect(authUrl.searchParams.get("client_id")).toBe("enkryptify-cli");
        expect(authUrl.searchParams.get("response_type")).toBe("code");
        expect(authUrl.searchParams.get("redirect_uri")).toBe("http://localhost:51823/callback");
        expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
        expect(authUrl.searchParams.get("state")).toBeTruthy();
        expect(authUrl.searchParams.get("code_challenge")).toBeTruthy();

        // Complete the flow so the promise resolves
        const state = extractState();
        await simulateCallback({ code: "test-code", state });
        await loginPromise;
    }, 5000);

    it("completes flow when valid callback received (code + matching state)", async () => {
        const loginPromise = auth.login();
        await waitForPkceSetup();

        const state = extractState();
        await simulateCallback({ code: "valid-code", state });

        await expect(loginPromise).resolves.toBeUndefined();

        // Token exchange should have been called
        expect(http.post).toHaveBeenCalledWith(
            "/v1/auth/token",
            expect.objectContaining({
                grant_type: "authorization_code",
                code: "valid-code",
            }),
            expect.any(Object),
        );
    }, 5000);

    it("rejects when state parameter doesn't match (CSRF protection)", async () => {
        const loginPromise = auth.login();
        await waitForPkceSetup();

        // Send callback with wrong state
        await simulateCallback({ code: "valid-code", state: "wrong-state-value" });

        try {
            await loginPromise;
            expect.unreachable("Should have thrown");
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(CLIError);
            expect((error as CLIError).message).toContain("security mismatch");
        }
    }, 5000);

    it("rejects when no code in callback", async () => {
        const loginPromise = auth.login();
        await waitForPkceSetup();

        const state = extractState();
        // Send callback with state but no code
        await simulateCallback({ state });

        try {
            await loginPromise;
            expect.unreachable("Should have thrown");
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(CLIError);
            expect((error as CLIError).message).toContain("No authorization was received");
        }
    }, 5000);

    // --- Token storage ---

    it("stores access token in keyring after successful exchange", async () => {
        const loginPromise = auth.login();
        await waitForPkceSetup();

        const state = extractState();
        await simulateCallback({ code: "test-code", state });
        await loginPromise;

        const stored = await mockKeyring.get("enkryptify");
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored!);
        expect(parsed.accessToken).toBe("new-access-token-xyz");
        expect(parsed.userId).toBe("user-test-123");
        expect(parsed.email).toBe("test@enkryptify.com");
    }, 5000);

    it("calls config.markAuthenticated() after storing token", async () => {
        const loginPromise = auth.login();
        await waitForPkceSetup();

        const state = extractState();
        await simulateCallback({ code: "test-code", state });
        await loginPromise;

        expect(configManager.markAuthenticated).toHaveBeenCalled();
    }, 5000);

    it("throws CLIError on token exchange failure (non-2xx response)", async () => {
        vi.mocked(http.post).mockImplementation((_url: string) => {
            if (_url === "/v1/auth/token") {
                return Promise.resolve({
                    status: 400,
                    data: { error: "invalid_grant" },
                });
            }
            return Promise.reject(new Error(`Unexpected URL: ${_url}`));
        });

        const loginPromise = auth.login();
        await waitForPkceSetup();

        const state = extractState();
        await simulateCallback({ code: "bad-code", state });

        try {
            await loginPromise;
            expect.unreachable("Should have thrown");
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(CLIError);
            expect((error as CLIError).message).toContain("Could not complete the login");
        }
    }, 5000);

    // --- Expired token re-authentication ---

    it("re-authenticates when stored token is invalid (401 from /v1/me)", async () => {
        await mockKeyring.set("enkryptify", JSON.stringify(FAKE_AUTH_DATA));

        // getUserInfo returns 401 for the old token, 200 for the new one
        vi.mocked(http.get).mockImplementation((_url: string, reqConfig?: AxiosRequestConfig) => {
            if (_url === "/v1/me") {
                const authHeader = (reqConfig?.headers as Record<string, string> | undefined)?.Authorization;
                if (authHeader === `Bearer ${FAKE_TOKEN}`) {
                    return Promise.resolve({ status: 401, data: null });
                }
                return Promise.resolve({
                    status: 200,
                    data: { id: "user-test-123", email: "test@enkryptify.com", name: "Test User" },
                });
            }
            return Promise.reject(new Error(`Unexpected URL: ${_url}`));
        });

        const loginPromise = auth.login();
        await waitForPkceSetup();

        // Should have started PKCE flow because old token was invalid
        expect(Bun.serve).toHaveBeenCalled();

        const state = extractState();
        await simulateCallback({ code: "re-auth-code", state });
        await loginPromise;

        // New token should be stored
        const stored = await mockKeyring.get("enkryptify");
        const parsed = JSON.parse(stored!);
        expect(parsed.accessToken).toBe("new-access-token-xyz");
    }, 5000);
});
