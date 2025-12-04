import type { Secret } from "@/providers/base/Provider.js";

export function buildEnvWithSecrets(secrets: Secret[]): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const secret of secrets) {
        if (!secret?.name) continue;
        env[secret.name] = secret.value;
    }
    return env;
}
