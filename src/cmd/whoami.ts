import { Auth } from "@/api/auth";
import { analytics } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import { secureStore } from "@/lib/secureStore";
import type { Command } from "commander";

export function registerWhoamiCommand(program: Command) {
    program
        .command("whoami")
        .description("Show the currently authenticated user.")
        .action(async () => {
            const tracker = analytics.trackCommand("command_whoami", {});

            try {
                const authData = await secureStore.getAuth();
                if (!authData?.accessToken) {
                    logger.warn("Not logged in.", {
                        fix: 'Run "ek login" to authenticate.',
                    });
                    tracker.success();
                    return;
                }

                const auth = new Auth();
                const userInfo = await auth.getUserInfo(authData.accessToken);

                if (!userInfo) {
                    logger.warn("Your session has expired or is invalid.", {
                        fix: 'Run "ek login" to re-authenticate.',
                    });
                    tracker.success();
                    return;
                }

                logger.info(`Logged in as ${userInfo.email}`);
                tracker.success();
            } catch (error: unknown) {
                tracker.error(error instanceof Error ? error : new Error(String(error)));
                logger.error(error instanceof Error ? error.message : String(error));
                process.exit(1);
            }
        });
}
