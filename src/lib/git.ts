import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const GIT_SETUP_PREFIX = "git:";

export type GitRepoInfo = {
    root: string;
    commonDir: string;
    setupKey: string;
};

export async function getGitRepoInfo(startPath: string): Promise<GitRepoInfo | null> {
    const cwd = path.resolve(startPath);

    try {
        const { stdout } = await execFileAsync("git", ["-C", cwd, "rev-parse", "--show-toplevel", "--git-common-dir"], {
            timeout: 3000,
        });

        const [rootOutput, commonDirOutput] = stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        if (!rootOutput || !commonDirOutput) {
            return null;
        }

        const root = path.resolve(rootOutput);
        const resolvedCommonDir = path.isAbsolute(commonDirOutput)
            ? path.resolve(commonDirOutput)
            : path.resolve(cwd, commonDirOutput);
        const commonDir = await fs.realpath(resolvedCommonDir);

        return {
            root,
            commonDir,
            setupKey: `${GIT_SETUP_PREFIX}${commonDir}`,
        };
    } catch {
        return null;
    }
}
