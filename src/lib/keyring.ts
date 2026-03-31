import { logger } from "@/lib/logger";

const SERVICE_NAME = "enkryptify-cli";

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

async function loadKeytar(): Promise<KeytarLike> {
    if (_keytar === false) {
        throw new Error(
            "Native keyring (keytar) is not available. " +
                "Please install the 'keytar' native module and ensure your OS keychain service is running " +
                "(e.g. gnome-keyring on Linux, Keychain on macOS).",
        );
    }
    if (_keytar) return _keytar;

    try {
        _keytar = (await import("keytar")) as KeytarLike;
        return _keytar;
    } catch (error: unknown) {
        _keytar = false;
        throw new Error(
            "Native keyring (keytar) is not available. " +
                "Please install the 'keytar' native module and ensure your OS keychain service is running " +
                `(e.g. gnome-keyring on Linux, Keychain on macOS). Reason: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

// ---------------------------------------------------------------------------
// OS keyring – credentials are stored exclusively in the native OS keychain.
// No file-based fallback: if keytar is unavailable, operations will throw.
// ---------------------------------------------------------------------------

class OSKeyring implements Keyring {
    async set(key: string, value: string): Promise<void> {
        const keytar = await loadKeytar();

        try {
            await keytar.setPassword(SERVICE_NAME, key, value);
        } catch (error: unknown) {
            logger.debug(`Keyring set failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    async get(key: string): Promise<string | null> {
        const keytar = await loadKeytar();

        try {
            return await keytar.getPassword(SERVICE_NAME, key);
        } catch (error: unknown) {
            logger.debug(`Keyring get failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    async delete(key: string): Promise<void> {
        const keytar = await loadKeytar();

        try {
            await keytar.deletePassword(SERVICE_NAME, key);
        } catch (error: unknown) {
            logger.debug(`Keyring delete failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    async has(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value !== null;
    }
}

export const keyring = new OSKeyring();
