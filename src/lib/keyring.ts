import * as keytar from "keytar";

const SERVICE_NAME = "enkryptify-cli";

export interface Keyring {
    set(key: string, value: any): Promise<void>;
    get(key: string): Promise<any | null>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
}

class OSKeyring implements Keyring {
    async set(key: string, value: any): Promise<void> {
        const serialized = JSON.stringify(value);
        await keytar.setPassword(SERVICE_NAME, key, serialized);
    }

    async get(key: string): Promise<any | null> {
        try {
            const serialized = await keytar.getPassword(SERVICE_NAME, key);
            if (!serialized) {
                return null;
            }
            return JSON.parse(serialized);
        } catch (error) {
            return null;
        }
    }

    async delete(key: string): Promise<void> {
        try {
            await keytar.deletePassword(SERVICE_NAME, key);
        } catch (error) {
            // Ignore if key doesn't exist
        }
    }

    async has(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value !== null;
    }
}

export const keyring = new OSKeyring();
