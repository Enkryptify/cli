import { config } from "@/lib/config";
import { keyring } from "@/lib/keyring";
import { GoogleAuth } from "google-auth-library";
import type { AuthProvider, Credentials, LoginOptions } from "../base/AuthProvider";

type StoredAuthData = {
    accessToken: string;
};

export class GcpAuth implements AuthProvider {
    private readonly PROVIDER_NAME = "gcp";
    private readonly googleAuth: GoogleAuth;

    constructor() {
        this.googleAuth = new GoogleAuth({
            scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        });
    }

    async login(_options?: LoginOptions): Promise<void> {
        try {
            const client = await this.googleAuth.getClient();
            const tokenResponse = await client.getAccessToken();

            if (!tokenResponse?.token) {
                throw new Error("No access token returned from Google");
            }

            const authData: StoredAuthData = {
                accessToken: tokenResponse.token,
            };

            await keyring.set(this.PROVIDER_NAME, JSON.stringify(authData));
            await config.updateProvider(this.PROVIDER_NAME, {});
            console.log("✅ Google Cloud authenticated (ADC)");
            console.log("ℹ️  Using Application Default Credentials from gcloud");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(
                `Google Cloud authentication failed.\n` +
                    `Run:\n  gcloud auth application-default login\n\n` +
                    `Original error: ${message}`,
            );
        }
    }

    async getCredentials(): Promise<Credentials> {
        try {
            const authDataString = await keyring.get(this.PROVIDER_NAME);
            if (authDataString) {
                try {
                    const authData = JSON.parse(authDataString) as StoredAuthData;
                    if (authData?.accessToken) {
                        return { accessToken: authData.accessToken };
                    }
                } catch {
                    throw new Error("could fetch auth the token.");
                }
            }

            const client = await this.googleAuth.getClient();
            const tokenResponse = await client.getAccessToken();

            if (!tokenResponse?.token) {
                throw new Error("No access token returned from Google");
            }

            const authData: StoredAuthData = {
                accessToken: tokenResponse.token,
            };

            await keyring.set(this.PROVIDER_NAME, JSON.stringify(authData));
            return { accessToken: tokenResponse.token };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(
                `Failed to obtain Google access token.\n` +
                    `Run:\n  gcloud auth application-default login\n\n` +
                    `Original error: ${message}`,
            );
        }
    }
}
