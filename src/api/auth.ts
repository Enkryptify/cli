import http from "@/api/httpClient";
import { config as configManager } from "@/lib/config";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { secureStore } from "@/lib/secureStore";
import open from "open";

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

type DeviceCodeResponse = {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    expiresIn: number;
    interval: number;
};

type AuthResponse = {
    accessToken: string;
    tokenType: string;
    expiresIn: number;
};

type DeviceTokenError = {
    error?: "authorization_pending" | "access_denied" | "expired_token";
};

const CLIENT_ID = "enkryptify-cli";

export class Auth {
    async login(options?: LoginOptions): Promise<void> {
        let accessToken: string | undefined;

        try {
            accessToken = (await this.getCredentials()).accessToken;
        } catch (error: unknown) {
            logger.debug(error instanceof Error ? error.message : String(error));
        }

        if (accessToken) {
            if (options?.force) {
                await secureStore.clearAll();
            } else if (await this.getUserInfo(accessToken).catch(() => null)) {
                logger.info('Already logged in. Use "ek login --force" to re-authenticate with a different account.');
                await configManager.markAuthenticated();
                return;
            } else {
                await secureStore.clearAll();
            }
        }

        const device = await this.createDeviceCode();
        this.logAuthInstructions(device);

        open(device.verificationUriComplete).catch((error: unknown) => {
            logger.warn("Failed to open browser automatically.", {
                fix: `Open this URL manually: ${device.verificationUriComplete}`,
            });
            logger.debug(String(error));
        });

        const authResponse = await this.pollForToken(device);
        const userInfo = await this.getUserInfo(authResponse.accessToken);
        if (!userInfo) {
            throw new CLIError(
                "Could not retrieve your account information.",
                "Authentication succeeded but the server failed to return your profile.",
                'Try running "ek login" again.',
            );
        }

        await secureStore.setAuth({
            accessToken: authResponse.accessToken,
            userId: userInfo.id,
            email: userInfo.email,
        });
        await configManager.markAuthenticated();
    }

    private async createDeviceCode(): Promise<DeviceCodeResponse> {
        const response = await http.post<DeviceCodeResponse>(
            "/v1/auth/device/code",
            { clientId: CLIENT_ID },
            {
                validateStatus: () => true,
            },
        );

        if (response.status < 200 || response.status >= 300 || !response.data.deviceCode) {
            throw new CLIError(
                "Could not start device authentication.",
                `The server rejected the authentication request (status ${response.status}).`,
                'Run "ek login" to try again.',
            );
        }

        return response.data;
    }

    private async pollForToken(device: DeviceCodeResponse): Promise<AuthResponse> {
        const expiresAt = Date.now() + device.expiresIn * 1000;
        let cancelled = false;
        const cancel = () => {
            cancelled = true;
        };
        process.once("SIGINT", cancel);

        try {
            while (Date.now() < expiresAt) {
                if (cancelled) {
                    throw new CLIError("Authentication cancelled.");
                }

                await new Promise((resolve) => setTimeout(resolve, device.interval * 1000));
                const response = await http.post<AuthResponse | DeviceTokenError>(
                    "/v1/auth/device/token",
                    { clientId: CLIENT_ID, deviceCode: device.deviceCode },
                    { validateStatus: () => true },
                );

                if (response.status >= 200 && response.status < 300 && "accessToken" in response.data) {
                    return response.data;
                }

                const error = "error" in response.data ? response.data.error : undefined;
                if (error === "authorization_pending") continue;
                if (error === "access_denied") {
                    throw new CLIError("Authentication was denied in the browser.");
                }
                if (error === "expired_token") break;

                throw new CLIError(
                    "Could not complete the login.",
                    `The server rejected the authentication request (status ${response.status}).`,
                    'Run "ek login" to try again.',
                );
            }
        } finally {
            process.removeListener("SIGINT", cancel);
        }

        throw new CLIError(
            "Authentication timed out.",
            "The device verification request expired before it was approved.",
            'Run "ek login" to try again.',
        );
    }

    private logAuthInstructions(device: DeviceCodeResponse): void {
        logger.info("Opening browser for authentication...");
        logger.info(`Verification code: ${device.userCode}`);
        logger.info(`Authentication URL: ${device.verificationUriComplete}`);
    }

    async getUserInfo(token: string): Promise<UserInfo | null> {
        const response = await http.get<UserInfo | string>("/v1/me", {
            headers: { Authorization: `Bearer ${token}` },
            validateStatus: () => true,
        });

        if (response.status === 401 || response.status === 403) return null;
        if (response.status < 200 || response.status >= 300) {
            throw new CLIError(
                "Could not retrieve your account information.",
                `The server returned an unexpected response (status ${response.status}).`,
                'Run "ek login" to try again.',
            );
        }

        return response.data as UserInfo;
    }

    async getCredentials(): Promise<Credentials> {
        const authData = await secureStore.getAuth();
        if (!authData?.accessToken) throw CLIError.from("AUTH_NOT_LOGGED_IN");
        return { accessToken: authData.accessToken };
    }
}
