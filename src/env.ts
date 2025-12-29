import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import pkg from "../package.json" assert { type: "json" };

const defaults = {
    API_BASE_URL: "https://api.enkryptify.com",
    APP_BASE_URL: "https://app.enkryptify.com",
    GCP_RESOURCE_MANAGER_API: "https://cloudresourcemanager.googleapis.com/v1",
    GCP_AUTH_URL: "https://www.googleapis.com/auth/cloud-platform",
    GCP_AUTH_SCOPES: "https://www.googleapis.com/auth/cloud-platform",
    CLI_VERSION: process.env.CLI_VERSION ?? (pkg as { version: string }).version,
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
        GCP_AUTH_URL: z.string().url("GCP_AUTH_URL must be a valid URL"),
        GCP_AUTH_SCOPES: z.string().url("GCP_AUTH_SCOPES must be a valid URL"),
        CLI_VERSION: z.string(),
    },
    runtimeEnv,
});
