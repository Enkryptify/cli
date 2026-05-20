import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { InMemoryKeyring } from "../helpers/mock-keyring";
import { FAKE_AUTH_DATA, FAKE_SECRETS } from "../helpers/fixtures";

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
    },
}));

vi.mock("@/lib/analytics", () => ({
    analytics: {
        trackCommand: vi.fn(),
    },
}));

vi.mock("@/lib/config", () => ({
    config: {
        clearAuthentication: vi.fn(),
    },
}));

vi.mock("@/api/httpClient", () => ({
    default: {
        post: vi.fn(),
    },
}));

import http from "@/api/httpClient";
import { registerLogoutCommand } from "@/cmd/logout";
import { analytics, type CommandTracker } from "@/lib/analytics";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

describe("logout command", () => {
    let trackerSuccess: ReturnType<typeof vi.fn<(properties?: Record<string, unknown>) => void>>;
    let trackerError: ReturnType<typeof vi.fn<(error: unknown) => void>>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockKeyring.reset();

        trackerSuccess = vi.fn<(properties?: Record<string, unknown>) => void>();
        trackerError = vi.fn<(error: unknown) => void>();
        vi.mocked(analytics.trackCommand).mockReturnValue({
            success: trackerSuccess,
            error: trackerError,
        } satisfies CommandTracker);
        vi.mocked(http.post).mockResolvedValue({ status: 200, data: {} });
        vi.mocked(config.clearAuthentication).mockResolvedValue(undefined);
    });

    it("clears auth and cached secrets from the unified secure store", async () => {
        await mockKeyring.set(
            "enkryptify",
            JSON.stringify({
                version: 1,
                auth: FAKE_AUTH_DATA,
                secretCache: {
                    "secret-cache:test-workspace/test-project/env-test-123": {
                        secrets: FAKE_SECRETS,
                        timestamp: 1700000000000,
                    },
                },
            }),
        );

        const program = new Command();
        registerLogoutCommand(program);
        await program.parseAsync(["node", "ek", "logout"]);

        expect(http.post).toHaveBeenCalledWith("/v1/auth/cli/logout", {});
        expect(await mockKeyring.get("enkryptify")).toBeNull();
        expect(config.clearAuthentication).toHaveBeenCalledOnce();
        expect(trackerSuccess).toHaveBeenCalledOnce();
        expect(trackerError).not.toHaveBeenCalled();
    });

    it("does not call logout API when no auth exists", async () => {
        const program = new Command();
        registerLogoutCommand(program);
        await program.parseAsync(["node", "ek", "logout"]);

        expect(http.post).not.toHaveBeenCalled();
        expect(config.clearAuthentication).not.toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith("You are not logged in.");
        expect(trackerSuccess).toHaveBeenCalledOnce();
    });
});
