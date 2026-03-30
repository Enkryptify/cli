import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
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
});
