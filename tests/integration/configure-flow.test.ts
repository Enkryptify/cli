import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIError } from "@/lib/errors";
import { FAKE_ENVIRONMENTS, FAKE_PROJECTS, FAKE_WORKSPACES } from "../helpers/fixtures";

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
import { config } from "@/lib/config";
import { confirm } from "@/ui/Confirm";
import { selectName } from "@/ui/SelectItem";
import { client } from "@/api/client";

describe("client.configure() flow (integration)", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default: no existing setup
        vi.mocked(config.getConfigure).mockResolvedValue(null);

        // Mock HTTP responses for the 3-step flow
        vi.mocked(http.get).mockImplementation((url: string) => {
            if (url === "/v1/workspace") {
                return Promise.resolve({ data: FAKE_WORKSPACES });
            }
            if (url.match(/\/v1\/workspace\/[^/]+\/project$/)) {
                return Promise.resolve({ data: FAKE_PROJECTS });
            }
            if (url.match(/\/v1\/workspace\/[^/]+\/project\/[^/]+\/environment$/)) {
                return Promise.resolve({ data: FAKE_ENVIRONMENTS });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        // Mock UI selections: pick first workspace, first project, first environment
        vi.mocked(selectName)
            .mockResolvedValueOnce("Test Workspace (test-workspace)") // workspace
            .mockResolvedValueOnce("Test Project (test-project)") // project
            .mockResolvedValueOnce("development"); // environment
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns ProjectConfig with correct workspace_slug, project_slug, environment_id", async () => {
        const result = await client.configure("/tmp/test");

        expect(result.workspace_slug).toBe("test-workspace");
        expect(result.project_slug).toBe("test-project");
        expect(result.environment_id).toBe("env-test-123");
        expect(result.path).toBe("/tmp/test");
    });

    it("fetches projects for the selected workspace (correct slug in URL)", async () => {
        await client.configure("/tmp/test");

        const projectCall = vi
            .mocked(http.get)
            .mock.calls.find((call) => typeof call[0] === "string" && call[0].includes("/project"));
        expect(projectCall).toBeDefined();
        expect(projectCall![0]).toContain("/workspace/test-workspace/project");
    });

    it("fetches environments for the selected project (correct slugs in URL)", async () => {
        await client.configure("/tmp/test");

        const envCall = vi
            .mocked(http.get)
            .mock.calls.find((call) => typeof call[0] === "string" && call[0].includes("/environment"));
        expect(envCall).toBeDefined();
        expect(envCall![0]).toContain("/workspace/test-workspace/project/test-project/environment");
    });

    it("throws CLIError when no workspaces found", async () => {
        vi.mocked(http.get).mockImplementation((url: string) => {
            if (url === "/v1/workspace") {
                return Promise.resolve({ data: [] });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        await expect(client.configure("/tmp/test")).rejects.toThrow(CLIError);
        await expect(client.configure("/tmp/test")).rejects.toThrow("workspace");
    });

    it("throws CLIError when no projects found", async () => {
        vi.mocked(http.get).mockImplementation((url: string) => {
            if (url === "/v1/workspace") {
                return Promise.resolve({ data: FAKE_WORKSPACES });
            }
            if (url.includes("/project")) {
                // Teams exist but have no projects
                return Promise.resolve({ data: [{ projects: [] }] });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        vi.mocked(selectName).mockReset();
        vi.mocked(selectName).mockResolvedValue("Test Workspace (test-workspace)");

        try {
            await client.configure("/tmp/test");
            expect.unreachable("Should have thrown");
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(CLIError);
            expect((error as CLIError).message).toContain("No projects found");
        }
    });

    it("throws CLIError when no environments found", async () => {
        vi.mocked(http.get).mockImplementation((url: string) => {
            if (url === "/v1/workspace") {
                return Promise.resolve({ data: FAKE_WORKSPACES });
            }
            if (url.match(/\/v1\/workspace\/[^/]+\/project$/)) {
                return Promise.resolve({ data: FAKE_PROJECTS });
            }
            if (url.includes("/environment")) {
                return Promise.resolve({ data: [] });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        vi.mocked(selectName).mockReset();
        vi.mocked(selectName).mockImplementation(async (_items: string[], prompt?: string) => {
            if (prompt === "Select workspace") return "Test Workspace (test-workspace)";
            if (prompt === "Select project") return "Test Project (test-project)";
            return "";
        });

        try {
            await client.configure("/tmp/test");
            expect.unreachable("Should have thrown");
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(CLIError);
            expect((error as CLIError).message).toContain("Could not find any environment");
        }
    });

    it("asks to overwrite when setup already exists", async () => {
        const existingConfig = {
            path: "/tmp/test",
            workspace_slug: "old-ws",
            project_slug: "old-proj",
            environment_id: "old-env",
        };
        vi.mocked(config.getConfigure).mockResolvedValue(existingConfig);
        vi.mocked(confirm).mockResolvedValue(true);

        await client.configure("/tmp/test");

        expect(confirm).toHaveBeenCalledWith("Setup already exists. Overwrite?");
    });

    it("returns existing config when user declines overwrite", async () => {
        const existingConfig = {
            path: "/tmp/test",
            workspace_slug: "old-ws",
            project_slug: "old-proj",
            environment_id: "old-env",
        };
        vi.mocked(config.getConfigure).mockResolvedValue(existingConfig);
        vi.mocked(confirm).mockResolvedValue(false);

        const result = await client.configure("/tmp/test");

        expect(result).toBe(existingConfig);
        // Should not have fetched workspaces
        expect(http.get).not.toHaveBeenCalled();
    });

    it("extracts correct slug from workspace label (label ≠ slug)", async () => {
        // The label is "Test Workspace (test-workspace)" but only slug "test-workspace" should be used in URL
        await client.configure("/tmp/test");

        // Verify workspace slug was used in project fetch URL, not the label
        const projectCall = vi
            .mocked(http.get)
            .mock.calls.find((call) => typeof call[0] === "string" && call[0].includes("/project"));
        expect(projectCall![0]).toBe("/v1/workspace/test-workspace/project");
        expect(projectCall![0]).not.toContain("Test Workspace");
    });
});
