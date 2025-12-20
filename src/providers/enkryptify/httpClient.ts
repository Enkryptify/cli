import { env } from "@/env";
import { createAuthenticatedHttpClient } from "@/lib/sharedHttpClient";

const http = createAuthenticatedHttpClient({
    baseURL: env.API_BASE_URL,
    keyringKey: "enkryptify",
    authHeaderName: "X-API-Key",
});

export default http;
