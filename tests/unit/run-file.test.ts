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
import { replaceVariables } from "@/cmd/run-file";

function makeSecret(name: string, value: string): Secret {
    return { id: `s-${name}`, name, value, isPersonal: false, environmentId: "env-test-123" };
}

describe("replaceVariables — CRLF protection", () => {
    beforeEach(() => vi.clearAllMocks());

    it("strips \\r from substituted values (CRLF → LF)", () => {
        const secrets = [makeSecret("TOKEN", "test\r\nvalue")];
        const result = replaceVariables("key=${TOKEN}", secrets);
        expect(result).toBe("key=test\nvalue");
    });

    it("strips standalone \\r from substituted values", () => {
        const secrets = [makeSecret("TOKEN", "test\rJAVA_TOOL_OPTIONS=-agent\rLOGGING=http://evil")];
        const result = replaceVariables("key=${TOKEN}", secrets);
        expect(result).toBe("key=testJAVA_TOOL_OPTIONS=-agentLOGGING=http://evil");
    });

    it("preserves \\n in substituted values (private keys, certs)", () => {
        const secrets = [makeSecret("KEY", "-----BEGIN-----\ndata\n-----END-----")];
        const result = replaceVariables("cert=${KEY}", secrets);
        expect(result).toBe("cert=-----BEGIN-----\ndata\n-----END-----");
    });

    it("does not modify values without \\r", () => {
        const secrets = [makeSecret("NORMAL", "just-a-value")];
        const result = replaceVariables("x=${NORMAL}", secrets);
        expect(result).toBe("x=just-a-value");
    });

    it("strips \\r from multiple different secrets in same template", () => {
        const secrets = [makeSecret("A", "val\r1"), makeSecret("B", "val\r2")];
        const result = replaceVariables("${A} and ${B}", secrets);
        expect(result).toBe("val1 and val2");
    });
});

describe("replaceVariables — dangerous var name warnings", () => {
    beforeEach(() => vi.clearAllMocks());

    it("warns when substituting a dangerous variable name", () => {
        const secrets = [makeSecret("PATH", "/some/path")];
        const result = replaceVariables("p=${PATH}", secrets);

        // Value is still substituted (templates are explicit)
        expect(result).toBe("p=/some/path");
        expect(logger.stderr.warn).toHaveBeenCalledWith(expect.stringContaining("protected environment variable"));
    });

    it("warns for NODE_OPTIONS", () => {
        const secrets = [makeSecret("NODE_OPTIONS", "--max-old-space-size=4096")];
        replaceVariables("opts=${NODE_OPTIONS}", secrets);

        expect(logger.stderr.warn).toHaveBeenCalledWith(expect.stringContaining("NODE_OPTIONS"));
    });

    it("does not warn for normal variable names", () => {
        const secrets = [makeSecret("DATABASE_URL", "postgres://localhost")];
        replaceVariables("db=${DATABASE_URL}", secrets);

        expect(logger.stderr.warn).not.toHaveBeenCalledWith(expect.stringContaining("protected"));
    });

    it("suppresses dangerous var warning with allowDangerousVars option", () => {
        const secrets = [makeSecret("PATH", "/some/path")];
        const result = replaceVariables("p=${PATH}", secrets, { allowDangerousVars: true });

        expect(result).toBe("p=/some/path");
        expect(logger.stderr.warn).not.toHaveBeenCalledWith(expect.stringContaining("protected"));
    });
});
