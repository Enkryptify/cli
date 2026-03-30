import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIError } from "@/lib/errors";
import { FAKE_PROJECT_CONFIG, FAKE_SECRETS } from "../helpers/fixtures";

vi.mock("@/lib/logger", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
        stderr: {
            info: vi.fn(),
            warn: vi.fn(),
            success: vi.fn(),
        },
    },
}));

vi.mock("@/api/client", () => ({
    client: {
        run: vi.fn(),
    },
}));

vi.mock("@/lib/secretCache", () => ({
    fetchSecretsWithCache: vi.fn(),
}));

import { logger } from "@/lib/logger";
import { fetchSecretsWithCache } from "@/lib/secretCache";
import { runCommand } from "@/cmd/run";

describe("runCommand (integration)", () => {
    let mockSpawn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();

        mockSpawn = vi.fn(() => ({
            exited: Promise.resolve(0),
        }));

        vi.stubGlobal("Bun", {
            spawn: mockSpawn,
        });

        vi.mocked(fetchSecretsWithCache).mockResolvedValue({
            secrets: FAKE_SECRETS,
            fromCache: false,
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    // --- Core wiring ---

    it("passes config and options to fetchSecretsWithCache", async () => {
        await runCommand(FAKE_PROJECT_CONFIG, ["echo", "hi"], {
            env: "staging",
            project: "custom-proj",
            noCache: true,
            offline: false,
        });

        expect(fetchSecretsWithCache).toHaveBeenCalledOnce();
        const [config, runOpts, cacheOpts, fetcher] = vi.mocked(fetchSecretsWithCache).mock.calls[0]!;
        expect(config).toBe(FAKE_PROJECT_CONFIG);
        expect(runOpts).toEqual({ env: "staging", project: "custom-proj" });
        expect(cacheOpts).toEqual({ noCache: true, offline: false });
        expect(typeof fetcher).toBe("function");
    });

    it("injects secrets into Bun.spawn env (DATABASE_URL present)", async () => {
        await runCommand(FAKE_PROJECT_CONFIG, ["echo", "hello"]);

        expect(mockSpawn).toHaveBeenCalledOnce();
        const spawnArgs = mockSpawn.mock.calls[0]!;
        const spawnOpts = spawnArgs[1];
        expect(spawnOpts.env.DATABASE_URL).toBe("postgres://localhost:5432/db");
        expect(spawnOpts.env.API_KEY).toBe("sk-test-abc123");
        expect(spawnOpts.env.JWT_SECRET).toBe("super-secret-jwt-key");
    });

    it("passes command and args to Bun.spawn", async () => {
        await runCommand(FAKE_PROJECT_CONFIG, ["node", "server.js", "--port", "3000"]);

        expect(mockSpawn).toHaveBeenCalledOnce();
        const spawnArgs = mockSpawn.mock.calls[0]!;
        expect(spawnArgs[0]).toEqual(["node", "server.js", "--port", "3000"]);
    });

    it("inherits stdin/stdout/stderr in Bun.spawn", async () => {
        await runCommand(FAKE_PROJECT_CONFIG, ["echo", "test"]);

        const spawnOpts = mockSpawn.mock.calls[0]![1];
        expect(spawnOpts.stdin).toBe("inherit");
        expect(spawnOpts.stdout).toBe("inherit");
        expect(spawnOpts.stderr).toBe("inherit");
    });

    it("calls unmountSpinner before Bun.spawn", async () => {
        const callOrder: string[] = [];
        const unmountSpinner = vi.fn(() => callOrder.push("unmount"));
        mockSpawn.mockImplementation(() => {
            callOrder.push("spawn");
            return { exited: Promise.resolve(0) };
        });

        await runCommand(FAKE_PROJECT_CONFIG, ["echo"], { unmountSpinner });

        expect(unmountSpinner).toHaveBeenCalledOnce();
        expect(callOrder).toEqual(["unmount", "spawn"]);
    });

    // --- Error handling ---

    it("throws CLIError when cmd is empty array", async () => {
        await expect(runCommand(FAKE_PROJECT_CONFIG, [])).rejects.toThrow(CLIError);
    });

    it("throws CLIError when subprocess exits non-zero", async () => {
        mockSpawn.mockReturnValue({ exited: Promise.resolve(1) });

        await expect(runCommand(FAKE_PROJECT_CONFIG, ["false"])).rejects.toThrow(CLIError);
        await expect(runCommand(FAKE_PROJECT_CONFIG, ["false"])).rejects.toThrow("exited with code 1");
    });

    it("returns successfully when subprocess exits 0", async () => {
        mockSpawn.mockReturnValue({ exited: Promise.resolve(0) });

        await expect(runCommand(FAKE_PROJECT_CONFIG, ["true"])).resolves.toBeUndefined();
    });

    // --- Dangerous env vars ---

    it("does not pass PATH to Bun.spawn env", async () => {
        vi.mocked(fetchSecretsWithCache).mockResolvedValue({
            secrets: [
                ...FAKE_SECRETS,
                {
                    id: "s-bad",
                    name: "PATH",
                    value: "/malicious/path",
                    isPersonal: false,
                    environmentId: "env-test-123",
                },
            ],
            fromCache: false,
        });

        await runCommand(FAKE_PROJECT_CONFIG, ["echo"]);

        const spawnEnv = mockSpawn.mock.calls[0]![1].env;
        // PATH should be the original process.env.PATH, not the injected malicious one
        expect(spawnEnv.PATH).not.toBe("/malicious/path");
    });

    // --- Cache logging ---

    it("logs fallback warning when cache used due to API error", async () => {
        vi.mocked(fetchSecretsWithCache).mockResolvedValue({
            secrets: FAKE_SECRETS,
            fromCache: true,
            cacheReason: "fallback",
        });

        await runCommand(FAKE_PROJECT_CONFIG, ["echo"]);

        expect(logger.stderr.warn).toHaveBeenCalledWith(expect.stringContaining("Could not reach the Enkryptify API"));
    });

    it("logs cached info when secrets from TTL cache", async () => {
        vi.mocked(fetchSecretsWithCache).mockResolvedValue({
            secrets: FAKE_SECRETS,
            fromCache: true,
            cacheReason: "ttl",
        });

        await runCommand(FAKE_PROJECT_CONFIG, ["echo"]);

        expect(logger.stderr.info).toHaveBeenCalledWith(expect.stringContaining("Using cached secrets"));
    });
});
