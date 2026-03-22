import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIError } from "@/lib/errors";
import { FAKE_API_SECRETS, FAKE_PROJECT_CONFIG } from "../helpers/fixtures";

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

describe("EnkryptifyClient secrets (integration)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // --- checkProjectConfig (tested indirectly) ---

    describe("checkProjectConfig", () => {
        it("throws when workspace_slug is missing", async () => {
            const badConfig = { path: "/tmp/test", workspace_slug: "", project_slug: "proj", environment_id: "env-1" };
            await expect(client.listSecrets(badConfig)).rejects.toThrow(CLIError);
            await expect(client.listSecrets(badConfig)).rejects.toThrow("Your project configuration is incomplete.");
        });

        it("throws when project_slug is missing", async () => {
            const badConfig = { path: "/tmp/test", workspace_slug: "ws", project_slug: "", environment_id: "env-1" };
            await expect(client.listSecrets(badConfig)).rejects.toThrow(CLIError);
            await expect(client.listSecrets(badConfig)).rejects.toThrow("Your project configuration is incomplete.");
        });

        it("throws when environment_id is missing", async () => {
            const badConfig = { path: "/tmp/test", workspace_slug: "ws", project_slug: "proj", environment_id: "" };
            await expect(client.listSecrets(badConfig)).rejects.toThrow(CLIError);
            await expect(client.listSecrets(badConfig)).rejects.toThrow("Your project configuration is incomplete.");
        });
    });

    // --- listSecrets ---

    describe("listSecrets", () => {
        it("returns masked values by default", async () => {
            vi.mocked(http.get).mockResolvedValue({ data: FAKE_API_SECRETS });

            const secrets = await client.listSecrets(FAKE_PROJECT_CONFIG);

            expect(secrets).toHaveLength(3);
            for (const secret of secrets) {
                expect(secret.value).toBe("*********");
                expect(secret.environmentId).toBe("*********");
            }
        });

        it("reveals values when showValues='show'", async () => {
            vi.mocked(http.get).mockResolvedValue({ data: FAKE_API_SECRETS });

            const secrets = await client.listSecrets(FAKE_PROJECT_CONFIG, "show");

            const dbUrl = secrets.find((s) => s.name === "DATABASE_URL");
            expect(dbUrl?.value).toBe("postgres://localhost:5432/db");

            const jwtSecret = secrets.find((s) => s.name === "JWT_SECRET");
            expect(jwtSecret?.value).toBe("super-secret-jwt-key");
        });

        it("prefers personal value over non-personal", async () => {
            vi.mocked(http.get).mockResolvedValue({ data: FAKE_API_SECRETS });

            const secrets = await client.listSecrets(FAKE_PROJECT_CONFIG, "show");

            const apiKey = secrets.find((s) => s.name === "API_KEY");
            expect(apiKey?.value).toBe("sk-personal-key");
            expect(apiKey?.isPersonal).toBe(true);
        });

        it("handles secret with no matching environment values", async () => {
            const secretsWithNoMatch = [
                {
                    id: "s1",
                    name: "ORPHANED_SECRET",
                    values: [{ environmentId: "env-other-999", value: "some-value", isPersonal: false }],
                },
            ];
            vi.mocked(http.get).mockResolvedValue({ data: secretsWithNoMatch });

            const secrets = await client.listSecrets(FAKE_PROJECT_CONFIG, "show");

            expect(secrets).toHaveLength(1);
            expect(secrets[0]!.name).toBe("ORPHANED_SECRET");
            expect(secrets[0]!.value).toBe("*********");
            expect(secrets[0]!.isPersonal).toBe(false);
        });
    });

    // --- createSecret ---

    describe("createSecret", () => {
        it("posts correct payload structure", async () => {
            vi.mocked(http.post).mockResolvedValue({ data: { success: true } });

            await client.createSecret(FAKE_PROJECT_CONFIG, "NEW_SECRET", "new-value-123");

            expect(http.post).toHaveBeenCalledOnce();
            expect(http.post).toHaveBeenCalledWith(
                `/v1/workspace/${FAKE_PROJECT_CONFIG.workspace_slug}/project/${FAKE_PROJECT_CONFIG.project_slug}/secret`,
                {
                    environments: [FAKE_PROJECT_CONFIG.environment_id],
                    secrets: [
                        {
                            key: "NEW_SECRET",
                            value: "new-value-123",
                            type: "runtime",
                            dataType: "text",
                        },
                    ],
                },
            );
        });
    });

    // --- deleteSecret ---

    describe("deleteSecret", () => {
        it("throws when name is empty", async () => {
            await expect(client.deleteSecret(FAKE_PROJECT_CONFIG, "")).rejects.toThrow(CLIError);
            await expect(client.deleteSecret(FAKE_PROJECT_CONFIG, "   ")).rejects.toThrow(CLIError);
        });

        it("throws when secret not found", async () => {
            vi.mocked(http.get).mockResolvedValue({ data: FAKE_API_SECRETS });

            await expect(client.deleteSecret(FAKE_PROJECT_CONFIG, "NONEXISTENT_SECRET")).rejects.toThrow(CLIError);
            await expect(client.deleteSecret(FAKE_PROJECT_CONFIG, "NONEXISTENT_SECRET")).rejects.toThrow(
                'Secret "NONEXISTENT_SECRET" not found.',
            );
        });

        it("calls HTTP DELETE with correct URL", async () => {
            vi.mocked(http.get).mockResolvedValue({ data: FAKE_API_SECRETS });
            vi.mocked(http.delete).mockResolvedValue({ data: { success: true } });

            await client.deleteSecret(FAKE_PROJECT_CONFIG, "DATABASE_URL");

            expect(http.delete).toHaveBeenCalledOnce();
            expect(http.delete).toHaveBeenCalledWith(
                `/v1/workspace/${FAKE_PROJECT_CONFIG.workspace_slug}/project/${FAKE_PROJECT_CONFIG.project_slug}/secret/s1`,
            );
        });

        it("throws when no secrets exist", async () => {
            vi.mocked(http.get).mockResolvedValue({ data: [] });

            await expect(client.deleteSecret(FAKE_PROJECT_CONFIG, "DATABASE_URL")).rejects.toThrow(CLIError);
            await expect(client.deleteSecret(FAKE_PROJECT_CONFIG, "DATABASE_URL")).rejects.toThrow(
                "Could not find any secret.",
            );
        });
    });
});
