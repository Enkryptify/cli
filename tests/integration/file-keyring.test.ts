import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn() },
}));

describe("file credential store", () => {
    let temporaryDirectory: string;
    let storePath: string;

    beforeEach(async () => {
        temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "enkryptify-store-"));
        storePath = path.join(temporaryDirectory, "credentials", "secure-store.json");
        process.env.ENKRYPTIFY_STORE_PATH = storePath;
        vi.resetModules();
    });

    afterEach(async () => {
        delete process.env.ENKRYPTIFY_STORE_PATH;
        await fs.rm(temporaryDirectory, { recursive: true, force: true });
    });

    it("stores credentials with owner-only permissions", async () => {
        const { keyring } = await import("@/lib/keyring");

        await keyring.set("enkryptify", "secret-value");

        await expect(keyring.get("enkryptify")).resolves.toBe("secret-value");
        expect((await fs.stat(path.dirname(storePath))).mode & 0o777).toBe(0o700);
        expect((await fs.stat(storePath)).mode & 0o777).toBe(0o600);
    });

    it("removes the fallback file when its final value is deleted", async () => {
        const { keyring } = await import("@/lib/keyring");
        await keyring.set("enkryptify", "secret-value");

        await keyring.delete("enkryptify");

        await expect(fs.stat(storePath)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("treats a corrupted fallback file as empty", async () => {
        await fs.mkdir(path.dirname(storePath), { recursive: true });
        await fs.writeFile(storePath, JSON.stringify({ enkryptify: 123 }));
        const { keyring } = await import("@/lib/keyring");

        await expect(keyring.get("enkryptify")).resolves.toBeNull();
    });
});
