import { config } from "@/lib/config";
import { GoogleAuth } from "google-auth-library";
import type { AuthProvider, Credentials, LoginOptions } from "../base/AuthProvider";

export class GcpAuth implements AuthProvider {
    private readonly PROVIDER_NAME = "gcp";
    private readonly gcpClient: GoogleAuth;

    constructor() {
        this.gcpClient = new GoogleAuth({
            scopes: [process.env.GCP_SCOPES ?? ""],
        });
    }

    async login(options?: LoginOptions): Promise<void> {
        console.log("Logging in to Google Cloud...", options);

        try {
            const client = await this.gcpClient.getClient();
            const projectId = await this.gcpClient.getProjectId();

            if (typeof client.getAccessToken === "function") {
                await client.getAccessToken();
            }

            console.log("✅ Google Cloud authenticated");
            console.log("Project:", projectId);

            await config.updateProvider(this.PROVIDER_NAME, {});
        } catch (err: unknown) {
            console.error("❌ Google Cloud authentication failed");
            console.error(
                "Make sure you are logged in by running:\n" +
                    "1. gcloud init   \n  2. gcloud auth application-default login \n",
            );
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Google Cloud authentication failed: ${message}`, { cause: err });
        }
    }

    getCredentials(): Promise<Credentials> {
        throw new Error("Method not implemented.");
    }
}
