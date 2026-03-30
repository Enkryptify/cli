import http from "@/api/httpClient";
import { analytics } from "@/lib/analytics";
import { config as configManager } from "@/lib/config";
import { keyring } from "@/lib/keyring";
import { logger } from "@/lib/logger";
import type { Command } from "commander";

export function registerLogoutCommand(program: Command) {
    program
        .command("logout")
        .description("Log out of Enkryptify and revoke your CLI token.")
        .option("--all", "Revoke all CLI tokens for your account")
        .action(async (options: { all?: boolean }) => {
            const tracker = analytics.trackCommand("command_logout", {
                all: !!options.all,
            });

            try {
                const authDataString = await keyring.get("enkryptify");
                if (!authDataString) {
                    logger.info("You are not logged in.");
                    tracker.success();
                    return;
                }

                // Attempt to revoke the token server-side
                try {
                    await http.post("/v1/auth/cli/logout", {
                        ...(options.all ? { all: true } : {}),
                    });
                } catch (revokeError: unknown) {
                    logger.warn("Could not revoke your token on the server.", {
                        why: "The server may be unreachable or the token may already be invalid.",
                        fix: "Your local credentials have been cleared. If needed, revoke tokens from the Enkryptify dashboard.",
                    });
                    logger.debug(revokeError instanceof Error ? revokeError.message : String(revokeError));
                }

                // Always clear local credentials regardless of API result
                await keyring.delete("enkryptify");
                await configManager.clearAuthentication();

                logger.info("Successfully logged out.");
                tracker.success();
            } catch (error: unknown) {
                tracker.error(error instanceof Error ? error : new Error(String(error)));
                logger.error(error instanceof Error ? error.message : String(error));
                process.exit(1);
            }
        });
}
