import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
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

vi.mock("@/lib/config", () => ({
    config: {
        findProjectConfig: vi.fn(),
    },
}));

vi.mock("@/lib/analytics", () => ({
    analytics: {
        trackCommand: vi.fn(),
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

vi.mock("@/ui/RunFlow", () => ({
    RunFlow: vi.fn(async ({ run }) => {
        await run(vi.fn());
    }),
}));

import { analytics, type CommandTracker } from "@/lib/analytics";
import { registerRunCommand } from "@/cmd/run";
import { registerRunFileCommand } from "@/cmd/run-file";
import { config } from "@/lib/config";
import { fetchSecretsWithCache } from "@/lib/secretCache";

describe("command fast exits", () => {
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
    let tracker: CommandTracker;
    let trackerSuccess: ReturnType<typeof vi.fn<(properties?: Record<string, unknown>) => void>>;
    let trackerError: ReturnType<typeof vi.fn<(error: unknown) => void>>;

    beforeEach(() => {
        vi.clearAllMocks();

        trackerSuccess = vi.fn<(properties?: Record<string, unknown>) => void>();
        trackerError = vi.fn<(error: unknown) => void>();
        tracker = {
            success: trackerSuccess,
            error: trackerError,
        };

        vi.mocked(analytics.trackCommand).mockReturnValue(tracker);
        vi.mocked(config.findProjectConfig).mockResolvedValue(FAKE_PROJECT_CONFIG);
        vi.mocked(fetchSecretsWithCache).mockResolvedValue({
            secrets: FAKE_SECRETS,
            fromCache: false,
        });

        vi.stubGlobal("Bun", {
            spawn: vi.fn(() => ({
                exited: Promise.resolve(0),
            })),
            file: vi.fn(() => ({
                exists: () => Promise.resolve(true),
                text: () => Promise.resolve("key=${API_KEY}"),
            })),
        });

        exitSpy = vi.spyOn(process, "exit").mockImplementation(((_code?: number) => undefined) as never);
        stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(((_chunk, encoding, callback) => {
            const done = typeof encoding === "function" ? encoding : callback;
            done?.();
            return true;
        }) as typeof process.stdout.write);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        exitSpy.mockRestore();
        stdoutWriteSpy.mockRestore();
        vi.restoreAllMocks();
    });

    it("exits immediately after a successful run command", async () => {
        const program = new Command();
        registerRunCommand(program);

        await expect(program.parseAsync(["node", "ek", "run", "env"])).resolves.toBe(program);
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(trackerSuccess).toHaveBeenCalledOnce();
        expect(trackerError).not.toHaveBeenCalled();
    });

    it("exits immediately after a successful run-file command", async () => {
        const program = new Command();
        registerRunFileCommand(program);

        await expect(program.parseAsync(["node", "ek", "run-file", "--file", "/tmp/template.txt"])).resolves.toBe(
            program,
        );
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(stdoutWriteSpy.mock.calls[0]?.[0]).toBe("key=sk-test-abc123");
        expect(trackerSuccess).toHaveBeenCalledOnce();
        expect(trackerError).not.toHaveBeenCalled();
    });
});
