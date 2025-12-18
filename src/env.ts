import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const defaults = {
    API_BASE_URL: "https://api.enkryptify.com",
    APP_BASE_URL: "https://app.enkryptify.com",
    GCP_RESOURCE_MANAGER_API: "https://cloudresourcemanager.googleapis.com/v1",
    CLI_VERSION: "0.0.0",
};

const runtimeEnv = {
    ...defaults,
    ...process.env,
};

export const env = createEnv({
    server: {
        API_BASE_URL: z.string().url("API_BASE_URL must be a valid URL"),
        APP_BASE_URL: z.string().url("APP_BASE_URL must be a valid URL"),
        GCP_RESOURCE_MANAGER_API: z.string().url("GCP_RESOURCE_MANAGER_API must be a valid URL"),
        CLI_VERSION: z.string(),
    },
    runtimeEnv,
});
