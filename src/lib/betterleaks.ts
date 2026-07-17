import { CLIError } from "@/lib/errors";
import { getGitRepoInfo } from "@/lib/git";
import axios from "axios";
import { execFile, execFileSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const BETTERLEAKS_VERSION = "1.6.1";
const BETTERLEAKS_DOWNLOAD_BASE = "https://github.com/betterleaks/betterleaks/releases/download";

// SHA-256 of each pinned release asset, copied from betterleaks' official v1.6.1
// checksums.txt. Pinned in source rather than fetched at runtime so a tampered or
// MITM'd download can't also supply a matching checksum. Update with the version.
const BETTERLEAKS_CHECKSUMS: Record<string, string> = {
    "betterleaks_1.6.1_darwin_arm64.tar.gz": "9996bfcc93fd2ae6976c7902e3b2177766ec1960c1e30a15398609d5177ef3f8",
    "betterleaks_1.6.1_darwin_x64.tar.gz": "07ddb85c4b2c55da6b671a6af667c89d89c68c52aff8fd73a1118a92d373db8c",
    "betterleaks_1.6.1_linux_arm64.tar.gz": "bab9688ba968264ace67b608fc7a7d8f5e61218cde70029d32cbc894e3808fdf",
    "betterleaks_1.6.1_linux_x64.tar.gz": "fbefc700a0bd4522cc952dd2a8f259cdb80526d7e60114aca19bb2d6fdc80f81",
    "betterleaks_1.6.1_windows_arm64.zip": "fc9bc3d554161e4c94f3510f59d6a790c2ce52f25a5b99520efe1e529efa0912",
    "betterleaks_1.6.1_windows_x64.zip": "3ada08a8b19afab75b111e10f38682a64c0582824c9903ce868b09b0c3c2cf37",
};

const INSTALL_DIR = path.join(os.homedir(), ".enkryptify", "bin");
const BINARY_NAME = process.platform === "win32" ? "betterleaks.exe" : "betterleaks";
const LOCAL_BINARY_PATH = path.join(INSTALL_DIR, BINARY_NAME);

// betterleaks JSON findings are gitleaks-compatible. We only read the fields the report uses.
export type Finding = {
    RuleID: string;
    Description: string;
    File: string;
    StartLine: number;
    EndLine: number;
    Match: string;
    Secret: string;
    Entropy: number;
};

// betterleaks release assets are named betterleaks_<version>_<os>_<arch>.<ext>
// os ∈ {darwin, linux, windows}, arch ∈ {x64, arm64}. Note: arch is "x64", not "x86_64".
function getAssetName(): string | null {
    const osMap: Record<string, string> = { darwin: "darwin", linux: "linux", win32: "windows" };
    const archMap: Record<string, string> = { x64: "x64", arm64: "arm64" };

    const osName = osMap[process.platform];
    const arch = archMap[process.arch];
    if (!osName || !arch) return null;

    const ext = process.platform === "win32" ? "zip" : "tar.gz";
    return `betterleaks_${BETTERLEAKS_VERSION}_${osName}_${arch}.${ext}`;
}

// Resolve a usable betterleaks binary: prefer one on PATH, fall back to our local install.
export async function findBetterleaks(): Promise<string | null> {
    try {
        await execFileAsync("betterleaks", ["version"], { timeout: 5000 });
        return "betterleaks";
    } catch {
        // Not on PATH; check the local install.
    }

    try {
        await fsp.access(LOCAL_BINARY_PATH, fs.constants.X_OK);
        return LOCAL_BINARY_PATH;
    } catch {
        return null;
    }
}

// Download and extract the betterleaks binary into ~/.enkryptify/bin.
export async function installBetterleaks(): Promise<string> {
    const assetName = getAssetName();
    if (!assetName) {
        throw CLIError.from("SCAN_UNSUPPORTED_PLATFORM");
    }

    const downloadUrl = `${BETTERLEAKS_DOWNLOAD_BASE}/v${BETTERLEAKS_VERSION}/${assetName}`;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ek-betterleaks-"));

    try {
        const archivePath = path.join(tmpDir, assetName);

        const response = await axios.get(downloadUrl, { responseType: "arraybuffer", timeout: 60000 });
        const archiveBuffer = Buffer.from(response.data as ArrayBuffer);

        const expectedChecksum = BETTERLEAKS_CHECKSUMS[assetName];
        const actualChecksum = crypto.createHash("sha256").update(archiveBuffer).digest("hex");
        if (!expectedChecksum || actualChecksum !== expectedChecksum) {
            throw CLIError.from("SCAN_INSTALL_FAILED");
        }

        fs.writeFileSync(archivePath, archiveBuffer);

        if (assetName.endsWith(".zip")) {
            execFileSync("tar", ["-xf", archivePath, "-C", tmpDir], { stdio: "pipe" });
        } else {
            execFileSync("tar", ["-xzf", archivePath, "-C", tmpDir], { stdio: "pipe" });
        }

        const extractedBinary = path.join(tmpDir, BINARY_NAME);
        if (!fs.existsSync(extractedBinary)) {
            throw CLIError.from("SCAN_INSTALL_FAILED");
        }

        fs.mkdirSync(INSTALL_DIR, { recursive: true });
        fs.copyFileSync(extractedBinary, LOCAL_BINARY_PATH);
        fs.chmodSync(LOCAL_BINARY_PATH, 0o755);

        return LOCAL_BINARY_PATH;
    } catch (error) {
        if (error instanceof CLIError) throw error;
        throw CLIError.from("SCAN_INSTALL_FAILED");
    } finally {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors.
        }
    }
}

function isEnvFile(file: string): boolean {
    const base = path.basename(file);
    return base === ".env" || base.startsWith(".env.");
}

async function gitLsFiles(cwd: string, args: string[]): Promise<string[]> {
    const { stdout } = await execFileAsync("git", ["-C", cwd, "ls-files", "-z", ...args], {
        timeout: 15000,
        maxBuffer: 64 * 1024 * 1024,
    });
    return stdout.split("\0").filter(Boolean);
}

// Resolve the paths to scan. In a git repo we exclude gitignored files (but always
// keep .env files), so scans match what's actually committed. Returns null when not
// in a git repo, meaning "scan the whole directory".
async function resolveScanTargets(dir: string): Promise<string[] | null> {
    const repo = await getGitRepoInfo(dir);
    if (!repo) return null;

    const [tracked, ignored] = await Promise.all([
        gitLsFiles(dir, ["--cached", "--others", "--exclude-standard"]),
        gitLsFiles(dir, ["--others", "--ignored", "--exclude-standard"]),
    ]);

    return Array.from(new Set([...tracked, ...ignored.filter(isEnvFile)]));
}

// Scan a directory and return the parsed findings. We pass --exit-code 0 so betterleaks
// never makes the spawn fail; the caller decides the process exit code from the findings.
export async function runBetterleaks(binPath: string, targetDir: string): Promise<Finding[]> {
    const targets = await resolveScanTargets(targetDir);

    // Git repo with nothing to scan (everything ignored / empty) — no findings.
    if (targets !== null && targets.length === 0) return [];

    const paths = targets ?? [targetDir];
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ek-scan-"));
    const reportPath = path.join(tmpDir, "report.json");

    try {
        const proc = Bun.spawn(
            [
                binPath,
                "dir",
                ...paths,
                "--report-format",
                "json",
                "--report-path",
                reportPath,
                "--exit-code",
                "0",
                "--no-banner",
            ],
            { cwd: targetDir, stdin: "ignore", stdout: "ignore", stderr: "ignore" },
        );

        const SCAN_TIMEOUT = 300000;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        let exitCode: number;
        try {
            exitCode = await Promise.race([
                proc.exited,
                new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error("timeout")), SCAN_TIMEOUT);
                }),
            ]);
        } catch (error) {
            if (error instanceof Error && error.message === "timeout") {
                proc.kill();
                throw CLIError.from("SCAN_RUN_FAILED");
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }

        // We pass --exit-code 0, so a non-zero exit means betterleaks itself errored.
        if (exitCode !== 0 || !fs.existsSync(reportPath)) {
            throw CLIError.from("SCAN_RUN_FAILED");
        }

        const raw = await fsp.readFile(reportPath, "utf-8");
        if (!raw.trim()) return [];

        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? (parsed as Finding[]) : [];
    } catch (error) {
        if (error instanceof CLIError) throw error;
        throw CLIError.from("SCAN_RUN_FAILED");
    } finally {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors.
        }
    }
}
