import type { ProjectConfig } from "@/lib/config";
import type { Secret } from "@/api/client";

export const FAKE_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.fake-test-token";

export const FAKE_AUTH_DATA = {
    accessToken: FAKE_TOKEN,
    userId: "user-test-123",
    email: "test@enkryptify.com",
};

export const FAKE_PROJECT_CONFIG: ProjectConfig = {
    path: "/tmp/test-project",
    workspace_slug: "test-workspace",
    project_slug: "test-project",
    environment_id: "env-test-123",
};

export const FAKE_INCOMPLETE_CONFIG: ProjectConfig = {
    path: "/tmp/test-project",
    workspace_slug: "test-workspace",
    project_slug: "",
    environment_id: "",
};

export const FAKE_SECRETS: Secret[] = [
    {
        id: "s1",
        name: "DATABASE_URL",
        value: "postgres://localhost:5432/db",
        isPersonal: false,
        environmentId: "env-test-123",
    },
    { id: "s2", name: "API_KEY", value: "sk-test-abc123", isPersonal: false, environmentId: "env-test-123" },
    { id: "s3", name: "JWT_SECRET", value: "super-secret-jwt-key", isPersonal: false, environmentId: "env-test-123" },
];

export const FAKE_SECRETS_WITH_PERSONAL: Secret[] = [
    {
        id: "s1",
        name: "DATABASE_URL",
        value: "postgres://localhost:5432/db",
        isPersonal: false,
        environmentId: "env-test-123",
    },
    { id: "s2", name: "API_KEY", value: "sk-personal-key", isPersonal: true, environmentId: "env-test-123" },
];

export const FAKE_API_SECRETS = [
    {
        id: "s1",
        name: "DATABASE_URL",
        values: [{ environmentId: "env-test-123", value: "postgres://localhost:5432/db", isPersonal: false }],
    },
    {
        id: "s2",
        name: "API_KEY",
        values: [
            { environmentId: "env-test-123", value: "sk-team-key", isPersonal: false },
            { environmentId: "env-test-123", value: "sk-personal-key", isPersonal: true },
        ],
    },
    {
        id: "s3",
        name: "JWT_SECRET",
        values: [{ environmentId: "env-test-123", value: "super-secret-jwt-key", isPersonal: false }],
    },
];

export const FAKE_WORKSPACES = [
    { id: "ws-1", name: "Test Workspace", slug: "test-workspace" },
    { id: "ws-2", name: "Other Workspace", slug: "other-workspace" },
];

export const FAKE_ENVIRONMENTS = [
    { id: "env-test-123", name: "development" },
    { id: "env-staging-456", name: "staging" },
    { id: "env-prod-789", name: "production" },
];

export const FAKE_PROJECTS = [
    {
        projects: [
            { id: "proj-1", name: "Test Project", slug: "test-project" },
            { id: "proj-2", name: "Other Project", slug: "other-project" },
        ],
    },
];
