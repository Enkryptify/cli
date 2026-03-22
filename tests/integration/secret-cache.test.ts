import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryKeyring } from "../helpers/mock-keyring";
import { FAKE_PROJECT_CONFIG, FAKE_SECRETS } from "../helpers/fixtures";
import type { ProjectConfig } from "@/lib/config";
import { CLIError } from "@/lib/errors";

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

import { fetchSecretsWithCache } from "@/lib/secretCache";

describe("fetchSecretsWithCache (integration)", () => {
    let dateNowSpy: ReturnType<typeof vi.spyOn>;
    const NOW = 1700000000000;

    beforeEach(() => {
        mockKeyring.reset();
        dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(NOW);
    });

    afterEach(() => {
        dateNowSpy.mockRestore();
    });

    const defaultRunOptions = {};

    function makeFetcher(secrets = FAKE_SECRETS) {
        return vi.fn().mockResolvedValue(secrets);
    }

    function makeFailingFetcher(error = new Error("API unavailable")) {
        return vi.fn().mockRejectedValue(error);
    }

    // --- noCache mode ---

    it("noCache=true always calls fetcher", async () => {
        const fetcher = makeFetcher();
        await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, { noCache: true }, fetcher);
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it("noCache=true returns fromCache: false", async () => {
        const fetcher = makeFetcher();
        const result = await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, { noCache: true }, fetcher);
        expect(result.fromCache).toBe(false);
        expect(result.secrets).toEqual(FAKE_SECRETS);
    });

    // --- offline mode ---

    it("offline=true returns cached data without calling fetcher", async () => {
        // Pre-populate cache by doing a normal fetch first
        const fetcher = makeFetcher();
        await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, fetcher);

        const fetcher2 = makeFetcher();
        // Advance time past TTL so we know it truly uses cache, not TTL shortcut
        dateNowSpy.mockReturnValue(NOW + 60_000);

        const result = await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, { offline: true }, fetcher2);
        expect(fetcher2).not.toHaveBeenCalled();
        expect(result.secrets).toEqual(FAKE_SECRETS);
        expect(result.fromCache).toBe(true);
    });

    it("offline=true returns cacheReason: 'offline'", async () => {
        const fetcher = makeFetcher();
        await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, fetcher);

        dateNowSpy.mockReturnValue(NOW + 60_000);
        const result = await fetchSecretsWithCache(
            FAKE_PROJECT_CONFIG,
            defaultRunOptions,
            { offline: true },
            makeFetcher(),
        );
        expect(result.cacheReason).toBe("offline");
    });

    it("offline=true throws CLIError when no cache exists", async () => {
        const fetcher = makeFetcher();
        await expect(
            fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, { offline: true }, fetcher),
        ).rejects.toThrow(CLIError);
    });

    // --- Normal mode ---

    it("returns cached data within TTL (<10s)", async () => {
        // Populate cache
        const fetcher = makeFetcher();
        await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, fetcher);

        // Advance time by 5s (within TTL)
        dateNowSpy.mockReturnValue(NOW + 5_000);

        const fetcher2 = makeFetcher();
        const result = await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, fetcher2);
        expect(fetcher2).not.toHaveBeenCalled();
        expect(result.fromCache).toBe(true);
        expect(result.cacheReason).toBe("ttl");
        expect(result.secrets).toEqual(FAKE_SECRETS);
    });

    it("calls fetcher when TTL expired (>10s)", async () => {
        // Populate cache
        const fetcher = makeFetcher();
        await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, fetcher);

        // Advance time past TTL
        dateNowSpy.mockReturnValue(NOW + 11_000);

        const fetcher2 = makeFetcher();
        const result = await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, fetcher2);
        expect(fetcher2).toHaveBeenCalledOnce();
        expect(result.fromCache).toBe(false);
    });

    it("writes fresh data to cache", async () => {
        const fetcher = makeFetcher();
        await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, fetcher);

        // Verify cache was written by reading it back within TTL
        const fetcher2 = makeFetcher();
        const result = await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, fetcher2);
        expect(fetcher2).not.toHaveBeenCalled();
        expect(result.fromCache).toBe(true);
        expect(result.secrets).toEqual(FAKE_SECRETS);
    });

    it("falls back to stale cache on fetch error", async () => {
        // Populate cache
        const fetcher = makeFetcher();
        await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, fetcher);

        // Advance time past TTL
        dateNowSpy.mockReturnValue(NOW + 20_000);

        const failingFetcher = makeFailingFetcher();
        const result = await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, failingFetcher);
        expect(result.fromCache).toBe(true);
        expect(result.secrets).toEqual(FAKE_SECRETS);
    });

    it("returns cacheReason: 'fallback' on API error", async () => {
        // Populate cache
        const fetcher = makeFetcher();
        await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, fetcher);

        // Advance time past TTL
        dateNowSpy.mockReturnValue(NOW + 20_000);

        const failingFetcher = makeFailingFetcher();
        const result = await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, failingFetcher);
        expect(result.cacheReason).toBe("fallback");
    });

    it("re-throws when no cache and fetch fails", async () => {
        const error = new Error("network error");
        const failingFetcher = makeFailingFetcher(error);
        await expect(fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, failingFetcher)).rejects.toThrow(
            "network error",
        );
    });

    // --- Cache key construction ---

    it("uses workspace/project/environment from config", async () => {
        const fetcher = makeFetcher();
        await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, {}, {}, fetcher);

        // Verify the cache is keyed correctly by checking that different config produces a cache miss
        dateNowSpy.mockReturnValue(NOW + 1_000);
        const differentConfig: ProjectConfig = {
            path: "/tmp/other",
            workspace_slug: "other-workspace",
            project_slug: "other-project",
            environment_id: "other-env",
        };
        const fetcher2 = makeFetcher();
        const result = await fetchSecretsWithCache(differentConfig, {}, {}, fetcher2);
        // Different config should miss cache, so fetcher2 should be called
        expect(fetcher2).toHaveBeenCalledOnce();
        expect(result.fromCache).toBe(false);
    });

    it("prefers runOptions over config values", async () => {
        const fetcher = makeFetcher();
        await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, { env: "custom-env", project: "custom-project" }, {}, fetcher);

        // Reading from cache within TTL should only work with same runOptions
        const fetcher2 = makeFetcher();
        const result = await fetchSecretsWithCache(
            FAKE_PROJECT_CONFIG,
            { env: "custom-env", project: "custom-project" },
            {},
            fetcher2,
        );
        expect(fetcher2).not.toHaveBeenCalled();
        expect(result.fromCache).toBe(true);

        // Different runOptions should miss cache
        const fetcher3 = makeFetcher();
        const result2 = await fetchSecretsWithCache(
            FAKE_PROJECT_CONFIG,
            { env: "different-env", project: "different-project" },
            {},
            fetcher3,
        );
        expect(fetcher3).toHaveBeenCalledOnce();
        expect(result2.fromCache).toBe(false);
    });

    // --- Encode/decode round-trip ---

    it("secrets survive encode/decode round-trip (write then read)", async () => {
        const fetcher = makeFetcher();
        await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, fetcher);

        // Read back within TTL
        const fetcher2 = makeFetcher();
        const result = await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, fetcher2);
        expect(result.secrets).toEqual(FAKE_SECRETS);
        expect(result.secrets).toHaveLength(FAKE_SECRETS.length);
        for (let i = 0; i < FAKE_SECRETS.length; i++) {
            expect(result.secrets[i]!.id).toBe(FAKE_SECRETS[i]!.id);
            expect(result.secrets[i]!.name).toBe(FAKE_SECRETS[i]!.name);
            expect(result.secrets[i]!.value).toBe(FAKE_SECRETS[i]!.value);
        }
    });

    // --- Corrupted cache ---

    it("corrupted cache data returns null (does not crash)", async () => {
        // Manually write garbage into the keyring at the expected cache key
        const cacheKey = `secret-cache:${FAKE_PROJECT_CONFIG.workspace_slug}/${FAKE_PROJECT_CONFIG.project_slug}/${FAKE_PROJECT_CONFIG.environment_id}`;
        await mockKeyring.set(cacheKey, "not-valid-base64-!!!@@@");

        // Should treat corrupted cache as a miss and call fetcher
        const fetcher = makeFetcher();
        const result = await fetchSecretsWithCache(FAKE_PROJECT_CONFIG, defaultRunOptions, {}, fetcher);
        expect(fetcher).toHaveBeenCalledOnce();
        expect(result.fromCache).toBe(false);
        expect(result.secrets).toEqual(FAKE_SECRETS);
    });
});
