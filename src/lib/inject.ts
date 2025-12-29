import type { Secret } from "@/providers/base/Provider";

/**
 * Environment variables that should never be overridden by secrets
 * These control critical system behavior and could be exploited
 */
const DANGEROUS_ENV_VARS = new Set([
    "PATH",
    "PATHEXT",

    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "DYLD_LIBRARY_PATH",
    "DYLD_INSERT_LIBRARIES",
    "DYLD_FRAMEWORK_PATH",

    "PYTHONPATH",
    "NODE_PATH",
    "PERL5LIB",
    "RUBYLIB",
    "CLASSPATH",

    "IFS",
    "CDPATH",
    "ENV",
    "BASH_ENV",
    "SHELL",

    "HOME",
    "USER",
    "USERNAME",
    "SUDO_USER",
    "SUDO_UID",
    "SUDO_GID",
    "COMSPEC",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "PROGRAMW6432",
    "HOMEDRIVE",
    "HOMEPATH",
    "USERPROFILE",
    "PSMODULEPATH",
]);

function isDangerousEnvVar(name: string): boolean {
    if (!name || typeof name !== "string") {
        return false;
    }
    return DANGEROUS_ENV_VARS.has(name.toUpperCase());
}

export function buildEnvWithSecrets(secrets: Secret[]): typeof process.env {
    const env = { ...process.env };

    for (const secret of secrets) {
        if (!secret?.name || secret.value == null) continue;

        if (isDangerousEnvVar(secret.name)) {
            console.warn(
                `⚠️  Warning: Secret "${secret.name}" conflicts with a protected environment variable ` +
                    `(${secret.name.toUpperCase()}). It will not be injected for security reasons.`,
            );
            continue;
        }

        if (secret.name.includes("\0")) {
            console.warn(`⚠️  Warning: Secret name "${secret.name}" contains null bytes and will be skipped.`);
            continue;
        }

        if (typeof secret.value !== "string" || secret.value.includes("\0")) {
            console.warn(`⚠️  Warning: Secret "${secret.name}" has an invalid value and will be skipped.`);
            continue;
        }
        env[secret.name] = secret.value;
    }

    return env;
}
