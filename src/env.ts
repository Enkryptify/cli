import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import pkg from "../package.json" assert { type: "json" };

export const env = createEnv({
    server: {
        API_BASE_URL: z.url("API_BASE_URL must be a valid URL").default("https://api.enkryptify.com"),
        APP_BASE_URL: z.url("APP_BASE_URL must be a valid URL").default("https://app.enkryptify.com"),
        CLI_VERSION: z.string().default((pkg as { version: string }).version),
        POSTHOG_API_KEY: z.string().default("phc_IcNcGm3m2nxtn0mzpdQ18RYxu98jsrA22X7o0hsstWJ"),
        POSTHOG_HOST: z.string().default("https://eu.i.posthog.com"),
    },
    runtimeEnv: {
        API_BASE_URL: process.env.API_BASE_URL,
        APP_BASE_URL: process.env.APP_BASE_URL,
        CLI_VERSION: process.env.CLI_VERSION,
        POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
        POSTHOG_HOST: process.env.POSTHOG_HOST,
    },
});
