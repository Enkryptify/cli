import { logger } from "@/lib/logger";
import { LoginFlow } from "@/ui/LoginFlow";
import type { Command } from "commander";

export function registerLoginCommand(program: Command) {
    program
        .command("login")
        .description("The login command is used to authenticate with Enkryptify.")
        .option("-f, --force", "Force re-authentication even if already logged in")
        .action(async (options: { force?: boolean }) => {
            await LoginFlow({
                options: {
                    force: options.force,
                },
                onError: (error: Error) => {
                    logger.error(error instanceof Error ? error.message : String(error));
                    process.exit(1);
                },
            });
        });
}
