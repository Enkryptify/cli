import { analytics } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import { keyring } from "@/lib/keyring";
import { Auth } from "@/api/auth";
import { config as configManager } from "@/lib/config";
import { LoginFlow } from "@/ui/LoginFlow";
import type { Command } from "commander";

export function registerLoginCommand(program: Command) {
    program
        .command("login")
        .description("The login command is used to authenticate with Enkryptify.")
        .option("-f, --force", "Force re-authentication even if already logged in")
        .action(async (options: { force?: boolean }) => {
            const tracker = analytics.trackCommand("command_login", {
                force: !!options.force,
            });

            // Check for existing session before starting the OAuth flow / rendering spinner.
            // This avoids briefly showing "Please complete authentication in your browser..."
            // when the user is already logged in.
            if (!options?.force) {
                try {
                    const authDataString = await keyring.get("enkryptify");
                    if (authDataString) {
                        const authData = JSON.parse(authDataString) as {
                            accessToken: string;
                            userId: string;
                            email: string;
                        };
                        if (authData.accessToken) {
                            // Verify the token is still valid
                            const auth = new Auth();
                            const userInfo = await auth.getUserInfo(authData.accessToken).catch(() => null);
                            if (userInfo) {
                                logger.info(
                                    'Already logged in. Use "ek login --force" to re-authenticate with a different account.',
                                );
                                await configManager.markAuthenticated();
                                tracker.success();
                                return;
                            }
                        }
                    }
                } catch {
                    // If pre-check fails, fall through to the normal login flow
                }
            }

            await LoginFlow({
                options: {
                    force: options.force,
                },
                onError: (error: Error) => {
                    tracker.error(error);
                    logger.error(error instanceof Error ? error.message : String(error));
                    process.exit(1);
                },
                onComplete: async () => {
                    // Identify user in analytics after successful login
                    try {
                        const authDataString = await keyring.get("enkryptify");
                        if (authDataString) {
                            const authData = JSON.parse(authDataString) as {
                                userId: string;
                                email: string;
                            };
                            if (authData.userId && authData.email) {
                                analytics.identify(authData.userId, authData.email);
                            }
                        }
                    } catch {
                        // Best-effort
                    }
                    tracker.success();
                },
            });
        });
}
