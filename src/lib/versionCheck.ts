import { env } from "@/env";
import { loadConfig, saveConfig } from "@/lib/config";
import axios from "axios";
import semver from "semver";

const GITHUB_RELEASES_URL = "https://api.github.com/repos/Enkryptify/cli/releases/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function fetchLatestVersion(): Promise<string | null> {
    try {
        const response = await axios.get(GITHUB_RELEASES_URL, {
            timeout: 3000,
            headers: { Accept: "application/vnd.github.v3+json" },
        });

        const data = response.data as Record<string, unknown>;
        const tagName = data?.tag_name;
        if (typeof tagName !== "string") return null;

        return tagName.replace(/^v/, "");
    } catch {
        return null;
    }
}

function printUpdateReminder(current: string, latest: string): void {
    const diff = semver.diff(current, latest);
    if (!diff || (diff !== "major" && diff !== "minor")) return;
    if (!semver.gt(latest, current)) return;

    const yellow = "\x1b[33m";
    const cyan = "\x1b[36m";
    const dim = "\x1b[2m";
    const reset = "\x1b[0m";

    const message = `${yellow}Update available: ${dim}${current}${reset}${yellow} → ${cyan}${latest}${reset}`;
    const hint = `${dim}Run ${cyan}ek upgrade${reset}${dim} to update${reset}`;

    const line = "─".repeat(50);
    process.stderr.write(`\n${dim}╭${line}╮${reset}\n`);
    process.stderr.write(`${dim}│${reset}  ${message}  ${dim}│${reset}\n`);
    process.stderr.write(`${dim}│${reset}  ${hint}  ${dim}│${reset}\n`);
    process.stderr.write(`${dim}╰${line}╯${reset}\n\n`);
}

export async function checkForUpdate(): Promise<void> {
    try {
        const config = await loadConfig();
        const currentVersion = env.CLI_VERSION;

        // Phase 1: Show reminder from cached data (instant, no network)
        const cachedVersion = config.settings?.latestVersion;
        if (cachedVersion && semver.valid(cachedVersion) && semver.valid(currentVersion)) {
            printUpdateReminder(currentVersion, cachedVersion);
        }

        // Phase 2: Background fetch to update cache for next command
        const lastCheck = config.settings?.lastUpdateCheck;
        const lastCheckTime = lastCheck ? new Date(lastCheck).getTime() : 0;
        const now = Date.now();

        if (now - lastCheckTime < CHECK_INTERVAL_MS) return;

        // Fire-and-forget: fetch and save, no output
        fetchLatestVersion()
            .then(async (latestVersion) => {
                if (!latestVersion) return;

                if (!config.settings) config.settings = {};
                config.settings.lastUpdateCheck = new Date(now).toISOString();
                config.settings.latestVersion = latestVersion;
                await saveConfig(config);
            })
            .catch(() => {});
    } catch {
        // Silently ignore all errors — must never crash or delay the CLI
    }
}
