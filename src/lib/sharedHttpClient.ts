import { keyring } from "@/lib/keyring";
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
    errorMessages?: Record<number, string>;
};

const DEFAULT_ERROR_MESSAGES: Record<number, string> = {
    401: "Authentication failed. Please check your credentials.",
    404: "Resource not found.",
    403: "You don't have permission to perform this action.",
    500: "Something went wrong on the server. Please try again later.",
};

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
                    !Array.isArray(requestConfig.headers)
                ) {
                    const authValue = config.authHeaderPrefix ? `${config.authHeaderPrefix}${token}` : token;
                    requestConfig.headers[config.authHeaderName] = authValue;
                }
            } catch (error) {
                console.warn("Failed to retrieve auth token:", error instanceof Error ? error.message : String(error));
            }

            return requestConfig;
        },
        (error) => Promise.reject(error),
    );

    const errorMessages = config.errorMessages ?? DEFAULT_ERROR_MESSAGES;

    http.interceptors.response.use(
        (response) => response,
        async (error: AxiosError) => {
            const status = error.response?.status;

            if (status && errorMessages[status]) {
                return Promise.reject(new Error(errorMessages[status]));
            }

            return Promise.reject(error);
        },
    );

    return http;
}
