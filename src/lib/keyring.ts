import * as keytar from "keytar";

const SERVICE_NAME = "enkryptify-cli";

export interface Keyring {
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
}

class OSKeyring implements Keyring {
    async set(key: string, value: string): Promise<void> {
        await keytar.setPassword(SERVICE_NAME, key, value);
    }

    async get(key: string): Promise<string | null> {
        try {
            const value = await keytar.getPassword(SERVICE_NAME, key);
            return value;
        } catch (error: unknown) {
            console.warn(error instanceof Error ? error.message : String(error));
            return null;
        }
    }

    async delete(key: string): Promise<void> {
        try {
            await keytar.deletePassword(SERVICE_NAME, key);
        } catch (error: unknown) {
            console.warn(error instanceof Error ? error.message : String(error));
        }
    }

    async has(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value !== null;
    }
}

export const keyring = new OSKeyring();
