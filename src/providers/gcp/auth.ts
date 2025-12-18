import { config } from "@/lib/config";
import { GoogleAuth } from "google-auth-library";
import type { AuthProvider, Credentials, LoginOptions } from "../base/AuthProvider";

export class GcpAuth implements AuthProvider {
    private readonly PROVIDER_NAME = "gcp";
    private readonly googleAuth: GoogleAuth;

    constructor() {
        this.googleAuth = new GoogleAuth({
            scopes: [process.env.GCP_SCOPES ?? ""],
        });
    }

    async getAuthClient() {
        try {
            const client = await this.googleAuth.getClient();

            if (!client) {
                throw new Error("GoogleAuth returned no auth client");
            }

            return client;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);

            throw new Error(
                `Failed to initialize Google authentication client. ` +
                    `Make sure you ran:\n` +
                    `  gcloud auth application-default login\n\n` +
                    `Original error: ${message}`,
                { cause: err instanceof Error ? err : undefined },
            );
        }
    }

    async login(options?: LoginOptions): Promise<void> {
        console.log("Logging in to Google Cloud...", options);

        try {
            const client = await this.getAuthClient();
            const projectId = await this.googleAuth.getProjectId();

            if ("getAccessToken" in client) {
                await client.getAccessToken();
            }

            console.log("✅ Google Cloud authenticated");
            console.log("Project:", projectId);

            await config.updateProvider(this.PROVIDER_NAME, {});
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Google Cloud authentication failed: ${message}`);
        }
    }

    getCredentials(): Promise<Credentials> {
        throw new Error("Not implemented");
    }
}
