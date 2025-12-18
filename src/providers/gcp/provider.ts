import { type ProjectConfig, config } from "@/lib/config";
import { getSecureInput } from "@/lib/input";
import { confirm } from "@/ui/Confirm";
import { selectName } from "@/ui/SelectItem";
import { showMessage } from "@/ui/SuccessMessage";
import { ProjectsClient } from "@google-cloud/resource-manager";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import type { LoginOptions } from "../base/AuthProvider";
import type { Provider, Secret, runOptions } from "../base/Provider";
import { GcpAuth } from "./auth";

export class GcpProvider implements Provider {
    readonly name = "gcp";
    private auth: GcpAuth;
    private projectsClient: ProjectsClient;
    private secretsClient: SecretManagerServiceClient;
    constructor() {
        this.auth = new GcpAuth();
        this.projectsClient = new ProjectsClient();
        this.secretsClient = new SecretManagerServiceClient();
    }

    login(options?: LoginOptions): Promise<void> {
        return this.auth.login(options);
    }
    async configure(options: string): Promise<ProjectConfig> {
        const setup = await config.getConfigure(options);
        if (setup) {
            const overwrite = await confirm("Setup already exists. Overwrite?");
            if (!overwrite) {
                return setup;
            }
        }

        try {
            const [projects] = await this.projectsClient.searchProjects({});
            if (projects.length === 0) {
                throw new Error("No projects found. Please create a project first before setting up.");
            }

            const labels = projects.map((p) => {
                const name = p.displayName ?? p.name ?? "Unnamed project";
                const id = p.projectId ?? "unknown-id";
                return `${name}/${id}`;
            });

            const selected = await selectName(labels, "Select project");
            if (!selected) throw new Error("Failed to select project");

            const selectedId = selected.split("/").pop();
            if (!selectedId) throw new Error("Failed to parse selected project id");

            const project = projects.find((p) => p.projectId === selectedId);
            if (!project || !project.name || !project.projectId) {
                throw new Error("Failed to find selected project");
            }

            const projectConfig: ProjectConfig = {
                path: options,
                provider: this.name,
                projectName: project.name,
                projectId: project.projectId,
            };

            showMessage(`Setup completed successfully! Project: ${project.name}/(${project.projectId})`);
            return projectConfig;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to configure GCP project message: ${message}`);
        }
    }
    async run(config: ProjectConfig, options?: runOptions): Promise<Secret[]> {
        const { projectId } = config;

        if (!projectId) {
            throw new Error("Project id is not set. Configure the GCP project first.");
        }
        console.log(options?.env);
        return await this.getAllSecretsWithAllVersions(projectId, options?.env);
    }
    async createSecret(config: ProjectConfig, name: string, value: string): Promise<void> {
        const { projectId } = config;

        if (!projectId) {
            throw new Error("Project id is not set. Configure the GCP project first before creating secrets.");
        }

        if (!name || !name.trim()) {
            throw new Error("Secret name is required and cannot be empty.");
        }

        if (!value || !value.trim()) {
            throw new Error("Secret value is required and cannot be empty.");
        }

        const parent = `projects/${projectId}`;

        try {
            try {
                await this.secretsClient.createSecret({
                    parent,
                    secretId: name,
                    secret: {
                        replication: {
                            automatic: {},
                        },
                    },
                });
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                if (!message.includes("ALREADY_EXISTS")) {
                    throw err;
                }
            }

            await this.secretsClient.addSecretVersion({
                parent: `${parent}/secrets/${name}`,
                payload: {
                    data: Buffer.from(value, "utf8"),
                },
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to create or update secret "${name}" in GCP Secret Manager: ${message}`);
        }
    }

    async updateSecret(config: ProjectConfig, name: string, _isPersonal?: boolean): Promise<void> {
        const { projectId } = config;

        if (!projectId) {
            throw new Error("Project id is not set. Configure the GCP project first before updating secrets.");
        }

        if (!name || !name.trim()) {
            throw new Error("Secret name is required and cannot be empty.");
        }

        const secretName = `projects/${projectId}/secrets/${name}`;

        try {
            await this.secretsClient.getSecret({ name: secretName });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Secret "${name}" not found or cannot be read: ${message}`);
        }

        const newValue = await getSecureInput(`Enter new value for "${name}": `);

        if (!newValue || !newValue.trim()) {
            throw new Error("Secret value cannot be empty.");
        }

        try {
            await this.secretsClient.addSecretVersion({
                parent: secretName,
                payload: {
                    data: Buffer.from(newValue, "utf8"),
                },
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to update secret "${name}" in GCP Secret Manager: ${message}`);
        }
    }

    async deleteSecret(config: ProjectConfig, name: string): Promise<void> {
        const { projectId } = config;

        if (!projectId) {
            throw new Error("Project id is not set. Configure the GCP project first before deleting secrets.");
        }

        if (!name || !name.trim()) {
            throw new Error("Secret name is required and cannot be empty.");
        }

        const secretName = `projects/${projectId}/secrets/${name}`;

        try {
            await this.secretsClient.deleteSecret({
                name: secretName,
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete secret "${name}" from GCP Secret Manager: ${message}`);
        }
    }
    async listSecrets(config: ProjectConfig, showValues?: string): Promise<Secret[]> {
        const { projectId } = config;

        if (!projectId) {
            throw new Error("Project id is not set. Configure the GCP project first.");
        }

        const shouldShow = showValues === "show";

        const allSecrets = await this.getAllSecretsWithAllVersions(projectId);

        return allSecrets.map((s) => ({
            ...s,
            value: shouldShow ? s.value : "****************",
        }));
    }

    async getAllSecretsWithAllVersions(projectId: string, env?: string): Promise<Secret[]> {
        let parent: string;
        if (env) {
            parent = `projects/${env}`;
        } else {
            parent = `projects/${projectId}`;
        }

        try {
            const [secrets] = await this.secretsClient.listSecrets({ parent });

            if (secrets.length === 0) {
                throw new Error("No secrets found in project. Please create a secret first.");
            }

            const all: Secret[] = [];

            for (const meta of secrets) {
                if (!meta.name) continue;

                const secretResourceName = meta.name;
                const secretId = secretResourceName.split("/").pop() ?? secretResourceName;

                const [versions] = await this.secretsClient.listSecretVersions({
                    parent: secretResourceName,
                });

                for (const v of versions) {
                    if (!v.name) continue;

                    const [version] = await this.secretsClient.accessSecretVersion({ name: v.name });

                    const value =
                        version.payload?.data instanceof Uint8Array
                            ? Buffer.from(version.payload.data).toString("utf8")
                            : "";

                    const versionId = v.name.split("/").pop() ?? v.name;

                    all.push({
                        id: `${secretId}:${versionId}`,
                        name: secretId,
                        value,
                    });
                }
            }

            return all;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch all secrets and versions for project "${projectId}": ${message}`);
        }
    }
}
