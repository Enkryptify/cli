import { loadConfig, saveConfig } from "@/lib/config";
import { logError } from "@/lib/error";
import type { Command } from "commander";

export function registerSetApiUrlCommand(program: Command) {
    program
        .command("set-api-url", { hidden: true })
        .argument("[url]", "The new API base URL (omit to reset to default)")
        .action(async (url?: string) => {
            try {
                const config = await loadConfig();

                if (!config.settings) {
                    config.settings = {};
                }

                if (!url) {
                    delete config.settings.apiBaseUrl;
                    await saveConfig(config);
                    console.log("API base URL reset to default (https://api.enkryptify.com)");
                    return;
                }

                try {
                    new URL(url);
                } catch {
                    logError("Invalid URL provided. Please provide a valid URL.");
                    process.exit(1);
                }

                config.settings.apiBaseUrl = url;
                await saveConfig(config);
                console.log(`API base URL set to: ${url}`);
            } catch (error) {
                logError(error instanceof Error ? error.message : String(error));
                process.exit(1);
            }
        });
}
