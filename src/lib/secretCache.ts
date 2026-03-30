import type { Secret } from "@/api/client";
import type { ProjectConfig } from "@/lib/config";
import { CLIError } from "@/lib/errors";
import { keyring } from "@/lib/keyring";

const CACHE_TTL_MS = 10_000; // 10 seconds
const CACHE_KEY_PREFIX = "secret-cache:";

type CacheEntry = {
    secrets: Secret[];
    timestamp: number;
};

type CacheOptions = {
    noCache?: boolean;
    offline?: boolean;
};

export type CacheReason = "ttl" | "offline" | "fallback";

type CacheResult = {
    secrets: Secret[];
    fromCache: boolean;
    cacheReason?: CacheReason;
};

function buildCacheKey(workspaceSlug: string, projectSlug: string, environmentKey: string): string {
    return `${CACHE_KEY_PREFIX}${workspaceSlug}/${projectSlug}/${environmentKey}`;
}

function encode(entry: CacheEntry): string {
    const json = JSON.stringify(entry);
    return btoa(json);
}

function decode(encoded: string): CacheEntry | null {
    try {
        const json = atob(encoded);
        return JSON.parse(json) as CacheEntry;
    } catch {
        return null;
    }
}

async function readCache(key: string): Promise<CacheEntry | null> {
    try {
        const raw = await keyring.get(key);
        if (!raw) return null;
        return decode(raw);
    } catch {
        return null;
    }
}

async function writeCache(key: string, secrets: Secret[]): Promise<void> {
    try {
        const entry: CacheEntry = { secrets, timestamp: Date.now() };
        await keyring.set(key, encode(entry));
    } catch {
        // Keyring unavailable; silently degrade
    }
}

export async function fetchSecretsWithCache(
    config: ProjectConfig,
    runOptions: { env?: string; project?: string },
    cacheOptions: CacheOptions,
    fetcher: () => Promise<Secret[]>,
): Promise<CacheResult> {
    const workspaceSlug = config.workspace_slug ?? "";
    const projectSlug = runOptions.project ?? config.project_slug ?? "";
    const environmentKey = runOptions.env ?? config.environment_id ?? "";
    const cacheKey = buildCacheKey(workspaceSlug, projectSlug, environmentKey);

    // --skip-cache: skip cache entirely, always fetch fresh
    if (cacheOptions.noCache) {
        const secrets = await fetcher();
        return { secrets, fromCache: false };
    }

    // --offline: use cache only, never fetch
    if (cacheOptions.offline) {
        const cached = await readCache(cacheKey);
        if (!cached) {
            throw new CLIError(
                "No cached secrets available.",
                "You're in offline mode but no secrets have been cached yet.",
                'Run "ek run" at least once while online to populate the cache.',
            );
        }
        return { secrets: cached.secrets, fromCache: true, cacheReason: "offline" };
    }

    // Normal mode: check TTL, fetch if stale, fallback to cache on error
    const cached = await readCache(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return { secrets: cached.secrets, fromCache: true, cacheReason: "ttl" };
    }

    try {
        const secrets = await fetcher();
        await writeCache(cacheKey, secrets);
        return { secrets, fromCache: false };
    } catch (error) {
        // API failed; fall back to any cached data regardless of age
        if (cached) {
            return { secrets: cached.secrets, fromCache: true, cacheReason: "fallback" };
        }
        // No cache available; re-throw
        throw error;
    }
}
