import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIError } from "@/lib/errors";
import { FAKE_API_SECRETS, FAKE_ENVIRONMENTS, FAKE_PROJECT_CONFIG } from "../helpers/fixtures";

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

function setupDefaultMocks() {
    vi.mocked(http.get).mockImplementation((url: string, _config?: unknown) => {
        if (url.includes("/environment")) {
            return Promise.resolve({ data: FAKE_ENVIRONMENTS });
        }
        if (url.includes("/secret")) {
            return Promise.resolve({ data: FAKE_API_SECRETS });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
}

describe("EnkryptifyClient.run (integration)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("fetches secrets for configured environment", async () => {
        setupDefaultMocks();

        const secrets = await client.run(FAKE_PROJECT_CONFIG);

        expect(secrets).toHaveLength(3);
        expect(secrets.find((s) => s.name === "DATABASE_URL")?.value).toBe("postgres://localhost:5432/db");
        expect(secrets.find((s) => s.name === "JWT_SECRET")?.value).toBe("super-secret-jwt-key");
    });

    it("uses options.env to pick different environment by name", async () => {
        vi.mocked(http.get).mockImplementation((url: string, config?: unknown) => {
            if (url.includes("/environment")) {
                return Promise.resolve({ data: FAKE_ENVIRONMENTS });
            }
            if (url.includes("/secret")) {
                // Verify the environment_id param matches staging
                expect((config as { params?: { environment_id?: string } })?.params?.environment_id).toBe(
                    "env-staging-456",
                );
                return Promise.resolve({
                    data: [
                        {
                            id: "s1",
                            name: "STAGING_VAR",
                            values: [{ environmentId: "env-staging-456", value: "staging-value", isPersonal: false }],
                        },
                    ],
                });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const secrets = await client.run(FAKE_PROJECT_CONFIG, { env: "staging" });

        expect(secrets).toHaveLength(1);
        expect(secrets[0]!.name).toBe("STAGING_VAR");
        expect(secrets[0]!.value).toBe("staging-value");
    });

    it("uses options.env to pick different environment by id", async () => {
        vi.mocked(http.get).mockImplementation((url: string, config?: unknown) => {
            if (url.includes("/environment")) {
                return Promise.resolve({ data: FAKE_ENVIRONMENTS });
            }
            if (url.includes("/secret")) {
                expect((config as { params?: { environment_id?: string } })?.params?.environment_id).toBe(
                    "env-staging-456",
                );
                return Promise.resolve({
                    data: [
                        {
                            id: "s1",
                            name: "STAGING_BY_ID",
                            values: [{ environmentId: "env-staging-456", value: "by-id-value", isPersonal: false }],
                        },
                    ],
                });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const secrets = await client.run(FAKE_PROJECT_CONFIG, { env: "env-staging-456" });

        expect(secrets).toHaveLength(1);
        expect(secrets[0]!.name).toBe("STAGING_BY_ID");
    });

    it("uses options.project to override config project_slug", async () => {
        vi.mocked(http.get).mockImplementation((url: string, _config?: unknown) => {
            if (url.includes("/environment")) {
                // Verify the URL uses the overridden project slug
                expect(url).toContain("/project/custom-project/");
                return Promise.resolve({ data: FAKE_ENVIRONMENTS });
            }
            if (url.includes("/secret")) {
                expect(url).toContain("/project/custom-project/");
                return Promise.resolve({ data: FAKE_API_SECRETS });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const secrets = await client.run(FAKE_PROJECT_CONFIG, { project: "custom-project" });

        expect(secrets).toHaveLength(3);
    });

    it("throws CLIError when target environment not found", async () => {
        vi.mocked(http.get).mockImplementation((url: string, _config?: unknown) => {
            if (url.includes("/environment")) {
                return Promise.resolve({ data: FAKE_ENVIRONMENTS });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        await expect(client.run(FAKE_PROJECT_CONFIG, { env: "nonexistent-env" })).rejects.toThrow(CLIError);
        await expect(client.run(FAKE_PROJECT_CONFIG, { env: "nonexistent-env" })).rejects.toThrow(
            'Environment "nonexistent-env" not found.',
        );
    });

    it("error message lists available environments", async () => {
        vi.mocked(http.get).mockImplementation((url: string, _config?: unknown) => {
            if (url.includes("/environment")) {
                return Promise.resolve({ data: FAKE_ENVIRONMENTS });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        try {
            await client.run(FAKE_PROJECT_CONFIG, { env: "nonexistent-env" });
            expect.unreachable("Should have thrown");
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(CLIError);
            expect((error as CLIError).fix).toContain("development");
            expect((error as CLIError).fix).toContain("staging");
            expect((error as CLIError).fix).toContain("production");
        }
    });

    it("throws when no environments exist", async () => {
        vi.mocked(http.get).mockImplementation((url: string, _config?: unknown) => {
            if (url.includes("/environment")) {
                return Promise.resolve({ data: [] });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        await expect(client.run(FAKE_PROJECT_CONFIG)).rejects.toThrow(CLIError);
        await expect(client.run(FAKE_PROJECT_CONFIG)).rejects.toThrow("Could not find any environment.");
    });

    it("resolves personal value over team value", async () => {
        setupDefaultMocks();

        const secrets = await client.run(FAKE_PROJECT_CONFIG);

        const apiKey = secrets.find((s) => s.name === "API_KEY");
        expect(apiKey?.value).toBe("sk-personal-key");
        expect(apiKey?.isPersonal).toBe(true);
    });
});
