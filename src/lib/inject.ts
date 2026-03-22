import type { Secret } from "@/api/client";
import { logger } from "@/lib/logger";

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
            logger.warn(
                `Secret "${secret.name}" was skipped — it conflicts with a protected environment variable (${secret.name.toUpperCase()}).`,
            );
            continue;
        }

        if (secret.name.includes("\0")) {
            logger.warn(`Secret "${secret.name}" was skipped — the name contains invalid characters.`);
            continue;
        }

        if (typeof secret.value !== "string" || secret.value.includes("\0")) {
            logger.warn(`Secret "${secret.name}" was skipped — the value is invalid.`);
            continue;
        }
        env[secret.name] = secret.value;
    }

    return env;
}
