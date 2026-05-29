import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_ENVIRONMENTS, FAKE_TEAMS, FAKE_WORKSPACES } from "../helpers/fixtures";

vi.mock("@/lib/logger");
vi.mock("@/lib/config");
vi.mock("@/lib/input");
vi.mock("@/ui/Confirm");
vi.mock("@/ui/SelectItem");
vi.mock("@/api/auth");

vi.mock("@/api/httpClient", () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

import http from "@/api/httpClient";
import { client } from "@/api/client";
import { importCommand } from "@/cmd/import";
import { config } from "@/lib/config";
import { getTextInput } from "@/lib/input";
import { confirm } from "@/ui/Confirm";
import { selectName } from "@/ui/SelectItem";

describe("import command", () => {
    let tmpDir: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ek-import-"));
        vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
        vi.mocked(config.isAuthenticated).mockResolvedValue(true);
        vi.mocked(confirm).mockResolvedValue(false);
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("imports the default .env file into the selected target", async () => {
        await fs.writeFile(path.join(tmpDir, ".env"), "DATABASE_URL=postgres://localhost\nAPI_KEY=secret-value\n");

        vi.mocked(http.get).mockImplementation((url: string) => {
            if (url === "/v1/workspace") return Promise.resolve({ data: [FAKE_WORKSPACES[0]] });
            if (url === "/v1/workspace/test-workspace/project") {
                return Promise.resolve({
                    data: [
                        {
                            id: "team-1",
                            name: "Test Team",
                            projects: [{ id: "proj-1", name: "Test Project", slug: "test-project" }],
                        },
                    ],
                });
            }
            if (url === "/v1/workspace/test-workspace/project/test-project/environment") {
                return Promise.resolve({ data: [FAKE_ENVIRONMENTS[0]] });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });
        vi.mocked(http.post).mockResolvedValue({ data: { success: true } });

        const result = await importCommand();

        expect(result).toEqual({ workspace_slug: "test-workspace", imported: 2 });
        expect(selectName).not.toHaveBeenCalled();
        expect(http.post).toHaveBeenCalledWith("/v1/workspace/test-workspace/project/test-project/secret", {
            environments: ["env-test-123"],
            secrets: [
                { key: "DATABASE_URL", value: "postgres://localhost", type: "runtime", dataType: "text" },
                { key: "API_KEY", value: "secret-value", type: "runtime", dataType: "text" },
            ],
        });
        await expect(fs.access(path.join(tmpDir, ".env"))).resolves.toBeUndefined();
    });

    it("deletes the source file after a successful import when confirmed", async () => {
        const envPath = path.join(tmpDir, "custom.env");
        await fs.writeFile(envPath, "API_KEY=secret-value\n");
        vi.mocked(confirm).mockResolvedValue(true);

        vi.mocked(http.get).mockImplementation((url: string) => {
            if (url === "/v1/workspace") return Promise.resolve({ data: [FAKE_WORKSPACES[0]] });
            if (url === "/v1/workspace/test-workspace/project") {
                return Promise.resolve({
                    data: [{ projects: [{ id: "proj-1", name: "Test Project", slug: "test-project" }] }],
                });
            }
            if (url === "/v1/workspace/test-workspace/project/test-project/environment") {
                return Promise.resolve({ data: [FAKE_ENVIRONMENTS[0]] });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });
        vi.mocked(http.post).mockResolvedValue({ data: { success: true } });

        await importCommand("custom.env");

        await expect(fs.access(envPath)).rejects.toThrow();
    });

    it("can create a project and environment while selecting an import target", async () => {
        let environmentCreated = false;
        vi.mocked(http.get).mockImplementation((url: string) => {
            if (url === "/v1/workspace") return Promise.resolve({ data: [FAKE_WORKSPACES[0]] });
            if (url === "/v1/workspace/test-workspace/project") return Promise.resolve({ data: [] });
            if (url === "/v1/workspace/test-workspace/team") return Promise.resolve({ data: FAKE_TEAMS });
            if (url === "/v1/workspace/test-workspace/project/new-project/environment") {
                return Promise.resolve({ data: environmentCreated ? [{ id: "env-new", name: "preview" }] : [] });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });
        vi.mocked(http.post).mockImplementation((url: string) => {
            if (url === "/v1/workspace/test-workspace/project") {
                return Promise.resolve({ data: { id: "proj-new", name: "New Project", slug: "new-project" } });
            }
            if (url === "/v1/workspace/test-workspace/project/new-project/environment") {
                environmentCreated = true;
                return Promise.resolve({ data: { success: true } });
            }
            if (url === "/v1/workspace/test-workspace/project/new-project/secret") {
                return Promise.resolve({ data: { success: true } });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });
        vi.mocked(getTextInput)
            .mockResolvedValueOnce("New Project")
            .mockResolvedValueOnce("new-project")
            .mockResolvedValueOnce("preview");

        const target = await client.selectImportTarget(tmpDir);
        await client.importSecrets(target.config, [{ key: "API_KEY", value: "secret-value" }]);

        expect(http.post).toHaveBeenCalledWith("/v1/workspace/test-workspace/project", {
            name: "New Project",
            slug: "new-project",
            teamId: "team-1",
        });
        expect(http.post).toHaveBeenCalledWith("/v1/workspace/test-workspace/project/new-project/environment", {
            name: "preview",
            hasPersonalOverrides: false,
        });
        expect(http.post).toHaveBeenCalledWith("/v1/workspace/test-workspace/project/new-project/secret", {
            environments: ["env-new"],
            secrets: [{ key: "API_KEY", value: "secret-value", type: "runtime", dataType: "text" }],
        });
    });
});
