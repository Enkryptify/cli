import { env } from "@/env";
import { keyring } from "@/lib/keyring";
import { logger } from "@/lib/logger";
import { CLIError } from "@/lib/errors";
import { loadConfig, saveConfig } from "@/lib/config";
import { PostHog } from "posthog-node";
import { randomUUID } from "crypto";

type StoredAuthData = {
    accessToken: string;
    userId: string;
    email: string;
};

function isValidStoredAuthData(value: unknown): value is StoredAuthData {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as Record<string, unknown>).accessToken === "string" &&
        typeof (value as Record<string, unknown>).userId === "string" &&
        typeof (value as Record<string, unknown>).email === "string"
    );
}

export type CommandTracker = {
    success(properties?: Record<string, unknown>): void;
    error(error: unknown): void;
};

let posthog: PostHog | null = null;
let enabled = false;
let distinctId: string | null = null;
let anonymousId: string | null = null;
let superProperties: Record<string, unknown> = {};
let noticeShown = false;

function isOptedOut(): boolean {
    const telemetryEnv = process.env.EK_TELEMETRY;
    if (telemetryEnv !== undefined) {
        const lower = telemetryEnv.toLowerCase();
        if (lower === "false" || lower === "0" || lower === "off") {
            return true;
        }
    }
    return false;
}

function isTestEnvironment(): boolean {
    return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

function detectCI(): boolean {
    return !!(
        process.env.CI ||
        process.env.GITHUB_ACTIONS ||
        process.env.GITLAB_CI ||
        process.env.CIRCLECI ||
        process.env.TRAVIS ||
        process.env.JENKINS_URL ||
        process.env.BUILDKITE ||
        process.env.TF_BUILD
    );
}

async function showFirstRunNotice(): Promise<void> {
    if (noticeShown) return;

    try {
        const config = await loadConfig();
        if (config.settings?.telemetryNoticeShown === "true") {
            noticeShown = true;
            return;
        }

        logger.stderr.info("Usage analytics enabled to help improve the CLI. Set EK_TELEMETRY=false to opt out.");

        if (!config.settings) config.settings = {};
        config.settings.telemetryNoticeShown = "true";
        await saveConfig(config);
        noticeShown = true;
    } catch {
        // Best-effort, don't break the CLI
        noticeShown = true;
    }
}

export const analytics = {
    async init(): Promise<void> {
        if (isTestEnvironment() || isOptedOut()) {
            enabled = false;
            return;
        }

        try {
            // Check config-level opt-out
            const config = await loadConfig();
            if (config.settings?.telemetry === "false") {
                enabled = false;
                return;
            }

            // Get or create anonymous ID
            anonymousId = config.settings?.anonymousId ?? null;
            if (!anonymousId) {
                anonymousId = randomUUID();
                if (!config.settings) config.settings = {};
                config.settings.anonymousId = anonymousId;
                await saveConfig(config);
            }

            // Default distinct ID is the anonymous ID
            distinctId = anonymousId;

            // Try to read user identity from keyring
            try {
                const authDataString = await keyring.get("enkryptify");
                if (authDataString) {
                    const parsed: unknown = JSON.parse(authDataString);
                    if (isValidStoredAuthData(parsed)) {
                        distinctId = parsed.userId;
                    }
                }
            } catch {
                // Best-effort, continue with anonymous ID
            }

            // Build super properties
            superProperties = {
                cli_version: env.CLI_VERSION,
                os: process.platform,
                arch: process.arch,
                node_version: process.version,
                is_ci: detectCI(),
            };

            // Initialize PostHog client
            posthog = new PostHog(env.POSTHOG_API_KEY, {
                host: env.POSTHOG_HOST,
                flushAt: 10,
                flushInterval: 5000,
                requestTimeout: 3000,
                disabled: false,
            });

            // Identify user if we have a real user ID (not anonymous)
            if (distinctId !== anonymousId) {
                try {
                    const authDataString = await keyring.get("enkryptify");
                    if (authDataString) {
                        const parsed: unknown = JSON.parse(authDataString);
                        if (isValidStoredAuthData(parsed)) {
                            posthog.identify({
                                distinctId: parsed.userId,
                                properties: {
                                    email: parsed.email,
                                },
                            });
                        }
                    }
                } catch {
                    // Best-effort
                }
            }

            enabled = true;
        } catch {
            // Analytics initialization should never break the CLI
            enabled = false;
        }
    },

    identify(userId: string, email: string): void {
        if (!enabled || !posthog) return;

        try {
            // If we were using an anonymous ID, alias it to the real user
            if (anonymousId && distinctId === anonymousId) {
                posthog.alias({
                    distinctId: userId,
                    alias: anonymousId,
                });
            }

            distinctId = userId;

            posthog.identify({
                distinctId: userId,
                properties: {
                    email,
                },
            });
        } catch {
            // Best-effort
        }
    },

    track(event: string, properties?: Record<string, unknown>): void {
        if (!enabled || !posthog || !distinctId) return;

        try {
            // Show first-run notice (fire-and-forget)
            void showFirstRunNotice();

            posthog.capture({
                distinctId,
                event,
                properties: {
                    ...superProperties,
                    ...properties,
                },
            });
        } catch {
            // Never throw from analytics
        }
    },

    trackCommand(command: string, properties?: Record<string, unknown>): CommandTracker {
        const startTime = Date.now();

        return {
            success(extraProperties?: Record<string, unknown>): void {
                const durationMs = Date.now() - startTime;
                analytics.track(command, {
                    ...properties,
                    ...extraProperties,
                    status: "success",
                    duration_ms: durationMs,
                });
            },
            error(error: unknown): void {
                const durationMs = Date.now() - startTime;
                const errorCode = error instanceof CLIError ? error.errorCode : undefined;
                const errorMessage = error instanceof Error ? error.message : String(error);
                analytics.track(command, {
                    ...properties,
                    status: "error",
                    duration_ms: durationMs,
                    error_code: errorCode,
                    error_message: errorMessage,
                });
            },
        };
    },

    async shutdown(): Promise<void> {
        if (!enabled || !posthog) return;

        try {
            await Promise.race([posthog.shutdown(), new Promise((resolve) => setTimeout(resolve, 2000))]);
        } catch {
            // Never throw from analytics shutdown
        }
    },

    isEnabled(): boolean {
        return enabled;
    },
};
