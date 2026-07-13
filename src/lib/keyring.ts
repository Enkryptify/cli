import { logger } from "@/lib/logger";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type * as KeytarModule from "keytar";

const SERVICE_NAME = "enkryptify-cli";
const STORE_PATH = process.env.ENKRYPTIFY_STORE_PATH ?? path.join(os.homedir(), ".enkryptify", "secure-store.json");

export interface Keyring {
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
}

class OSKeyring implements Keyring {
    private keytar?: Promise<typeof KeytarModule>;

    private load(): Promise<typeof KeytarModule> {
        this.keytar ??= import("keytar");
        return this.keytar;
    }

    async set(key: string, value: string): Promise<void> {
        await (await this.load()).setPassword(SERVICE_NAME, key, value);
    }

    async get(key: string): Promise<string | null> {
        return (await this.load()).getPassword(SERVICE_NAME, key);
    }

    async delete(key: string): Promise<void> {
        await (await this.load()).deletePassword(SERVICE_NAME, key);
    }

    async has(key: string): Promise<boolean> {
        return (await this.get(key)) !== null;
    }
}

class FileKeyring implements Keyring {
    private async read(): Promise<Record<string, string>> {
        try {
            const raw = await fs.readFile(STORE_PATH, "utf8");
            const parsed: unknown = JSON.parse(raw);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

            return Object.fromEntries(
                Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
            );
        } catch (error: unknown) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
            logger.debug(
                `File credential store read failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return {};
        }
    }

    private async write(data: Record<string, string>): Promise<void> {
        const directory = path.dirname(STORE_PATH);
        const temporaryPath = `${STORE_PATH}.${process.pid}.tmp`;
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        await fs.chmod(directory, 0o700);
        await fs.writeFile(temporaryPath, JSON.stringify(data), { mode: 0o600 });
        await fs.rename(temporaryPath, STORE_PATH);
        await fs.chmod(STORE_PATH, 0o600);
    }

    async set(key: string, value: string): Promise<void> {
        await this.write({ ...(await this.read()), [key]: value });
    }

    async get(key: string): Promise<string | null> {
        return (await this.read())[key] ?? null;
    }

    async delete(key: string): Promise<void> {
        const data = await this.read();
        delete data[key];
        if (Object.keys(data).length === 0) {
            await fs.rm(STORE_PATH, { force: true });
            return;
        }
        await this.write(data);
    }

    async has(key: string): Promise<boolean> {
        return (await this.get(key)) !== null;
    }
}

class FallbackKeyring implements Keyring {
    private readonly os = new OSKeyring();
    private readonly file = new FileKeyring();
    private active: Keyring | undefined = process.env.ENKRYPTIFY_STORE_PATH ? this.file : undefined;

    private async run<T>(operation: (store: Keyring) => Promise<T>): Promise<T> {
        if (this.active) return operation(this.active);
        try {
            const result = await operation(this.os);
            this.active = this.os;
            return result;
        } catch (error: unknown) {
            logger.debug(`OS keyring unavailable: ${error instanceof Error ? error.message : String(error)}`);
            logger.warn("OS keyring unavailable; using the protected file credential store.");
            this.active = this.file;
            return operation(this.file);
        }
    }

    set(key: string, value: string): Promise<void> {
        return this.run((store) => store.set(key, value));
    }

    get(key: string): Promise<string | null> {
        return this.run((store) => store.get(key));
    }

    delete(key: string): Promise<void> {
        return this.run((store) => store.delete(key));
    }

    has(key: string): Promise<boolean> {
        return this.run((store) => store.has(key));
    }
}

export const keyring = new FallbackKeyring();
