import { config as configManager } from "@/lib/config.js";
import { keyring } from "@/lib/keyring.js";
import type { AuthProvider, Credentials, LoginOptions } from "@/providers/base/AuthProvider.js";
import http from "@/providers/enkryptfiy/httpClient.js";
import { createHash, randomBytes } from "crypto";
import open from "open";
import { URL } from "url";

type UserInfo = {
    id: string;
    email: string;
    name: string;
};

type AuthResponse = {
    accessToken: string;
    tokenType: string;
    expiresIn: number;
};

function base64Url(buf: Buffer) {
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+/g, "");
}

export class EnkryptifyAuth implements AuthProvider {
    private readonly PROVIDER_NAME = "enkryptify";
    private readonly CLIENT_ID = "enkryptify-cli";
    private readonly REDIRECT_URL = "http://localhost:51823/callback";
    private readonly CALLBACK_PORT = 51823;
    private readonly DEFAULT_SCOPES = "openid profile email secrets:read secrets:write";

    async login(options?: LoginOptions): Promise<void> {
        let envToken: string | undefined;

        try {
            const creds = await this.getCredentials();
            envToken = creds.accessToken;
        } catch (error) {
            console.warn("No credentials found, continuing with login flow...");
            envToken = undefined;
        }

        if (envToken) {
            if (options?.force) {
                console.log("Force flag is set, deleting environment token...");
                await keyring.delete(this.PROVIDER_NAME);
            } else {
                const isAuth = await this.getUserInfo(envToken).catch(() => false);
                if (isAuth) {
                    console.log("Already authenticated. Use --force to re-authenticate.");

                    await configManager.updateProvider(this.PROVIDER_NAME, {});
                    return;
                } else {
                    await keyring.delete(this.PROVIDER_NAME);
                }
            }
        }

        const codeVerifier = base64Url(randomBytes(32));
        const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
        const state = base64Url(randomBytes(32));

        const authResponse = await this.runPkceFlow({
            codeVerifier,
            codeChallenge,
            state,
            signal: (options as any)?.signal,
        });

        const userInfo = await this.getUserInfo(authResponse.accessToken);
        if (!userInfo) {
            throw new Error("Failed to fetch user info after authentication");
        }

        await this.markAuthenticated(authResponse.accessToken, userInfo);
    }

    private async runPkceFlow(params: {
        codeVerifier: string;
        codeChallenge: string;
        state: string;
        signal?: AbortSignal;
    }): Promise<AuthResponse> {
        const { codeVerifier, codeChallenge, state, signal } = params;

        return new Promise<AuthResponse>((resolve, reject) => {
            const self = this;

            if (signal?.aborted) {
                reject(new Error("Login cancelled by user"));
                return;
            }

            const abortHandler = () => {
                fail(new Error("Login cancelled by user"));
            };
            signal?.addEventListener("abort", abortHandler);
            let server: ReturnType<typeof Bun.serve> | null = null;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;

            function cleanup() {
                server?.stop();
                if (timeoutId) clearTimeout(timeoutId);
                server = null;
                timeoutId = null;
            }

            function fail(error: Error) {
                cleanup();
                reject(error);
            }

            async function handleCallback(req: Request): Promise<Response> {
                try {
                    const url = new URL(req.url);
                    const error = url.searchParams.get("error");
                    const errorDesc = url.searchParams.get("error_description") || error || "";

                    if (error) {
                        setTimeout(() => {
                            fail(new Error(`authentication error: ${errorDesc}`));
                        }, 1000);
                        return self.authErrorResponse(errorDesc);
                    }

                    if (url.searchParams.get("state") !== state) {
                        setTimeout(() => {
                            fail(new Error("invalid state parameter"));
                        }, 1000);
                        return self.authErrorResponse("Invalid state parameter");
                    }

                    const code = url.searchParams.get("code");
                    if (!code) {
                        setTimeout(() => {
                            fail(new Error("missing authorization code"));
                        }, 1000);
                        return self.authErrorResponse("Missing authorization code");
                    }

                    const authResp = await self.exchangeCodeForToken(code, codeVerifier);

                    setTimeout(() => {
                        cleanup();
                        resolve(authResp);
                    }, 1000);

                    return self.authSuccessResponse();
                } catch (err: any) {
                    setTimeout(() => {
                        fail(err);
                    }, 1000);
                    return new Response("Internal error", { status: 500 });
                }
            }

            server = Bun.serve({
                port: self.CALLBACK_PORT,
                routes: { "/callback": handleCallback },
                fetch: () => new Response("Not Found", { status: 404 }),
            });

            const authUrl = this.buildAuthUrl(codeChallenge, state);
            this.logAuthInstructions(authUrl);

            open(authUrl).catch((err) => {
                console.warn("\n  Failed to open browser. Please open this URL manually:");
                console.warn(authUrl);
                console.warn(String(err));
            });

            timeoutId = setTimeout(
                () => {
                    fail(new Error("authentication timeout"));
                },
                5 * 60 * 1000,
            );
        });
    }

    private buildAuthUrl(codeChallenge: string, state: string): string {
        const authUrl = new URL("/oauth/authorize", "https://app.enkryptify.com");
        authUrl.searchParams.set("client_id", this.CLIENT_ID);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("redirect_uri", this.REDIRECT_URL);
        authUrl.searchParams.set("scope", this.DEFAULT_SCOPES);
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("code_challenge", codeChallenge);
        authUrl.searchParams.set("code_challenge_method", "S256");

        return authUrl.toString();
    }

    private logAuthInstructions(authUrl: string): void {
        console.log("\n🌐 Opening browser for authentication...");
        console.log(`\n   📋 AUTHENTICATION URL:`);
        console.log(`   ${authUrl}\n`);
    }

    private authErrorResponse(message: string): Response {
        return new Response(
            `<html>
          <head><title>Authentication Error</title></head>
          <body style="font-family: Inter, sans-serif; text-align: center; padding: 50px; background-color: #001B1F;">
            <h2 style="color: #E64545;">Authentication Error</h2>
            <p style="color: #F7F7F7;">${message}</p>
            <p style="color: #F7F7F7;">You can close this window and try again.</p>
          </body>
        </html>`,
            { status: 400, headers: { "Content-Type": "text/html" } },
        );
    }

    private authSuccessResponse(): Response {
        return new Response(
            `<html>
          <head><title>Authentication Successful</title></head>
          <body style="font-family: Inter, sans-serif; text-align: center; padding: 50px; background-color: #001B1F;">
            <h2 style="color: #2AC769;">Authentication Successful!</h2>
            <p style="color: #F7F7F7;">You have successfully authenticated with Enkryptify.</p>
            <p style="color: #F7F7F7;">You can now close this window and return to your terminal.</p>
          </body>
        </html>`,
            { status: 200, headers: { "Content-Type": "text/html" } },
        );
    }
    private async exchangeCodeForToken(code: string, codeVerifier: string): Promise<AuthResponse> {
        const payload = {
            grant_type: "authorization_code",
            client_id: this.CLIENT_ID,
            code,
            redirect_uri: this.REDIRECT_URL,
            code_verifier: codeVerifier,
        };

        const res = await http.post<AuthResponse>("/v1/auth/token", payload, {
            validateStatus: () => true,
        });

        if (res.status < 200 || res.status >= 300) {
            const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
            throw new Error(`token exchange failed with status ${res.status}: ${text}`);
        }

        const data = res.data as AuthResponse;
        if (!data.accessToken) {
            throw new Error("token exchange response missing accessToken");
        }

        return data;
    }

    private async markAuthenticated(accessToken: string, user: UserInfo): Promise<void> {
        await keyring.set(this.PROVIDER_NAME, {
            accessToken,
            userId: user.id,
            email: user.email,
        });

        const provider = await configManager.getProvider(this.PROVIDER_NAME);

        await configManager.updateProvider(this.PROVIDER_NAME, {});
    }

    async getUserInfo(token: string): Promise<UserInfo | null> {
        const res = await http.get<UserInfo | string>("/v1/me", {
            headers: {
                "X-API-Key": token,
            },
            validateStatus: () => true,
        });

        if (res.status === 401 || res.status === 403) {
            return null;
        }

        if (res.status < 200 || res.status >= 300) {
            const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
            throw new Error(`failed to get user info, status: ${res.status}, body: ${text}`);
        }

        return res.data as UserInfo;
    }

    async getCredentials(): Promise<Credentials> {
        const authData = await keyring.get(this.PROVIDER_NAME);
        if (!authData || !authData.accessToken) {
            throw new Error('Not authenticated. Please run "ek login enkryptify" first.');
        }

        return { accessToken: authData.accessToken };
    }
}
