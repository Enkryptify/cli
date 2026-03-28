import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Secret } from "@/api/client";

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

import { logger } from "@/lib/logger";
import { buildEnvWithSecrets, isDangerousEnvVar } from "@/lib/inject";

function makeSecret(name: string, value: string): Secret {
    return { id: `s-${name}`, name, value, isPersonal: false, environmentId: "env-test-123" };
}

describe("isDangerousEnvVar", () => {
    beforeEach(() => vi.clearAllMocks());

    it("blocks PATH", () => {
        expect(isDangerousEnvVar("PATH")).toBe(true);
    });

    it("blocks JAVA_TOOL_OPTIONS", () => {
        expect(isDangerousEnvVar("JAVA_TOOL_OPTIONS")).toBe(true);
    });

    it("blocks NODE_OPTIONS", () => {
        expect(isDangerousEnvVar("NODE_OPTIONS")).toBe(true);
    });

    it("blocks HTTP_PROXY (uppercase)", () => {
        expect(isDangerousEnvVar("HTTP_PROXY")).toBe(true);
    });

    it("blocks http_proxy (lowercase, case-insensitive check)", () => {
        expect(isDangerousEnvVar("http_proxy")).toBe(true);
    });

    it("blocks LD_PRELOAD", () => {
        expect(isDangerousEnvVar("LD_PRELOAD")).toBe(true);
    });

    it("blocks DOTNET_STARTUP_HOOKS", () => {
        expect(isDangerousEnvVar("DOTNET_STARTUP_HOOKS")).toBe(true);
    });

    it("blocks GIT_SSH_COMMAND", () => {
        expect(isDangerousEnvVar("GIT_SSH_COMMAND")).toBe(true);
    });

    it("blocks PROMPT_COMMAND", () => {
        expect(isDangerousEnvVar("PROMPT_COMMAND")).toBe(true);
    });

    it("allows normal secret names", () => {
        expect(isDangerousEnvVar("MY_APP_SECRET")).toBe(false);
        expect(isDangerousEnvVar("DATABASE_URL")).toBe(false);
        expect(isDangerousEnvVar("API_KEY")).toBe(false);
    });

    it("returns false for empty/invalid input", () => {
        expect(isDangerousEnvVar("")).toBe(false);
    });
});

describe("buildEnvWithSecrets", () => {
    beforeEach(() => vi.clearAllMocks());

    // --- Basic injection ---

    it("injects secrets into env", () => {
        const secrets = [makeSecret("DB_URL", "postgres://localhost"), makeSecret("API_KEY", "sk-123")];
        const { env, injectedCount, skippedSecrets } = buildEnvWithSecrets(secrets);

        expect(env.DB_URL).toBe("postgres://localhost");
        expect(env.API_KEY).toBe("sk-123");
        expect(injectedCount).toBe(2);
        expect(skippedSecrets).toEqual([]);
    });

    // --- Stats / counts ---

    it("returns correct injectedCount and skippedSecrets", () => {
        const secrets = [makeSecret("DB_URL", "value"), makeSecret("PATH", "/bad"), makeSecret("API_KEY", "key")];
        const { injectedCount, skippedSecrets } = buildEnvWithSecrets(secrets);

        expect(injectedCount).toBe(2);
        expect(skippedSecrets).toEqual(["PATH"]);
    });

    // --- Dangerous env var blocking ---

    it("skips dangerous env vars by default", () => {
        const secrets = [makeSecret("JAVA_TOOL_OPTIONS", "-agentlib:jdwp")];
        const { env, injectedCount, skippedSecrets } = buildEnvWithSecrets(secrets);

        expect(env.JAVA_TOOL_OPTIONS).toBeUndefined();
        expect(injectedCount).toBe(0);
        expect(skippedSecrets).toEqual(["JAVA_TOOL_OPTIONS"]);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("JAVA_TOOL_OPTIONS"));
    });

    it("allows dangerous env vars with allowDangerousVars option", () => {
        const secrets = [makeSecret("NODE_OPTIONS", "--require=evil.js")];
        const { env, injectedCount } = buildEnvWithSecrets(secrets, { allowDangerousVars: true });

        expect(env.NODE_OPTIONS).toBe("--require=evil.js");
        expect(injectedCount).toBe(1);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining("Protected environment variable checks are disabled"),
        );
    });

    // --- Carriage return warning ---

    it("warns about \\r in secret values but still injects", () => {
        const secrets = [makeSecret("TOKEN", "value\rwith\rcr")];
        const { env, injectedCount } = buildEnvWithSecrets(secrets);

        expect(env.TOKEN).toBe("value\rwith\rcr");
        expect(injectedCount).toBe(1);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("carriage return"));
    });

    it("does not warn for normal values without \\r", () => {
        const secrets = [makeSecret("NORMAL", "just-a-value")];
        buildEnvWithSecrets(secrets);

        expect(logger.warn).not.toHaveBeenCalled();
    });

    it("does not warn for values with \\n only (no \\r)", () => {
        const secrets = [makeSecret("PRIVATE_KEY", "-----BEGIN-----\nkey-data\n-----END-----")];
        buildEnvWithSecrets(secrets);

        expect(logger.warn).not.toHaveBeenCalled();
    });

    // --- Null byte filtering ---

    it("skips secrets with null bytes in name", () => {
        const secrets = [makeSecret("BAD\0NAME", "value")];
        const { injectedCount, skippedSecrets } = buildEnvWithSecrets(secrets);

        expect(injectedCount).toBe(0);
        expect(skippedSecrets).toEqual(["BAD\0NAME"]);
    });

    it("skips secrets with null bytes in value", () => {
        const secrets = [makeSecret("KEY", "val\0ue")];
        const { injectedCount, skippedSecrets } = buildEnvWithSecrets(secrets);

        expect(injectedCount).toBe(0);
        expect(skippedSecrets).toEqual(["KEY"]);
    });

    // --- Prefix mode ---

    it("prefixes secret names with --prefix option", () => {
        const secrets = [makeSecret("DB_URL", "postgres://localhost"), makeSecret("API_KEY", "sk-123")];
        const { env } = buildEnvWithSecrets(secrets, { prefix: "EK_" });

        expect(env.EK_DB_URL).toBe("postgres://localhost");
        expect(env.EK_API_KEY).toBe("sk-123");
        // Original names should not be set (unless they were in process.env)
        expect(env.DB_URL).toBeUndefined();
        expect(env.API_KEY).toBeUndefined();
    });

    it("does not prefix without --prefix option", () => {
        const secrets = [makeSecret("DB_URL", "postgres://localhost")];
        const { env } = buildEnvWithSecrets(secrets);

        expect(env.DB_URL).toBe("postgres://localhost");
    });

    it("checks dangerous var against original name (not prefixed)", () => {
        const secrets = [makeSecret("PATH", "/evil")];
        const { skippedSecrets } = buildEnvWithSecrets(secrets, { prefix: "EK_" });

        // PATH should still be blocked even with prefix
        expect(skippedSecrets).toEqual(["PATH"]);
    });
});
