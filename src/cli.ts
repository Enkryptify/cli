import { registerCommands } from "@/cmd/index";
import { env } from "@/env";
import { logError } from "@/lib/error";
import { setupTerminalCleanup } from "@/lib/terminal";
import "@/providers/registry/index.js";
import { Command } from "commander";
import { getCompletions } from "./complete/complete";

const isCompletion = process.argv[2] === "__complete";

const program = new Command();

program.configureOutput({
    writeErr: (str) => {
        const errorMatch = str.match(/error:\s*(.+)/i);
        if (errorMatch && errorMatch[1]) {
            logError(errorMatch[1].trim());
        } else {
            logError(str.trim());
        }
    },
});

program.name("ek").description("Enkryptify CLI").version(env.CLI_VERSION, "-v, --version");

registerCommands(program);

if (isCompletion) {
    const words = process.argv.slice(3);
    const completions = getCompletions(program, ["ek", ...words]);
    console.log(completions.join("\n"));
    process.exit(0);
}

setupTerminalCleanup();

program.parseAsync(process.argv).catch((error) => {
    logError(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
