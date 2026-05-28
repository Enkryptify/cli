import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryKeyring } from "../helpers/mock-keyring";
import { FAKE_AUTH_DATA, FAKE_SECRETS } from "../helpers/fixtures";

const mockKeyring = new InMemoryKeyring();

vi.mock("@/lib/keyring", () => {
    return {
        keyring: {
            get: (...args: unknown[]) => mockKeyring.get(...(args as [string])),
            set: (...args: unknown[]) => mockKeyring.set(...(args as [string, string])),
            delete: (...args: unknown[]) => mockKeyring.delete(...(args as [string])),
            has: (...args: unknown[]) => mockKeyring.has(...(args as [string])),
        },
    };
});

vi.mock("@/lib/logger");

import { secureStore } from "@/lib/secureStore";

function encodeLegacyCache(value: unknown): string {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

describe("secureStore", () => {
    beforeEach(() => {
        mockKeyring.reset();
    });

    it("stores auth in the unified versioned item", async () => {
        await secureStore.setAuth(FAKE_AUTH_DATA);

        const raw = await mockKeyring.get("enkryptify");
        expect(JSON.parse(raw!)).toEqual({
            version: 1,
            auth: FAKE_AUTH_DATA,
        });
    });

    it("preserves secret cache when auth is updated", async () => {
        await secureStore.setSecretCacheEntry("secret-cache:test-workspace/test-project/env-test-123", {
            secrets: FAKE_SECRETS,
            timestamp: 1700000000000,
        });

        await secureStore.setAuth(FAKE_AUTH_DATA);

        const raw = await mockKeyring.get("enkryptify");
        expect(JSON.parse(raw!)).toEqual({
            version: 1,
            auth: FAKE_AUTH_DATA,
            secretCache: {
                "secret-cache:test-workspace/test-project/env-test-123": {
                    secrets: FAKE_SECRETS,
                    timestamp: 1700000000000,
                },
            },
        });
    });

    it("preserves auth when secret cache is updated", async () => {
        await secureStore.setAuth(FAKE_AUTH_DATA);

        await secureStore.setSecretCacheEntry("secret-cache:test-workspace/test-project/env-test-123", {
            secrets: FAKE_SECRETS,
            timestamp: 1700000000000,
        });

        const auth = await secureStore.getAuth();
        expect(auth).toEqual(FAKE_AUTH_DATA);
    });

    it("upgrades legacy auth-only JSON in place when read", async () => {
        await mockKeyring.set("enkryptify", JSON.stringify(FAKE_AUTH_DATA));

        const auth = await secureStore.getAuth();

        expect(auth).toEqual(FAKE_AUTH_DATA);
        const raw = await mockKeyring.get("enkryptify");
        expect(JSON.parse(raw!)).toEqual({
            version: 1,
            auth: FAKE_AUTH_DATA,
        });
    });

    it("treats corrupted unified JSON as empty and overwrites it on the next write", async () => {
        await mockKeyring.set("enkryptify", "not-valid-json{{{");

        await expect(secureStore.getAuth()).resolves.toBeNull();
        await secureStore.setAuth(FAKE_AUTH_DATA);

        const raw = await mockKeyring.get("enkryptify");
        expect(JSON.parse(raw!)).toEqual({
            version: 1,
            auth: FAKE_AUTH_DATA,
        });
    });

    it("leaves legacy per-cache keychain items untouched", async () => {
        // The unified store no longer reads or migrates legacy per-key items,
        // so any leftover legacy entry stays exactly as-is (never accessed).
        const cacheKey = "secret-cache:test-workspace/test-project/env-test-123";
        const legacy = encodeLegacyCache({ secrets: FAKE_SECRETS, timestamp: 1700000000000 });
        await mockKeyring.set(cacheKey, legacy);

        await expect(secureStore.getSecretCacheEntry(cacheKey)).resolves.toBeNull();
        expect(await mockKeyring.get(cacheKey)).toBe(legacy);
    });
});
