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
    config: { markAuthenticated: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/api/httpClient", () => ({
    default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("open", () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import http from "@/api/httpClient";
import { config as configManager } from "@/lib/config";
import { logger } from "@/lib/logger";
import open from "open";
import { Auth } from "@/api/auth";

const DEVICE_RESPONSE = {
    deviceCode: "device-code-with-at-least-thirty-two-characters",
    userCode: "ABCDE-12345",
    verificationUri: "https://app.enkryptify.com/oauth/device",
    verificationUriComplete: "https://app.enkryptify.com/oauth/device?user_code=ABCDE-12345",
    expiresIn: 300,
    interval: 0,
};

const TOKEN_RESPONSE = { accessToken: "new-access-token-xyz", tokenType: "Bearer", expiresIn: 28800 };

describe("Auth.login() device flow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockKeyring.reset();

        vi.mocked(http.get).mockImplementation((_url: string, config?: AxiosRequestConfig) => {
            if (_url !== "/v1/me") return Promise.reject(new Error(`Unexpected URL: ${_url}`));
            const authorization = (config?.headers as Record<string, string> | undefined)?.Authorization;
            if (!authorization) return Promise.resolve({ status: 401, data: null });
            return Promise.resolve({
                status: 200,
                data: { id: "user-test-123", email: "test@enkryptify.com", name: "Test User" },
            });
        });

        let polls = 0;
        vi.mocked(http.post).mockImplementation((_url: string) => {
            if (_url === "/v1/auth/device/code") return Promise.resolve({ status: 200, data: DEVICE_RESPONSE });
            if (_url === "/v1/auth/device/token") {
                polls += 1;
                return polls === 1
                    ? Promise.resolve({ status: 400, data: { error: "authorization_pending" } })
                    : Promise.resolve({ status: 200, data: TOKEN_RESPONSE });
            }
            return Promise.reject(new Error(`Unexpected URL: ${_url}`));
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("skips device authentication when a valid token exists", async () => {
        await mockKeyring.set("enkryptify", JSON.stringify(FAKE_AUTH_DATA));

        await new Auth().login();

        expect(http.post).not.toHaveBeenCalled();
        expect(configManager.markAuthenticated).toHaveBeenCalledOnce();
    });

    it("opens the verification URL, polls, and stores the approved token", async () => {
        await new Auth().login();

        expect(open).toHaveBeenCalledWith(DEVICE_RESPONSE.verificationUriComplete);
        expect(logger.info).toHaveBeenCalledWith(`Verification code: ${DEVICE_RESPONSE.userCode}`);
        expect(http.post).toHaveBeenCalledWith(
            "/v1/auth/device/token",
            { clientId: "enkryptify-cli", deviceCode: DEVICE_RESPONSE.deviceCode },
            expect.any(Object),
        );
        const stored = JSON.parse((await mockKeyring.get("enkryptify"))!);
        expect(stored.auth).toEqual({
            accessToken: TOKEN_RESPONSE.accessToken,
            userId: "user-test-123",
            email: "test@enkryptify.com",
        });
        expect(configManager.markAuthenticated).toHaveBeenCalledOnce();
    });

    it("continues when the browser cannot be opened", async () => {
        vi.mocked(open).mockRejectedValueOnce(new Error("no browser"));

        await expect(new Auth().login()).resolves.toBeUndefined();
        await Promise.resolve();

        expect(logger.warn).toHaveBeenCalledWith(
            "Failed to open browser automatically.",
            expect.objectContaining({ fix: expect.stringContaining(DEVICE_RESPONSE.verificationUriComplete) }),
        );
    });

    it("fails when device authorization is denied", async () => {
        vi.mocked(http.post).mockImplementation((_url: string) => {
            if (_url === "/v1/auth/device/code") return Promise.resolve({ status: 200, data: DEVICE_RESPONSE });
            return Promise.resolve({ status: 400, data: { error: "access_denied" } });
        });

        await expect(new Auth().login()).rejects.toThrow("denied");
    });

    it("fails when the device code expires", async () => {
        vi.mocked(http.post).mockImplementation((_url: string) => {
            if (_url === "/v1/auth/device/code") return Promise.resolve({ status: 200, data: DEVICE_RESPONSE });
            return Promise.resolve({ status: 400, data: { error: "expired_token" } });
        });

        await expect(new Auth().login()).rejects.toThrow("timed out");
    });

    it("forces a new device flow when requested", async () => {
        await mockKeyring.set("enkryptify", JSON.stringify(FAKE_AUTH_DATA));

        await new Auth().login({ force: true });

        expect(http.post).toHaveBeenCalledWith(
            "/v1/auth/device/code",
            { clientId: "enkryptify-cli" },
            expect.any(Object),
        );
        const stored = JSON.parse((await mockKeyring.get("enkryptify"))!);
        expect(stored.auth.accessToken).toBe(TOKEN_RESPONSE.accessToken);
    });

    it("re-authenticates when the stored token is invalid", async () => {
        await mockKeyring.set("enkryptify", JSON.stringify(FAKE_AUTH_DATA));
        vi.mocked(http.get).mockImplementation((_url: string, config?: AxiosRequestConfig) => {
            const authorization = (config?.headers as Record<string, string> | undefined)?.Authorization;
            if (authorization === `Bearer ${FAKE_TOKEN}`) return Promise.resolve({ status: 401, data: null });
            return Promise.resolve({
                status: 200,
                data: { id: "user-test-123", email: "test@enkryptify.com", name: "Test User" },
            });
        });

        await new Auth().login();

        const stored = JSON.parse((await mockKeyring.get("enkryptify"))!);
        expect(stored.auth.accessToken).toBe(TOKEN_RESPONSE.accessToken);
    });

    it("reports a device-code creation failure", async () => {
        vi.mocked(http.post).mockResolvedValueOnce({ status: 503, data: {} });

        await expect(new Auth().login()).rejects.toBeInstanceOf(CLIError);
    });
});
