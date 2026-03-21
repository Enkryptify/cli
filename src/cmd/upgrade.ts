import { env } from "@/env";
import { logError } from "@/lib/error";
import { fetchLatestVersion } from "@/lib/versionCheck";
import type { Command } from "commander";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import semver from "semver";
import axios from "axios";

type InstallMethod = "brew" | "scoop" | "binary";

const GITHUB_DOWNLOAD_BASE = "https://github.com/Enkryptify/cli/releases/download";

function detectInstallMethod(): InstallMethod {
    const execPath = process.execPath;

    if (process.platform === "win32" && execPath.toLowerCase().includes("scoop")) {
        return "scoop";
    }

    if (execPath.includes("/Cellar/") || execPath.includes("/homebrew/")) {
        return "brew";
    }

    return "binary";
}

function getPlatformArch(): { platform: string; arch: string; ext: string } | null {
    const platformMap: Record<string, string> = {
        linux: "Linux",
        darwin: "Darwin",
    };

    const archMap: Record<string, string> = {
        x64: "x86_64",
        arm64: "arm64",
    };

    const platform = platformMap[process.platform];
    const arch = archMap[process.arch];

    if (!platform || !arch) return null;

    return { platform, arch, ext: "tar.gz" };
}

async function upgradeViaBrew(): Promise<void> {
    console.log("Upgrading via Homebrew...\n");
    try {
        execSync("brew update && brew upgrade enkryptify", { stdio: "inherit" });
        console.log("\n✅ Successfully upgraded via Homebrew.");
    } catch {
        logError("Failed to upgrade via Homebrew. Try running manually:\n  brew update && brew upgrade enkryptify");
        process.exit(1);
    }
}

async function upgradeViaScoop(): Promise<void> {
    console.log("Upgrading via Scoop...\n");
    try {
        execSync("scoop update enkryptify", { stdio: "inherit" });
        console.log("\n✅ Successfully upgraded via Scoop.");
    } catch {
        logError("Failed to upgrade via Scoop. Try running manually:\n  scoop update enkryptify");
        process.exit(1);
    }
}

async function upgradeViaBinary(latestVersion: string): Promise<void> {
    // Windows direct binary: show manual instructions
    if (process.platform === "win32") {
        const url = `${GITHUB_DOWNLOAD_BASE}/v${latestVersion}/enkryptify_Windows_x86_64.zip`;
        console.log(`Download the latest version manually:\n  ${url}`);
        return;
    }

    const info = getPlatformArch();
    if (!info) {
        logError(
            `Unsupported platform: ${process.platform}/${process.arch}\n` +
                `  Please upgrade manually from: https://github.com/Enkryptify/cli/releases`,
        );
        process.exit(1);
    }

    const fileName = `enkryptify_${info.platform}_${info.arch}.${info.ext}`;
    const downloadUrl = `${GITHUB_DOWNLOAD_BASE}/v${latestVersion}/${fileName}`;

    console.log(`Downloading ${fileName}...`);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ek-upgrade-"));

    try {
        const tarballPath = path.join(tmpDir, fileName);

        // Download the tarball
        const response = await axios.get(downloadUrl, {
            responseType: "arraybuffer",
            timeout: 60000,
        });
        fs.writeFileSync(tarballPath, Buffer.from(response.data as ArrayBuffer));

        // Extract the binary
        execSync(`tar -xzf "${tarballPath}" -C "${tmpDir}"`, { stdio: "pipe" });

        const extractedBinary = path.join(tmpDir, "ek");
        if (!fs.existsSync(extractedBinary)) {
            throw new Error("Binary not found in archive.");
        }

        // Replace the current binary
        const targetPath = process.execPath;

        try {
            fs.copyFileSync(extractedBinary, targetPath);
            fs.chmodSync(targetPath, 0o755);
        } catch (err: unknown) {
            if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "EACCES") {
                logError(
                    `Permission denied. Try running:\n  sudo ek upgrade`,
                );
                process.exit(1);
            }
            throw err;
        }

        console.log(`\n✅ Successfully upgraded to v${latestVersion}.`);
    } finally {
        // Clean up temp directory
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    }
}

export function registerUpgradeCommand(program: Command) {
    program
        .command("upgrade")
        .description("Upgrade the Enkryptify CLI to the latest version.")
        .option("-f, --force", "Upgrade even if already on the latest version")
        .action(async (options: { force?: boolean }) => {
            try {
                const currentVersion = env.CLI_VERSION;

                console.log(`Current version: v${currentVersion}\n`);
                console.log("Checking for updates...");

                const latestVersion = await fetchLatestVersion();

                if (!latestVersion) {
                    logError(
                        "Failed to check for updates. Please check your internet connection.",
                    );
                    process.exit(1);
                }

                if (semver.eq(currentVersion, latestVersion) && !options.force) {
                    console.log(`\n✅ Already on the latest version (v${currentVersion}).`);
                    return;
                }

                if (semver.gt(currentVersion, latestVersion) && !options.force) {
                    console.log(
                        `\n✅ Current version (v${currentVersion}) is newer than latest release (v${latestVersion}).`,
                    );
                    return;
                }

                console.log(`Upgrading: v${currentVersion} → v${latestVersion}\n`);

                const method = detectInstallMethod();

                switch (method) {
                    case "brew":
                        await upgradeViaBrew();
                        break;
                    case "scoop":
                        await upgradeViaScoop();
                        break;
                    case "binary":
                        await upgradeViaBinary(latestVersion);
                        break;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logError(errorMessage);
                process.exit(1);
            }
        });
}
