import { type ProjectConfig, config } from "@/lib/config";
import { getSecureInput, getTextInput } from "@/lib/input";
import { AwsAuth } from "@/providers/aws/auth";
import {
    CreateSecretCommand,
    DeleteSecretCommand,
    GetSecretValueCommand,
    ListSecretsCommand,
    PutSecretValueCommand,
    SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import type { LoginOptions } from "../base/AuthProvider";
import type { Provider, Secret, runOptions } from "../base/Provider";

export class AwsProvider implements Provider {
    readonly name = "aws";
    private auth: AwsAuth;
    private readonly secretsClient: SecretsManagerClient;

    constructor() {
        this.auth = new AwsAuth();
        this.secretsClient = new SecretsManagerClient({});
    }

    async configure(options: string): Promise<ProjectConfig> {
        const setup = await config.getConfigure(options);
        if (setup) {
            const overwrite = await confirm("Setup already exists. Overwrite?");
            if (!overwrite) {
                return setup;
            }
        }

        while (true) {
            const rawPrefix = await getTextInput("Enter the AWS Secrets Manager prefix (e.g. myapp/ or myapp/dev/):");
            const prefix = rawPrefix.trim();

            if (!prefix) {
                console.log("Prefix is required and cannot be empty.");
                continue;
            }

            let nextToken: string | undefined;
            let found = false;

            try {
                do {
                    const res = await this.secretsClient.send(new ListSecretsCommand({ NextToken: nextToken }));

                    for (const secret of res.SecretList ?? []) {
                        if (secret.Name?.startsWith(prefix)) {
                            found = true;
                            break;
                        }
                    }

                    if (found) break;
                    nextToken = res.NextToken;
                } while (nextToken);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                console.log(`Failed to query AWS Secrets Manager: ${message}`);
                continue;
            }

            if (!found) {
                console.log(`❌ No secrets found with prefix "${prefix}". Please try again.`);
                continue;
            }

            console.log(`✔ AWS configuration is complete for this project.`);
            return {
                path: options,
                provider: this.name,
                prefix,
            };
        }
    }
    async run(config: ProjectConfig, options?: runOptions): Promise<Secret[]> {
        const prefix = config.prefix ?? options?.env;

        if (!prefix) {
            throw new Error("AWS provider config is missing `prefix`");
        }

        const allSecrets = [];
        let nextToken: string | undefined;

        do {
            const res = await this.secretsClient.send(new ListSecretsCommand({ NextToken: nextToken }));

            allSecrets.push(...(res.SecretList ?? []));
            nextToken = res.NextToken;
        } while (nextToken);

        const matches = allSecrets.filter((s) => s.Name && s.Name.startsWith(prefix));

        const secrets = await Promise.all(
            matches.map(async (meta) => {
                const valueRes = await this.secretsClient.send(
                    new GetSecretValueCommand({
                        SecretId: meta.ARN ?? meta.Name!,
                    }),
                );

                const fullName = meta.Name!;

                let envName = fullName.slice(prefix.length);
                envName = envName.replace(/^\/+/, "");

                return {
                    name: envName,
                    value: valueRes.SecretString ?? "",
                };
            }),
        );

        return secrets;
    }

    async createSecret(config: ProjectConfig, name: string, value: string): Promise<void> {
        const prefix = config.prefix;
        if (!prefix) {
            throw new Error("AWS provider config is missing `prefix`");
        }

        if (!value || value.trim().length === 0) {
            throw new Error("Secret value cannot be empty.");
        }

        const fullName = this.buildFullName(prefix, name);

        try {
            await this.secretsClient.send(
                new CreateSecretCommand({
                    Name: fullName,
                    SecretString: value,
                }),
            );
            console.log(`✔ Secret "${name}" created successfully in prefix "${prefix}".`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ Failed to create secret "${name}": ${message}`);
            throw new Error(`Failed to create secret "${name}"`, { cause: error });
        }
    }
    async updateSecret(config: ProjectConfig, name: string): Promise<void> {
        const prefix = config.prefix;
        if (!prefix) {
            throw new Error("AWS provider config is missing `prefix`");
        }

        if (!name || !name.trim()) {
            throw new Error("Secret name is required");
        }

        const awsSecretName = this.buildFullName(prefix, name);

        try {
            await this.secretsClient.send(
                new GetSecretValueCommand({
                    SecretId: awsSecretName,
                }),
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`❌ Secret "${name}" not found or cannot be read: ${message}`, { cause: error });
        }

        const newValue = await getSecureInput(`Enter new value for ${name}: `);

        if (!newValue || !newValue.trim()) {
            throw new Error("Secret value cannot be empty");
        }

        try {
            await this.secretsClient.send(
                new PutSecretValueCommand({
                    SecretId: awsSecretName,
                    SecretString: newValue,
                }),
            );

            console.log(`✔ Secret "${name}" updated successfully`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`❌ Failed to update secret "${name}": ${message}`, { cause: error });
        }
    }
    async deleteSecret(config: ProjectConfig, name: string): Promise<void> {
        const prefix = config.prefix;

        if (!prefix) {
            throw new Error("AWS provider config is missing `prefix`");
        }

        if (!name || !name.trim()) {
            throw new Error("Secret name is required. Please provide a secret name.");
        }

        const fullName = this.buildFullName(prefix, name);

        try {
            await this.secretsClient.send(
                new DeleteSecretCommand({
                    SecretId: fullName,
                    ForceDeleteWithoutRecovery: true,
                }),
            );

            console.log(`✔ Secret "${name}" deleted successfully from prefix "${prefix}".`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ Failed to delete secret "${name}": ${message}`);
            throw new Error(`Failed to delete secret "${name}"`, { cause: error });
        }
    }
    async listSecrets(config: ProjectConfig, showValues?: string): Promise<Secret[]> {
        const prefix = config.prefix;

        if (!prefix) {
            throw new Error("AWS provider config is missing `prefix`");
        }

        const shouldShow = showValues === "show";

        const allSecrets = [];
        let nextToken: string | undefined;

        do {
            const res = await this.secretsClient.send(new ListSecretsCommand({ NextToken: nextToken }));

            allSecrets.push(...(res.SecretList ?? []));
            nextToken = res.NextToken;
        } while (nextToken);

        const matches = allSecrets.filter((s) => s.Name && s.Name.startsWith(prefix));

        const secrets = await Promise.all(
            matches.map(async (meta) => {
                const valueRes = await this.secretsClient.send(
                    new GetSecretValueCommand({
                        SecretId: meta.ARN ?? meta.Name!,
                    }),
                );

                const fullName = meta.Name!;

                let envName = fullName.slice(prefix.length);
                envName = envName.replace(/^\/+/, "");

                return {
                    name: envName,
                    value: shouldShow ? (valueRes.SecretString ?? "") : "*********",
                };
            }),
        );

        return secrets;
    }

    async login(options?: LoginOptions): Promise<void> {
        await this.auth.login(options);
    }

    private normalizePrefix(prefix: string): string {
        return prefix.replace(/\/+$/, "");
    }

    private buildFullName(prefix: string, name: string): string {
        return `${this.normalizePrefix(prefix)}/${name}`;
    }
}
