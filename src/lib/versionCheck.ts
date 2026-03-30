import { env } from "@/env";
import { loadConfig, saveConfig } from "@/lib/config";
import { logger } from "@/lib/logger";
import axios from "axios";
import semver from "semver";

const GITHUB_RELEASES_URL = "https://api.github.com/repos/Enkryptify/cli/releases/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

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

    logger.warn(`A new version is available: v${current} → v${latest}. Run "ek upgrade" to update.`);
}

export async function checkForUpdate(): Promise<void> {
    try {
        const config = await loadConfig();
        const currentVersion = env.CLI_VERSION;

        const cachedVersion = config.settings?.latestVersion;
        if (cachedVersion && semver.valid(cachedVersion) && semver.valid(currentVersion)) {
            printUpdateReminder(currentVersion, cachedVersion);
        }

        const lastCheck = config.settings?.lastUpdateCheck;
        const lastCheckTime = lastCheck ? new Date(lastCheck).getTime() : 0;
        const now = Date.now();
        if (now - lastCheckTime < CHECK_INTERVAL_MS) return;

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
        // Ignore errors
    }
}
