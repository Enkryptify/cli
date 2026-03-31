import { registerCommands } from "@/cmd/index";
import { env } from "@/env";
import { analytics } from "@/lib/analytics";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { setupTerminalCleanup } from "@/lib/terminal";
import { checkForUpdate } from "@/lib/versionCheck";

import { Command } from "commander";
import { getCompletions } from "./complete/complete";

const isCompletion = process.argv[2] === "__complete";

const program = new Command();

program.configureOutput({
    writeErr: (str) => {
        const errorMatch = str.match(/error:\s*(.+)/i);
        if (errorMatch && errorMatch[1]) {
            logger.error(errorMatch[1].trim());
        } else {
            logger.error(str.trim());
        }
    },
});

program.name("ek").description("Enkryptify CLI").version(env.CLI_VERSION, "-v, --version");

registerCommands(program);

if (isCompletion) {
    const words = process.argv.slice(3);
    const completions = getCompletions(program, ["ek", ...words]);
    // Shell completions must go to stdout raw — not through the logger
    process.stdout.write(completions.join("\n") + "\n");
    process.exit(0);
}

setupTerminalCleanup();
await analytics.init();

const isUpgrade = process.argv[2] === "upgrade";
if (!isCompletion && !isUpgrade) {
    checkForUpdate().catch(() => {});
}

program
    .parseAsync(process.argv)
    .catch((error) => {
        if (error instanceof CLIError) {
            analytics.track("cli_error", { error_code: error.errorCode, error_message: error.message });
            logger.error(error.message, { why: error.why, fix: error.fix, docs: error.docs });
        } else {
            analytics.track("cli_error", { error_message: error instanceof Error ? error.message : String(error) });
            logger.error(error instanceof Error ? error.message : String(error));
        }
        process.exitCode = 1;
    })
    .finally(async () => {
        await analytics.shutdown();
    });
