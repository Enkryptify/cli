import { config } from "@/lib/config";
import { keyring } from "@/lib/keyring";
import { createClient } from "@1password/sdk";
import type { AuthProvider, Credentials, LoginOptions } from "../base/AuthProvider";

export class OnePasswordAuth implements AuthProvider {
    private readonly PROVIDER_NAME = "onePassword";

    constructor() {}

    async login(options?: LoginOptions): Promise<void> {
        try {
            const token = options?.key;

            if (!token || !token.trim()) {
                throw new Error("No 1Password service account token provided.");
            }

            const client = await createClient({
                auth: token,
                integrationName: "My 1Password Integration",
                integrationVersion: "v1.0.0",
            });

            const vaults = await client.vaults.list();
            console.log("✅ 1Password SDK authentication successful");
            console.log(`Accessible vaults: ${vaults.length}`);

            await keyring.set(this.PROVIDER_NAME, token);
            await config.updateProvider(this.PROVIDER_NAME, {});
        } catch (error: unknown) {
            console.error("❌ 1Password authentication failed", error instanceof Error ? error.message : String(error));
            throw new Error("❌ Invalid 1Password service account token", { cause: error });
        }
    }

    async getCredentials(): Promise<Credentials> {
        try {
            const token = await keyring.get(this.PROVIDER_NAME);

            if (!token || !token.trim()) {
                throw new Error(`Not authenticated. Please run "ek login --provider ${this.PROVIDER_NAME}" first.`);
            }

            return {
                token,
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to retrieve 1Password credentials: ${message}`, { cause: error });
        }
    }
}
