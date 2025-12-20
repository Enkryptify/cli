import { createAuthenticatedHttpClient } from "@/lib/sharedHttpClient";

const http = createAuthenticatedHttpClient({
    baseURL: "https://secretmanager.googleapis.com/v1",
    keyringKey: "gcp",
    authHeaderName: "Authorization",
    authHeaderPrefix: "Bearer ",
});

export default http;
