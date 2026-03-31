import { logger } from "@/lib/logger";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const SERVICE_NAME = "enkryptify-cli";
const CREDENTIALS_FILE = path.join(os.homedir(), ".enkryptify", "credentials.json");

export interface Keyring {
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Lazy keytar loader – avoids top-level import so the native .node addon
// (which dlopen's libsecret on Linux) is only loaded when actually needed.
// ---------------------------------------------------------------------------

type KeytarLike = {
    getPassword(service: string, account: string): Promise<string | null>;
    setPassword(service: string, account: string, password: string): Promise<void>;
    deletePassword(service: string, account: string): Promise<boolean>;
};

let _keytar: KeytarLike | false | undefined;

async function loadKeytar(): Promise<KeytarLike | null> {
    if (_keytar === false) return null;
    if (_keytar) return _keytar;

    try {
        _keytar = (await import("keytar")) as KeytarLike;
        return _keytar;
    } catch (error: unknown) {
        logger.debug(
            `Native keyring unavailable, using file-based credential storage: ${error instanceof Error ? error.message : String(error)}`,
        );
        _keytar = false;
        return null;
    }
}

// ---------------------------------------------------------------------------
// File-based credential storage – fallback for environments without a native
// keychain (headless Linux, Docker, CI, etc.).
// Credentials are stored in ~/.enkryptify/credentials.json with 0600 perms.
// ---------------------------------------------------------------------------

type CredentialStore = Record<string, Record<string, string>>;

async function readCredentialFile(): Promise<CredentialStore> {
    try {
        const data = await fs.readFile(CREDENTIALS_FILE, "utf-8");
        return JSON.parse(data) as CredentialStore;
    } catch {
        return {};
    }
}

async function writeCredentialFile(store: CredentialStore): Promise<void> {
    const dir = path.dirname(CREDENTIALS_FILE);
    await fs.mkdir(dir, { recursive: true });
    const tempFile = `${CREDENTIALS_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(store, null, 2), { mode: 0o600 });
    await fs.rename(tempFile, CREDENTIALS_FILE);
}

class FileKeyring implements Keyring {
    async set(key: string, value: string): Promise<void> {
        const store = await readCredentialFile();
        if (!store[SERVICE_NAME]) store[SERVICE_NAME] = {};
        store[SERVICE_NAME][key] = value;
        await writeCredentialFile(store);
    }

    async get(key: string): Promise<string | null> {
        const store = await readCredentialFile();
        return store[SERVICE_NAME]?.[key] ?? null;
    }

    async delete(key: string): Promise<void> {
        const store = await readCredentialFile();
        if (store[SERVICE_NAME]) {
            delete store[SERVICE_NAME][key];
            await writeCredentialFile(store);
        }
    }

    async has(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value !== null;
    }
}

// ---------------------------------------------------------------------------
// OS keyring with automatic fallback to file-based storage
// ---------------------------------------------------------------------------

const fileKeyring = new FileKeyring();

class OSKeyring implements Keyring {
    async set(key: string, value: string): Promise<void> {
        const keytar = await loadKeytar();
        if (!keytar) return fileKeyring.set(key, value);

        try {
            await keytar.setPassword(SERVICE_NAME, key, value);
        } catch (error: unknown) {
            logger.debug(`Keyring set failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    async get(key: string): Promise<string | null> {
        const keytar = await loadKeytar();
        if (!keytar) return fileKeyring.get(key);

        try {
            return await keytar.getPassword(SERVICE_NAME, key);
        } catch (error: unknown) {
            logger.debug(`Keyring get failed: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    async delete(key: string): Promise<void> {
        const keytar = await loadKeytar();
        if (!keytar) return fileKeyring.delete(key);

        try {
            await keytar.deletePassword(SERVICE_NAME, key);
        } catch (error: unknown) {
            logger.debug(`Keyring delete failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async has(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value !== null;
    }
}

export const keyring = new OSKeyring();
