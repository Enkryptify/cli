import { env } from "@/env";
import { config as configManager } from "@/lib/config";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { keyring } from "@/lib/keyring";
import http from "@/api/httpClient";
import { createHash, randomBytes } from "crypto";
import open from "open";
import { URL } from "url";

export type Credentials = {
    [key: string]: string;
};

export type LoginOptions = {
    force?: boolean;
};

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

type StoredAuthData = {
    accessToken: string;
    userId: string;
    email: string;
};

function base64Url(buf: Buffer) {
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+/g, "");
}

export class Auth {
    private readonly KEYRING_KEY = "enkryptify";
    private readonly CLIENT_ID = "enkryptify-cli";
    private readonly REDIRECT_URL = "http://localhost:51823/callback";
    private readonly CALLBACK_PORT = 51823;
    private readonly DEFAULT_SCOPES = "openid profile email secrets:read secrets:write";

    async login(options?: LoginOptions): Promise<void> {
        let envToken: string | undefined;

        try {
            const creds = await this.getCredentials();
            envToken = creds.accessToken;
        } catch (error: unknown) {
            logger.debug(error instanceof Error ? error.message : String(error));
            envToken = undefined;
        }

        if (envToken) {
            if (options?.force) {
                await keyring.delete(this.KEYRING_KEY);
            } else {
                const isAuth = await this.getUserInfo(envToken).catch(() => false);
                if (isAuth) {
                    logger.info('Already logged in. Use "ek login --force" to re-authenticate with a different account.');

                    await configManager.markAuthenticated();
                    return;
                } else {
                    await keyring.delete(this.KEYRING_KEY);
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
        });

        const userInfo = await this.getUserInfo(authResponse.accessToken);
        if (!userInfo) {
            throw new CLIError(
                "Could not retrieve your account information.",
                "Authentication succeeded but the server failed to return your profile.",
                'Try running "ek login" again.',
            );
        }

        await this.markAuthenticated(authResponse.accessToken, userInfo);
    }

    private async runPkceFlow(params: {
        codeVerifier: string;
        codeChallenge: string;
        state: string;
    }): Promise<AuthResponse> {
        const { codeVerifier, codeChallenge, state } = params;

        return new Promise<AuthResponse>((resolve, reject) => {
            const self = this;
            let server: ReturnType<typeof Bun.serve> | null = null;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;

            function cleanup() {
                void server?.stop();
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
                            fail(new CLIError(`Authentication failed: ${errorDesc}`));
                        }, 1000);
                        return self.authErrorResponse(errorDesc);
                    }

                    if (url.searchParams.get("state") !== state) {
                        setTimeout(() => {
                            fail(new CLIError(
                                "Authentication failed due to a security mismatch.",
                                "The authentication response could not be verified. This can happen if the login session expired.",
                                'Run "ek login" to try again.',
                            ));
                        }, 1000);
                        return self.authErrorResponse("Invalid state parameter");
                    }

                    const code = url.searchParams.get("code");
                    if (!code) {
                        setTimeout(() => {
                            fail(new CLIError(
                                "Authentication failed. No authorization was received.",
                                "The browser did not return a valid authorization code. You may have denied access or the flow was interrupted.",
                                'Run "ek login" to try again.',
                            ));
                        }, 1000);
                        return self.authErrorResponse("Missing authorization code");
                    }

                    const authResp = await self.exchangeCodeForToken(code, codeVerifier);

                    setTimeout(() => {
                        cleanup();
                        resolve(authResp);
                    }, 1000);

                    return self.authSuccessResponse();
                } catch (err: unknown) {
                    setTimeout(() => {
                        fail(err instanceof Error ? err : new Error(String(err)));
                    }, 1000);
                    return new Response("Internal error", { status: 500 });
                }
            }

            try {
                server = Bun.serve({
                    port: self.CALLBACK_PORT,
                    routes: { "/callback": handleCallback },
                    fetch: () => new Response("Not Found", { status: 404 }),
                });
            } catch {
                reject(
                    new CLIError(
                        "Could not start the login server.",
                        `Port ${self.CALLBACK_PORT} is already in use by another application.`,
                        "Close the application using that port and try again.",
                    ),
                );
                return;
            }

            const authUrl = this.buildAuthUrl(codeChallenge, state);
            this.logAuthInstructions(authUrl);

            open(authUrl).catch((openErr: unknown) => {
                logger.warn("Failed to open browser automatically.", {
                    fix: `Open this URL manually: ${authUrl}`,
                });
                logger.debug(String(openErr));
            });

            timeoutId = setTimeout(
                () => {
                    fail(new CLIError(
                        "Authentication timed out.",
                        "No response was received from the browser within the time limit.",
                        'Run "ek login" to try again. Make sure to complete the login in your browser.',
                    ));
                },
                5 * 60 * 1000,
            );
        });
    }

    private buildAuthUrl(codeChallenge: string, state: string): string {
        const authUrl = new URL("/oauth/authorize", env.APP_BASE_URL);
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
        logger.info("Opening browser for authentication...");
        logger.info(`Authentication URL: ${authUrl}`);
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    private authErrorResponse(message: string): Response {
        return new Response(
            `<html>
          <head><title>Authentication Error</title></head>
          <body style="font-family: Inter, sans-serif; text-align: center; padding: 50px; background-color: #001B1F;">
            <h2 style="color: #E64545;">Authentication Error</h2>
            <p style="color: #F7F7F7;">${this.escapeHtml(message)}</p>
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
            throw new CLIError(
                "Could not complete the login.",
                `The server rejected the authentication request (status ${res.status}).`,
                'Run "ek login" to try again. If this persists, check your network connection.',
            );
        }

        const data = res.data as AuthResponse;
        if (!data.accessToken) {
            throw new CLIError(
                "Could not complete the login.",
                "The server response was incomplete. No access token was provided.",
                'Run "ek login" to try again.',
            );
        }

        return data;
    }

    private async markAuthenticated(accessToken: string, user: UserInfo): Promise<void> {
        await keyring.set(
            this.KEYRING_KEY,
            JSON.stringify({
                accessToken,
                userId: user.id,
                email: user.email,
            }),
        );

        await configManager.markAuthenticated();
    }

    async getUserInfo(token: string): Promise<UserInfo | null> {
        const res = await http.get<UserInfo | string>("/v1/me", {
            headers: {
                "Authorization": `Bearer ${token}`,
            },
            validateStatus: () => true,
        });

        if (res.status === 401 || res.status === 403) {
            return null;
        }

        if (res.status < 200 || res.status >= 300) {
            throw new CLIError(
                "Could not retrieve your account information.",
                `The server returned an unexpected response (status ${res.status}).`,
                'Run "ek login" to try again.',
            );
        }

        return res.data as UserInfo;
    }

    async getCredentials(): Promise<Credentials> {
        const authDataString = await keyring.get(this.KEYRING_KEY);
        if (!authDataString) {
            throw CLIError.from("AUTH_NOT_LOGGED_IN");
        }

        try {
            const authData = JSON.parse(authDataString) as StoredAuthData;
            if (!authData || !authData.accessToken) {
                throw CLIError.from("AUTH_NOT_LOGGED_IN");
            }
            return { accessToken: authData.accessToken };
        } catch (error: unknown) {
            if (error instanceof CLIError) throw error;
            logger.debug(error instanceof Error ? error.message : String(error));
            throw CLIError.from("AUTH_NOT_LOGGED_IN");
        }
    }
}
