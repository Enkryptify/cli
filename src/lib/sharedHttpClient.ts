import { CLIError } from "@/lib/errors";
import { keyring } from "@/lib/keyring";
import { logger } from "@/lib/logger";
import axios, { type AxiosError, type AxiosInstance } from "axios";

type StoredAuthData = {
    accessToken: string;
    [key: string]: string;
};

export type HttpClientConfig = {
    baseURL: string;
    keyringKey: string;
    authHeaderName: string;
    authHeaderPrefix?: string;
};

type ErrorEntry = {
    message: string;
    why: string;
    fix: string;
    docs?: string;
};

const HTTP_ERROR_MAP: Record<number, ErrorEntry> = {
    401: {
        message: "Authentication failed.",
        why: "Your session has expired or your credentials are invalid.",
        fix: 'Run "ek login" to re-authenticate.',
        docs: "/cli/troubleshooting#authentication",
    },
    403: {
        message: "Access denied.",
        why: "Your account doesn't have permission to access this resource.",
        fix: "Check your role and permissions in the Enkryptify dashboard.",
    },
    404: {
        message: "The requested resource was not found.",
        why: "The workspace, project, environment or secret you're trying to access doesn't exist.",
        fix: 'Run "ek configure" to update your project settings.',
    },
    500: {
        message: "The Enkryptify server encountered an error.",
        why: "This is a server-side issue, not a problem with your setup.",
        fix: "Try again in a few minutes. If the problem persists, contact support.",
    },
};

const NETWORK_ERROR_CODES = new Set([
    "ECONNREFUSED",
    "ECONNRESET",
    "ENOTFOUND",
    "ETIMEDOUT",
    "ERR_NETWORK",
]);

export function createAuthenticatedHttpClient(config: HttpClientConfig): AxiosInstance {
    const http = axios.create({
        baseURL: config.baseURL,
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
    });

    // Request interceptor: Add auth token
    http.interceptors.request.use(
        async (requestConfig) => {
            try {
                const authDataString = await keyring.get(config.keyringKey);
                if (!authDataString) {
                    return requestConfig;
                }

                const authData = JSON.parse(authDataString) as StoredAuthData;
                const token = authData?.accessToken;

                if (
                    token &&
                    typeof token === "string" &&
                    requestConfig.headers &&
                    typeof requestConfig.headers === "object" &&
                    !Array.isArray(requestConfig.headers) &&
                    !requestConfig.headers[config.authHeaderName]
                ) {
                    const authValue = config.authHeaderPrefix ? `${config.authHeaderPrefix}${token}` : token;
                    requestConfig.headers[config.authHeaderName] = authValue;
                }
            } catch (error) {
                logger.debug(`Failed to retrieve auth token: ${error instanceof Error ? error.message : String(error)}`);
            }

            return requestConfig;
        },
        (error) => Promise.reject(error),
    );

    http.interceptors.response.use(
        (response) => response,
        async (error: AxiosError) => {
            // Handle network-level errors (ECONNREFUSED, ETIMEDOUT, etc.)
            if ((error.code && NETWORK_ERROR_CODES.has(error.code)) || !error.response) {
                return Promise.reject(
                    new CLIError(
                        "Could not connect to the Enkryptify API.",
                        "The API server is unreachable. This could be a network issue, a firewall or the server may be down.",
                        "Check your internet connection and try again.",
                        "/cli/troubleshooting#network",
                    ),
                );
            }

            const status = error.response?.status;
            if (status && HTTP_ERROR_MAP[status]) {
                const entry = HTTP_ERROR_MAP[status];
                return Promise.reject(new CLIError(entry.message, entry.why, entry.fix, entry.docs));
            }

            return Promise.reject(error);
        },
    );

    return http;
}
