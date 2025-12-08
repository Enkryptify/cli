import { loadConfig, saveConfig } from "@/lib/config.js";
import semver from "semver";

function shouldCheck(lastCheck: string | null): boolean {
    if (!lastCheck) return true;
    const now = new Date();
    const last = new Date(lastCheck);
    return now.toDateString() !== last.toDateString();
}

function checkVersion(currentVersion: string, latestVersion: string): void {
    if (!semver.lt(currentVersion, latestVersion)) return;

    const diffType = semver.diff(currentVersion, latestVersion);

    if (diffType === "major") {
        console.error(
            `\n MAJOR UPDATE REQUIRED\n` +
                `Your current version (${currentVersion}) is outdated.\n` +
                `A new major version (${latestVersion}) is available with breaking changes.\n` +
                `Please update to continue using the CLI.\n`,
        );
        process.exit(1);
    } else if (diffType === "minor" || diffType === "patch") {
        console.log(`\n A new ${diffType} version is available: ${latestVersion} (current: ${currentVersion})\n`);
    }
}

export async function checkForUpdate(): Promise<void> {
    const currentVersion = process.env.CLI_VERSION;
    if (!currentVersion) return;

    const config = await loadConfig();
    const lastCheck = config.lastUpdateCheck || null;
    let latestVersion = config.latestVersion || null;

    if (shouldCheck(lastCheck)) {
        const baseURL = process.env.API_BASE_URL;
        if (baseURL) {
            const response = await fetch(`${baseURL}/v1/auth/cli-update`);
            if (response.ok) {
                const data = (await response.json()) as { version: string };
                if (data.version) {
                    latestVersion = data.version;
                    config.latestVersion = latestVersion;
                    config.lastUpdateCheck = new Date().toISOString();
                    await saveConfig(config);
                }
            }
        }
    }

    if (latestVersion) {
        checkVersion(currentVersion, latestVersion);
    }
}
