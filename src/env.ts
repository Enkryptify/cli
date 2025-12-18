import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
    server: {
        API_BASE_URL: z.string().url("API_BASE_URL must be a valid URL"),
        APP_BASE_URL: z.string().url("APP_BASE_URL must be a valid URL"),
        GCP_RESOURCE_MANAGER_API: z.string().url("GCP_RESOURCE_MANAGER_API must be a valid URL"),
        CLI_VERSION: z.string(),
    },
    runtimeEnv: process.env,
});
