import { env } from "@/env";
import { createAuthenticatedHttpClient } from "@/lib/sharedHttpClient";

const http = createAuthenticatedHttpClient({
    baseURL: env.API_BASE_URL,
    keyringKey: "enkryptify",
    authHeaderName: "X-API-Key",
});

http.interceptors.request.use((config) => {
    if (config.method?.toLowerCase() === "delete" && config.headers) {
        delete config.headers["Content-Type"];
    }
    return config;
});

export default http;
