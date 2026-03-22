import type { Keyring } from "@/lib/keyring";

export class InMemoryKeyring implements Keyring {
    private store = new Map<string, string>();

    async set(key: string, value: string): Promise<void> {
        this.store.set(key, value);
    }

    async get(key: string): Promise<string | null> {
        return this.store.get(key) ?? null;
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key);
    }

    async has(key: string): Promise<boolean> {
        return this.store.has(key);
    }

    reset(): void {
        this.store.clear();
    }

    seed(entries: Record<string, string>): void {
        for (const [key, value] of Object.entries(entries)) {
            this.store.set(key, value);
        }
    }
}
