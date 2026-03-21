import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import pkg from "../package.json" assert { type: "json" };

export const env = createEnv({
    server: {
        API_BASE_URL: z.url("API_BASE_URL must be a valid URL").default("https://api.enkryptify.com"),
        APP_BASE_URL: z.url("APP_BASE_URL must be a valid URL").default("https://app.enkryptify.com"),
        CLI_VERSION: z.string().default((pkg as { version: string }).version),
    },
    runtimeEnv: process.env,
});
