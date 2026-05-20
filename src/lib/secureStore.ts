import type { Secret } from "@/api/client";
import { keyring } from "@/lib/keyring";

export const SECURE_STORE_KEY = "enkryptify";
export const SECURE_STORE_VERSION = 1;

export type StoredAuthData = {
    accessToken: string;
    userId: string;
    email: string;
};

export type StoredSecretCacheEntry = {
    secrets: Secret[];
    timestamp: number;
};

type SecureStoreData = {
    version: 1;
    auth?: StoredAuthData;
    secretCache?: Record<string, StoredSecretCacheEntry>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredAuthData(value: unknown): value is StoredAuthData {
    return (
        isRecord(value) &&
        typeof value.accessToken === "string" &&
        typeof value.userId === "string" &&
        typeof value.email === "string"
    );
}

function parseStore(raw: string | null): { store: SecureStoreData; legacyAuth: boolean } {
    if (!raw) {
        return { store: { version: SECURE_STORE_VERSION }, legacyAuth: false };
    }

    try {
        const parsed: unknown = JSON.parse(raw);

        if (isStoredAuthData(parsed)) {
            return { store: { version: SECURE_STORE_VERSION, auth: parsed }, legacyAuth: true };
        }

        if (isRecord(parsed) && parsed.version === SECURE_STORE_VERSION) {
            return { store: parsed as SecureStoreData, legacyAuth: false };
        }
    } catch {
        // Corrupted secure-store data is treated as empty and overwritten
        // by the next successful auth/cache write.
    }

    return { store: { version: SECURE_STORE_VERSION }, legacyAuth: false };
}

async function readStore(options: { upgradeLegacy?: boolean } = {}): Promise<SecureStoreData> {
    const raw = await keyring.get(SECURE_STORE_KEY);
    const { store, legacyAuth } = parseStore(raw);

    if (options.upgradeLegacy && legacyAuth) {
        await writeStore(store);
    }

    return store;
}

async function writeStore(store: SecureStoreData): Promise<void> {
    await keyring.set(SECURE_STORE_KEY, JSON.stringify(store));
}

async function updateStore(updater: (store: SecureStoreData) => void): Promise<void> {
    const store = await readStore();
    updater(store);
    await writeStore(store);
}

export const secureStore = {
    async getAuth(): Promise<StoredAuthData | null> {
        const store = await readStore({ upgradeLegacy: true });
        return store.auth ?? null;
    },

    async setAuth(auth: StoredAuthData): Promise<void> {
        await updateStore((store) => {
            store.auth = auth;
        });
    },

    async clearAll(): Promise<void> {
        await keyring.delete(SECURE_STORE_KEY);
    },

    async getSecretCacheEntry(cacheKey: string): Promise<StoredSecretCacheEntry | null> {
        const store = await readStore({ upgradeLegacy: true });
        return store.secretCache?.[cacheKey] ?? null;
    },

    async setSecretCacheEntry(cacheKey: string, entry: StoredSecretCacheEntry): Promise<void> {
        await updateStore((store) => {
            store.secretCache = {
                ...(store.secretCache ?? {}),
                [cacheKey]: entry,
            };
        });
    },

    async migrateLegacySecretCacheEntry(
        cacheKey: string,
        decode: (raw: string) => StoredSecretCacheEntry | null,
    ): Promise<StoredSecretCacheEntry | null> {
        try {
            const raw = await keyring.get(cacheKey);
            if (!raw) return null;

            const entry = decode(raw);
            if (!entry) return null;

            await updateStore((store) => {
                store.secretCache = {
                    ...(store.secretCache ?? {}),
                    [cacheKey]: entry,
                };
            });

            await keyring.delete(cacheKey).catch(() => undefined);

            return entry;
        } catch {
            return null;
        }
    },
};
