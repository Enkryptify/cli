import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execFileSync } from "child_process";
import type * as ConfigModule from "@/lib/config";

vi.mock("@/lib/logger");

describe("config (integration)", () => {
    let tmpDir: string;
    let configPath: string;

    let loadConfig: (typeof ConfigModule)["loadConfig"];
    let saveConfig: (typeof ConfigModule)["saveConfig"];
    let config: (typeof ConfigModule)["config"];

    beforeEach(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ek-test-config-"));
        configPath = path.join(tmpDir, "config.json");
        process.env.ENKRYPTIFY_CONFIG_PATH = configPath;

        vi.resetModules();
        const mod = await import("@/lib/config");
        loadConfig = mod.loadConfig;
        saveConfig = mod.saveConfig;
        config = mod.config;
    });

    afterEach(() => {
        delete process.env.ENKRYPTIFY_CONFIG_PATH;
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // --- loadConfig ---

    it("creates default config when file is missing", async () => {
        const result = await loadConfig();
        expect(result).toEqual({ setups: {}, providers: {} });
        expect(fs.existsSync(configPath)).toBe(true);
    });

    it("parses valid JSON config", async () => {
        const validConfig = {
            setups: { "/my/project": { workspace_slug: "ws" } },
            providers: { enkryptify: {} },
            settings: { apiBaseUrl: "https://api.test.com" },
        };
        fs.writeFileSync(configPath, JSON.stringify(validConfig, null, 2), "utf-8");

        const result = await loadConfig();
        expect(result).toEqual(validConfig);
    });

    it("handles empty file by resetting to defaults", async () => {
        fs.writeFileSync(configPath, "", "utf-8");

        const result = await loadConfig();
        expect(result).toEqual({ setups: {}, providers: {} });

        const onDisk = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        expect(onDisk).toEqual({ setups: {}, providers: {} });
    });

    it("calls process.exit for corrupted data (array at root)", async () => {
        fs.writeFileSync(configPath, JSON.stringify([1, 2, 3]), "utf-8");

        try {
            await loadConfig();
            expect.unreachable("should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(Error);
            expect((err as Error).message).toContain("process.exit");
        }
    });

    it("calls process.exit for invalid JSON", async () => {
        fs.writeFileSync(configPath, "{not valid json!!", "utf-8");

        try {
            await loadConfig();
            expect.unreachable("should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(Error);
            expect((err as Error).message).toContain("process.exit");
        }
    });

    it("initializes missing setups/providers keys", async () => {
        fs.writeFileSync(configPath, JSON.stringify({ settings: { apiBaseUrl: "https://x.com" } }), "utf-8");

        const result = await loadConfig();
        expect(result.setups).toEqual({});
        expect(result.providers).toEqual({});
        expect(result.settings).toEqual({ apiBaseUrl: "https://x.com" });
    });

    it("migrates array-based setups to object format", async () => {
        const legacyConfig = {
            setups: [
                { path: "/project/a", workspace_slug: "ws-a", project_slug: "proj-a" },
                { path: "/project/b", workspace_slug: "ws-b", project_slug: "proj-b" },
            ],
            providers: {},
        };
        fs.writeFileSync(configPath, JSON.stringify(legacyConfig), "utf-8");

        const result = await loadConfig();
        expect(Array.isArray(result.setups)).toBe(false);

        const resolvedA = path.resolve("/project/a");
        const resolvedB = path.resolve("/project/b");
        expect(result.setups[resolvedA]).toEqual({ workspace_slug: "ws-a", project_slug: "proj-a" });
        expect(result.setups[resolvedB]).toEqual({ workspace_slug: "ws-b", project_slug: "proj-b" });
    });

    // --- saveConfig ---

    it("writes JSON with 2-space indentation", async () => {
        const testConfig = { setups: {}, providers: { enkryptify: {} } };
        await saveConfig(testConfig);

        const raw = fs.readFileSync(configPath, "utf-8");
        expect(raw).toBe(JSON.stringify(testConfig, null, 2));
    });

    it("creates parent directory if needed", async () => {
        const nestedPath = path.join(tmpDir, "nested", "deep", "config.json");
        delete process.env.ENKRYPTIFY_CONFIG_PATH;
        process.env.ENKRYPTIFY_CONFIG_PATH = nestedPath;

        vi.resetModules();
        const mod = await import("@/lib/config");

        const testConfig = { setups: {}, providers: {} };
        await mod.saveConfig(testConfig);

        expect(fs.existsSync(nestedPath)).toBe(true);
        const parsed = JSON.parse(fs.readFileSync(nestedPath, "utf-8"));
        expect(parsed).toEqual(testConfig);
    });

    // --- findProjectConfig ---

    it("returns config for exact match", async () => {
        const projectPath = path.join(tmpDir, "my-project");
        fs.mkdirSync(projectPath, { recursive: true });

        await config.createConfigure(projectPath, {
            path: projectPath,
            workspace_slug: "ws",
            project_slug: "proj",
            environment_id: "env-1",
        });

        const found = await config.findProjectConfig(projectPath);
        expect(found.workspace_slug).toBe("ws");
        expect(found.project_slug).toBe("proj");
        expect(found.environment_id).toBe("env-1");
        expect(found.path).toBe(path.resolve(projectPath));
    });

    it("walks up directory tree to find config in parent", async () => {
        const parentPath = path.join(tmpDir, "parent-project");
        const childPath = path.join(parentPath, "src", "components");
        fs.mkdirSync(childPath, { recursive: true });

        await config.createConfigure(parentPath, {
            path: parentPath,
            workspace_slug: "ws",
            project_slug: "proj",
            environment_id: "env-1",
        });

        const found = await config.findProjectConfig(childPath);
        expect(found.workspace_slug).toBe("ws");
        expect(found.path).toBe(path.resolve(parentPath));
    });

    it("finds git-scoped config from another worktree", async () => {
        const repoPath = path.join(tmpDir, "repo");
        const worktreePath = path.join(tmpDir, "repo-worktree");
        fs.mkdirSync(repoPath, { recursive: true });
        execFileSync("git", ["init"], { cwd: repoPath });
        fs.writeFileSync(path.join(repoPath, "README.md"), "test\n", "utf-8");
        execFileSync("git", ["add", "README.md"], { cwd: repoPath });
        execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "init"], {
            cwd: repoPath,
        });
        execFileSync("git", ["worktree", "add", "-b", "test-worktree", worktreePath], { cwd: repoPath });

        await config.createConfigure(
            repoPath,
            {
                path: repoPath,
                workspace_slug: "ws-git",
                project_slug: "proj-git",
                environment_id: "env-git",
            },
            { scope: "git" },
        );

        const found = await config.findProjectConfig(worktreePath);
        expect(found.workspace_slug).toBe("ws-git");
        expect(found.project_slug).toBe("proj-git");
        expect(found.path).toMatch(/^git:/);
    });

    it("uses the same git-scoped config key from repo subdirectories", async () => {
        const repoPath = path.join(tmpDir, "repo-subdir");
        const subdirPath = path.join(repoPath, "packages", "app");
        fs.mkdirSync(subdirPath, { recursive: true });
        execFileSync("git", ["init"], { cwd: repoPath });

        await config.createConfigure(
            repoPath,
            {
                path: repoPath,
                workspace_slug: "ws-git",
                project_slug: "proj-git",
                environment_id: "env-git",
            },
            { scope: "git" },
        );

        const found = await config.findProjectConfig(subdirPath);
        expect(found.workspace_slug).toBe("ws-git");
        expect(found.project_slug).toBe("proj-git");
        expect(found.path).toMatch(/^git:/);
    });

    it("prefers path-scoped config over git-scoped config", async () => {
        const repoPath = path.join(tmpDir, "repo-with-override");
        const childPath = path.join(repoPath, "packages", "app");
        fs.mkdirSync(childPath, { recursive: true });
        execFileSync("git", ["init"], { cwd: repoPath });

        await config.createConfigure(
            repoPath,
            {
                path: repoPath,
                workspace_slug: "ws-git",
                project_slug: "proj-git",
                environment_id: "env-git",
            },
            { scope: "git" },
        );

        await config.createConfigure(childPath, {
            path: childPath,
            workspace_slug: "ws-path",
            project_slug: "proj-path",
            environment_id: "env-path",
        });

        const found = await config.findProjectConfig(childPath);
        expect(found.workspace_slug).toBe("ws-path");
        expect(found.project_slug).toBe("proj-path");
        expect(found.path).toBe(path.resolve(childPath));
    });

    it("does not let an ancestor path setup shadow a git-scoped repo", async () => {
        const ancestorPath = path.join(tmpDir, "ancestor");
        const repoPath = path.join(ancestorPath, "repo");
        const subdirPath = path.join(repoPath, "src");
        fs.mkdirSync(subdirPath, { recursive: true });
        execFileSync("git", ["init"], { cwd: repoPath });

        // Ancestor directory configured with path scope.
        await config.createConfigure(ancestorPath, {
            path: ancestorPath,
            workspace_slug: "ws-ancestor",
            project_slug: "proj-ancestor",
            environment_id: "env-ancestor",
        });

        // The repo itself configured with git scope.
        await config.createConfigure(
            repoPath,
            {
                path: repoPath,
                workspace_slug: "ws-git",
                project_slug: "proj-git",
                environment_id: "env-git",
            },
            { scope: "git" },
        );

        const found = await config.findProjectConfig(subdirPath);
        expect(found.workspace_slug).toBe("ws-git");
        expect(found.path).toMatch(/^git:/);
    });

    it("switching a directory from path to git scope removes the stale path setup", async () => {
        const repoPath = path.join(tmpDir, "switch-scope");
        fs.mkdirSync(repoPath, { recursive: true });
        execFileSync("git", ["init"], { cwd: repoPath });

        // First configured as path scope.
        await config.createConfigure(repoPath, {
            path: repoPath,
            workspace_slug: "ws-path",
            project_slug: "proj-path",
            environment_id: "env-path",
        });

        // Re-configured as git scope for the same directory.
        await config.createConfigure(
            repoPath,
            {
                path: repoPath,
                workspace_slug: "ws-git",
                project_slug: "proj-git",
                environment_id: "env-git",
            },
            { scope: "git" },
        );

        const stored = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        const keys = Object.keys(stored.setups);
        expect(keys).toHaveLength(1);
        expect(keys[0]).toMatch(/^git:/);

        const found = await config.findProjectConfig(repoPath);
        expect(found.workspace_slug).toBe("ws-git");
        expect(found.path).toMatch(/^git:/);
    });

    it("throws CLIError when no config found", async () => {
        const randomPath = path.join(tmpDir, "no-config-here");
        fs.mkdirSync(randomPath, { recursive: true });

        await expect(config.findProjectConfig(randomPath)).rejects.toThrow("No project configured for this directory.");
    });

    // --- createConfigure + getConfigure ---

    it("round-trips config via createConfigure and getConfigure", async () => {
        const projectPath = path.join(tmpDir, "round-trip");
        fs.mkdirSync(projectPath, { recursive: true });

        const projectConfig = {
            path: projectPath,
            workspace_slug: "ws-rt",
            project_slug: "proj-rt",
            environment_id: "env-rt",
        };

        await config.createConfigure(projectPath, projectConfig);
        const retrieved = await config.getConfigure(projectPath);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.workspace_slug).toBe("ws-rt");
        expect(retrieved!.project_slug).toBe("proj-rt");
        expect(retrieved!.environment_id).toBe("env-rt");
        expect(retrieved!.path).toBe(path.resolve(projectPath));
    });

    // --- markAuthenticated + isAuthenticated ---

    it("round-trips authentication via markAuthenticated and isAuthenticated", async () => {
        expect(await config.isAuthenticated()).toBe(false);

        await config.markAuthenticated();

        expect(await config.isAuthenticated()).toBe(true);
    });

    // --- getConfigure with unknown path ---

    it("getConfigure returns null for unknown path", async () => {
        const result = await config.getConfigure("/nonexistent/unknown/path");
        expect(result).toBeNull();
    });

    // --- .enkryptify.json (committed, hand-written, per-directory project file) ---

    const writeLocalFile = (dir: string, data: Record<string, string>) => {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, ".enkryptify.json"), JSON.stringify(data), "utf-8");
    };

    it("reads a committed .enkryptify.json in the current directory", async () => {
        const dir = path.join(tmpDir, "apps", "app");
        writeLocalFile(dir, { workspace: "ws-app", project: "web", environment: "env-dev" });

        const found = await config.findProjectConfig(dir);
        expect(found.workspace_slug).toBe("ws-app");
        expect(found.project_slug).toBe("web");
        expect(found.environment_id).toBe("env-dev");
        expect(found.path).toBe(path.resolve(dir));
    });

    it("accepts a slug or an id for each field and passes the value through verbatim", async () => {
        const dir = path.join(tmpDir, "by-id");
        writeLocalFile(dir, { workspace: "ws_01H", project: "prj_02K", environment: "env_03M" });

        const found = await config.findProjectConfig(dir);
        expect(found.workspace_slug).toBe("ws_01H");
        expect(found.project_slug).toBe("prj_02K");
        expect(found.environment_id).toBe("env_03M");
    });

    it("walks up to find a committed .enkryptify.json in a parent directory", async () => {
        const appDir = path.join(tmpDir, "apps", "app");
        const deep = path.join(appDir, "src", "components");
        fs.mkdirSync(deep, { recursive: true });
        writeLocalFile(appDir, { workspace: "ws", project: "web", environment: "env" });

        const found = await config.findProjectConfig(deep);
        expect(found.workspace_slug).toBe("ws");
        expect(found.path).toBe(path.resolve(appDir));
    });

    it("resolves separate .enkryptify.json files per monorepo app", async () => {
        const appDir = path.join(tmpDir, "mono", "apps", "app");
        const apiDir = path.join(tmpDir, "mono", "apps", "api");
        writeLocalFile(appDir, { workspace: "ws", project: "web", environment: "env" });
        writeLocalFile(apiDir, { workspace: "ws", project: "api", environment: "env" });

        const app = await config.findProjectConfig(appDir);
        const api = await config.findProjectConfig(apiDir);
        expect(app.project_slug).toBe("web");
        expect(api.project_slug).toBe("api");
    });

    it("prefers a committed .enkryptify.json over a global path setup at the same directory", async () => {
        const dir = path.join(tmpDir, "proj");
        fs.mkdirSync(dir, { recursive: true });
        await config.createConfigure(dir, {
            path: dir,
            workspace_slug: "ws-global",
            project_slug: "global",
            environment_id: "env-global",
        });
        writeLocalFile(dir, { workspace: "ws-file", project: "file", environment: "env-file" });

        const found = await config.findProjectConfig(dir);
        expect(found.project_slug).toBe("file");
    });

    it("prefers a committed .enkryptify.json in a subdir over a git-scoped setup", async () => {
        const repoPath = path.join(tmpDir, "repo-local");
        const subdir = path.join(repoPath, "apps", "app");
        fs.mkdirSync(subdir, { recursive: true });
        execFileSync("git", ["init"], { cwd: repoPath });
        await config.createConfigure(
            repoPath,
            { path: repoPath, workspace_slug: "ws-git", project_slug: "git", environment_id: "env-git" },
            { scope: "git" },
        );
        writeLocalFile(subdir, { workspace: "ws-file", project: "app", environment: "env-file" });

        const found = await config.findProjectConfig(subdir);
        expect(found.project_slug).toBe("app");
    });

    it("throws a clear error for a malformed .enkryptify.json", async () => {
        const dir = path.join(tmpDir, "broken");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, ".enkryptify.json"), "{not json", "utf-8");

        await expect(config.findProjectConfig(dir)).rejects.toThrow("invalid JSON");
    });

    it("throws when .enkryptify.json is missing required fields", async () => {
        const dir = path.join(tmpDir, "incomplete");
        writeLocalFile(dir, { workspace: "ws" });

        await expect(config.findProjectConfig(dir)).rejects.toThrow("missing required fields");
    });

    it("does not read a .enkryptify.json located above the repository root", async () => {
        const ancestor = path.join(tmpDir, "ancestor-local");
        const repoPath = path.join(ancestor, "repo");
        const subdir = path.join(repoPath, "src");
        fs.mkdirSync(subdir, { recursive: true });
        execFileSync("git", ["init"], { cwd: repoPath });
        // A project file above the repo root must be ignored.
        writeLocalFile(ancestor, { workspace: "ws", project: "x", environment: "env" });

        await expect(config.findProjectConfig(subdir)).rejects.toThrow("No project configured");
    });
});
