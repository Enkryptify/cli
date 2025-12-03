import axios, { type AxiosError, type AxiosInstance } from "axios";

const http: AxiosInstance = axios.create({
    baseURL: process.env.API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
    },
});

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
