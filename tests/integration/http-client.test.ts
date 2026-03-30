import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { HttpResponse, http } from "msw";
import { InMemoryKeyring } from "../helpers/mock-keyring";
import { FAKE_AUTH_DATA } from "../helpers/fixtures";
import { CLIError } from "@/lib/errors";

const mockKeyring = new InMemoryKeyring();

vi.mock("@/lib/keyring", () => ({
    keyring: {
        get: (...args: unknown[]) => mockKeyring.get(...(args as [string])),
        set: (...args: unknown[]) => mockKeyring.set(...(args as [string, string])),
        delete: (...args: unknown[]) => mockKeyring.delete(...(args as [string])),
        has: (...args: unknown[]) => mockKeyring.has(...(args as [string])),
    },
}));

vi.mock("@/lib/logger");

import { createAuthenticatedHttpClient } from "@/lib/sharedHttpClient";

const BASE_URL = "http://localhost:9876";

const server = setupServer();

function createClient() {
    return createAuthenticatedHttpClient({
        baseURL: BASE_URL,
        keyringKey: "enkryptify",
        authHeaderName: "Authorization",
        authHeaderPrefix: "Bearer ",
    });
}

describe("createAuthenticatedHttpClient (integration)", () => {
    beforeAll(() => {
        server.listen({ onUnhandledRequest: "bypass" });
    });

    afterAll(() => {
        server.close();
    });

    beforeEach(() => {
        mockKeyring.reset();
    });

    afterEach(() => {
        server.resetHandlers();
    });

    // --- Request interceptor tests ---

    it("adds Authorization header from keyring", async () => {
        mockKeyring.seed({ enkryptify: JSON.stringify(FAKE_AUTH_DATA) });

        let capturedHeaders: Headers | null = null;
        server.use(
            http.get(`${BASE_URL}/test`, ({ request }) => {
                capturedHeaders = request.headers;
                return HttpResponse.json({ ok: true });
            }),
        );

        const client = createClient();
        await client.get("/test");

        expect(capturedHeaders).not.toBeNull();
        expect(capturedHeaders!.get("authorization")).toBeTruthy();
    });

    it("prepends 'Bearer ' prefix to token", async () => {
        mockKeyring.seed({ enkryptify: JSON.stringify(FAKE_AUTH_DATA) });

        let capturedHeaders: Headers | null = null;
        server.use(
            http.get(`${BASE_URL}/test`, ({ request }) => {
                capturedHeaders = request.headers;
                return HttpResponse.json({ ok: true });
            }),
        );

        const client = createClient();
        await client.get("/test");

        expect(capturedHeaders).not.toBeNull();
        expect(capturedHeaders!.get("authorization")).toBe(`Bearer ${FAKE_AUTH_DATA.accessToken}`);
    });

    it("skips auth when keyring is empty", async () => {
        let capturedHeaders: Headers | null = null;
        server.use(
            http.get(`${BASE_URL}/test`, ({ request }) => {
                capturedHeaders = request.headers;
                return HttpResponse.json({ ok: true });
            }),
        );

        const client = createClient();
        await client.get("/test");

        expect(capturedHeaders).not.toBeNull();
        expect(capturedHeaders!.get("authorization")).toBeNull();
    });

    it("continues when keyring contains invalid JSON", async () => {
        mockKeyring.seed({ enkryptify: "not-valid-json{{{" });

        let capturedHeaders: Headers | null = null;
        server.use(
            http.get(`${BASE_URL}/test`, ({ request }) => {
                capturedHeaders = request.headers;
                return HttpResponse.json({ ok: true });
            }),
        );

        const client = createClient();
        const response = await client.get("/test");

        expect(response.status).toBe(200);
        expect(capturedHeaders!.get("authorization")).toBeNull();
    });

    it("does not overwrite an existing auth header", async () => {
        mockKeyring.seed({ enkryptify: JSON.stringify(FAKE_AUTH_DATA) });

        let capturedHeaders: Headers | null = null;
        server.use(
            http.get(`${BASE_URL}/test`, ({ request }) => {
                capturedHeaders = request.headers;
                return HttpResponse.json({ ok: true });
            }),
        );

        const client = createClient();
        await client.get("/test", {
            headers: { Authorization: "Bearer existing-token" },
        });

        expect(capturedHeaders).not.toBeNull();
        expect(capturedHeaders!.get("authorization")).toBe("Bearer existing-token");
    });

    // --- Response interceptor tests ---

    it("maps 401 to CLIError with auth message", async () => {
        server.use(
            http.get(`${BASE_URL}/test`, () => {
                return HttpResponse.json({ error: "unauthorized" }, { status: 401 });
            }),
        );

        const client = createClient();
        await expect(client.get("/test")).rejects.toThrow(CLIError);
        await expect(client.get("/test")).rejects.toThrow("Authentication failed.");
    });

    it("maps 403 to CLIError with access denied message", async () => {
        server.use(
            http.get(`${BASE_URL}/test`, () => {
                return HttpResponse.json({ error: "forbidden" }, { status: 403 });
            }),
        );

        const client = createClient();
        await expect(client.get("/test")).rejects.toThrow(CLIError);
        await expect(client.get("/test")).rejects.toThrow("Access denied.");
    });

    it("maps 404 to CLIError with not found message", async () => {
        server.use(
            http.get(`${BASE_URL}/test`, () => {
                return HttpResponse.json({ error: "not found" }, { status: 404 });
            }),
        );

        const client = createClient();
        await expect(client.get("/test")).rejects.toThrow(CLIError);
        await expect(client.get("/test")).rejects.toThrow("The requested resource was not found.");
    });

    it("maps 500 to CLIError with server error message", async () => {
        server.use(
            http.get(`${BASE_URL}/test`, () => {
                return HttpResponse.json({ error: "internal" }, { status: 500 });
            }),
        );

        const client = createClient();
        await expect(client.get("/test")).rejects.toThrow(CLIError);
        await expect(client.get("/test")).rejects.toThrow("The Enkryptify server encountered an error.");
    });

    it("maps network error to CLIError", async () => {
        server.use(
            http.get(`${BASE_URL}/test`, () => {
                return HttpResponse.error();
            }),
        );

        const client = createClient();
        await expect(client.get("/test")).rejects.toThrow(CLIError);
        await expect(client.get("/test")).rejects.toThrow("Could not connect to the Enkryptify API.");
    });

    it("maps missing response to CLIError", async () => {
        server.use(
            http.get(`${BASE_URL}/test-missing`, () => {
                return HttpResponse.error();
            }),
        );

        const client = createClient();
        await expect(client.get("/test-missing")).rejects.toThrow(CLIError);
        await expect(client.get("/test-missing")).rejects.toThrow("Could not connect to the Enkryptify API.");
    });

    it("passes through unmapped status codes (e.g. 422)", async () => {
        server.use(
            http.get(`${BASE_URL}/test`, () => {
                return HttpResponse.json({ error: "unprocessable" }, { status: 422 });
            }),
        );

        const client = createClient();
        try {
            await client.get("/test");
            expect.unreachable("Should have thrown");
        } catch (error: unknown) {
            expect(error).not.toBeInstanceOf(CLIError);
            expect((error as { response?: { status?: number } }).response?.status).toBe(422);
        }
    });

    it("passes successful responses through unmodified", async () => {
        server.use(
            http.get(`${BASE_URL}/test`, () => {
                return HttpResponse.json({ data: "hello", count: 42 });
            }),
        );

        const client = createClient();
        const response = await client.get("/test");

        expect(response.status).toBe(200);
        expect(response.data).toEqual({ data: "hello", count: 42 });
    });
});
