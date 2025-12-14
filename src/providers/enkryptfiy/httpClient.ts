import { env } from "@/env";
import { keyring } from "@/lib/keyring";
import axios, { type AxiosError, type AxiosInstance } from "axios";

type StoredAuthData = {
    accessToken: string;
    userId: string;
    email: string;
};

const http: AxiosInstance = axios.create({
    baseURL: env.API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
    },
});

http.interceptors.request.use(
    async (config) => {
        try {
            const authDataString = await keyring.get("enkryptify");
            if (!authDataString) {
                return config;
            }

            const authData = JSON.parse(authDataString) as StoredAuthData;
            const token = authData?.accessToken;

            if (
                token &&
                typeof token === "string" &&
                config.headers &&
                typeof config.headers === "object" &&
                !Array.isArray(config.headers)
            ) {
                config.headers["X-API-Key"] = token;
            }
        } catch (error) {
            console.warn("Failed to retrieve auth token:", error instanceof Error ? error.message : String(error));
        }

        return config;
    },
    (error) => Promise.reject(error),
);

const ERROR_MESSAGES: Record<number, string> = {
    401: "Authentication failed. Please check your credentials.",
    404: "Resource not found.",
    403: "You don't have permission to perform this action.",
    500: "Something went wrong on the server. Please try again later.",
};

http.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const status = error.response?.status;

        if (status && ERROR_MESSAGES[status]) {
            return Promise.reject(new Error(ERROR_MESSAGES[status]));
        }

        return Promise.reject(error);
    },
);
export default http;
