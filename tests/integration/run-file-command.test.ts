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
import { runFileCommand, replaceVariables } from "@/cmd/run-file";

describe("runFileCommand (integration)", () => {
    let mockFile: ReturnType<typeof vi.fn>;
    let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();

        mockFile = vi.fn(() => ({
            exists: () => Promise.resolve(true),
            text: () => Promise.resolve("DB is ${DATABASE_URL} and key is ${API_KEY}"),
        }));

        vi.stubGlobal("Bun", {
            file: mockFile,
        });

        stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(((_chunk, encoding, callback) => {
            const done = typeof encoding === "function" ? encoding : callback;
            done?.();
            return true;
        }) as typeof process.stdout.write);

        vi.mocked(fetchSecretsWithCache).mockResolvedValue({
            secrets: FAKE_SECRETS,
            fromCache: false,
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        stdoutWriteSpy.mockRestore();
        vi.restoreAllMocks();
    });

    // --- Core variable replacement (real replaceVariables, not mocked) ---

    it("replaces ${DATABASE_URL} with secret value in output", async () => {
        mockFile.mockReturnValue({
            exists: () => Promise.resolve(true),
            text: () => Promise.resolve("conn=${DATABASE_URL}"),
        });

        await runFileCommand(FAKE_PROJECT_CONFIG, "/tmp/template.txt");

        expect(stdoutWriteSpy.mock.calls[0]?.[0]).toBe("conn=postgres://localhost:5432/db");
    });

    it("replaces multiple variables in one file", async () => {
        mockFile.mockReturnValue({
            exists: () => Promise.resolve(true),
            text: () => Promise.resolve("DB=${DATABASE_URL}\nKEY=${API_KEY}\nJWT=${JWT_SECRET}"),
        });

        await runFileCommand(FAKE_PROJECT_CONFIG, "/tmp/template.txt");

        const output = stdoutWriteSpy.mock.calls[0]![0];
        expect(output).toContain("postgres://localhost:5432/db");
        expect(output).toContain("sk-test-abc123");
        expect(output).toContain("super-secret-jwt-key");
    });

    it("leaves ${UNKNOWN_VAR} unchanged and warns on stderr", async () => {
        mockFile.mockReturnValue({
            exists: () => Promise.resolve(true),
            text: () => Promise.resolve("value=${UNKNOWN_VAR}"),
        });

        await runFileCommand(FAKE_PROJECT_CONFIG, "/tmp/template.txt");

        const output = stdoutWriteSpy.mock.calls[0]![0];
        expect(output).toContain("${UNKNOWN_VAR}");
        expect(logger.stderr.warn).toHaveBeenCalledWith(expect.stringContaining("UNKNOWN_VAR"));
    });

    it("outputs processed content to stdout (not stderr)", async () => {
        await runFileCommand(FAKE_PROJECT_CONFIG, "/tmp/template.txt");

        expect(stdoutWriteSpy).toHaveBeenCalledOnce();
        const output = stdoutWriteSpy.mock.calls[0]![0] as string;
        // Should contain replaced values
        expect(output).toContain("postgres://localhost:5432/db");
    });

    it("throws CLIError when file doesn't exist", async () => {
        mockFile.mockReturnValue({
            exists: () => Promise.resolve(false),
            text: () => Promise.reject(new Error("ENOENT")),
        });

        await expect(runFileCommand(FAKE_PROJECT_CONFIG, "/tmp/nonexistent.txt")).rejects.toThrow(CLIError);
        await expect(runFileCommand(FAKE_PROJECT_CONFIG, "/tmp/nonexistent.txt")).rejects.toThrow("File not found");
    });

    it("works with empty file (no variables)", async () => {
        mockFile.mockReturnValue({
            exists: () => Promise.resolve(true),
            text: () => Promise.resolve(""),
        });

        await runFileCommand(FAKE_PROJECT_CONFIG, "/tmp/empty.txt");

        expect(stdoutWriteSpy.mock.calls[0]?.[0]).toBe("");
    });

    it("handles secrets with empty string values (replaces with empty)", async () => {
        vi.mocked(fetchSecretsWithCache).mockResolvedValue({
            secrets: [{ id: "s1", name: "EMPTY_VAR", value: "", isPersonal: false, environmentId: "env-test-123" }],
            fromCache: false,
        });

        mockFile.mockReturnValue({
            exists: () => Promise.resolve(true),
            text: () => Promise.resolve("before${EMPTY_VAR}after"),
        });

        await runFileCommand(FAKE_PROJECT_CONFIG, "/tmp/template.txt");

        expect(stdoutWriteSpy.mock.calls[0]?.[0]).toBe("beforeafter");
    });
});

// --- replaceVariables unit tests (real function, no mocks) ---

describe("replaceVariables", () => {
    it("replaces known variables and preserves unknown ones", () => {
        const result = replaceVariables("host=${DATABASE_URL} missing=${NOPE}", FAKE_SECRETS);
        expect(result).toContain("postgres://localhost:5432/db");
        expect(result).toContain("${NOPE}");
    });

    it("handles content with no variables", () => {
        const result = replaceVariables("no variables here", FAKE_SECRETS);
        expect(result).toBe("no variables here");
    });

    it("replaces same variable used multiple times", () => {
        const result = replaceVariables("${API_KEY} and again ${API_KEY}", FAKE_SECRETS);
        expect(result).toBe("sk-test-abc123 and again sk-test-abc123");
    });
});
