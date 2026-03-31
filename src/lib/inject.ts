import type { Secret } from "@/api/client";
import { logger } from "@/lib/logger";

/**
 * Environment variables that should never be overridden by secrets.
 * These control critical system/runtime behavior and could be exploited.
 *
 * This blocklist is best-effort and cannot be exhaustive.
 * For stronger isolation, use --prefix to namespace all injected secrets.
 */
const DANGEROUS_ENV_VARS = new Set([
    // System paths
    "PATH",
    "PATHEXT",

    // Library loading (Linux)
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "LD_AUDIT",
    "LD_PROFILE",

    // Library loading (macOS)
    "DYLD_LIBRARY_PATH",
    "DYLD_INSERT_LIBRARIES",
    "DYLD_FRAMEWORK_PATH",

    // Java / JVM
    "JAVA_TOOL_OPTIONS",
    "_JAVA_OPTIONS",
    "JDK_JAVA_OPTIONS",

    // Node.js
    "NODE_OPTIONS",
    "NODE_PATH",
    "NODE_EXTRA_CA_CERTS",

    // Python
    "PYTHONPATH",
    "PYTHONSTARTUP",
    "PYTHONHOME",

    // Ruby
    "RUBYLIB",
    "RUBYOPT",
    "GEM_HOME",
    "GEM_PATH",

    // Perl
    "PERL5LIB",
    "PERL5OPT",
    "PERLLIB",

    // .NET
    "DOTNET_STARTUP_HOOKS",
    "COR_ENABLE_PROFILING",
    "COR_PROFILER",
    "COR_PROFILER_PATH",

    // Go / Rust
    "GOFLAGS",
    "RUSTFLAGS",

    // Java classpath
    "CLASSPATH",

    // Shell execution
    "IFS",
    "CDPATH",
    "ENV",
    "BASH_ENV",
    "SHELL",
    "PROMPT_COMMAND",

    // Proxy (traffic interception)
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "FTP_PROXY",
    "NO_PROXY",

    // SSL/TLS (MitM)
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "REQUESTS_CA_BUNDLE",
    "CURL_CA_BUNDLE",

    // Git
    "GIT_SSH_COMMAND",
    "GIT_CONFIG_GLOBAL",

    // User context
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

export function isDangerousEnvVar(name: string): boolean {
    if (!name || typeof name !== "string") {
        return false;
    }
    return DANGEROUS_ENV_VARS.has(name.toUpperCase());
}

export type InjectResult = {
    env: typeof process.env;
    injectedCount: number;
    skippedSecrets: string[];
};

export function buildEnvWithSecrets(
    secrets: Secret[],
    options?: { prefix?: string; allowDangerousVars?: boolean },
): InjectResult {
    const env = { ...process.env };
    let injectedCount = 0;
    const skippedSecrets: string[] = [];

    if (options?.allowDangerousVars) {
        logger.warn(
            "Protected environment variable checks are disabled (--allow-dangerous-vars). Secrets may override critical system variables.",
        );
    }

    for (const secret of secrets) {
        if (!secret?.name || secret.value == null) continue;

        const envName = options?.prefix ? `${options.prefix}${secret.name}` : secret.name;

        if (!options?.allowDangerousVars && isDangerousEnvVar(envName)) {
            logger.warn(
                `Secret "${secret.name}" was skipped. It conflicts with a protected environment variable (${envName.toUpperCase()}).`,
            );
            skippedSecrets.push(envName);
            continue;
        }

        if (secret.name.includes("\0")) {
            logger.warn(`Secret "${secret.name}" was skipped. The name contains invalid characters.`);
            skippedSecrets.push(envName);
            continue;
        }

        if (typeof secret.value !== "string" || secret.value.includes("\0")) {
            logger.warn(`Secret "${secret.name}" was skipped. The value is invalid.`);
            skippedSecrets.push(envName);
            continue;
        }

        if (secret.value.includes("\r")) {
            logger.warn(
                `Secret "${secret.name}" contains carriage return (\\r) characters. This may cause unexpected behavior.`,
            );
        }

        env[envName] = secret.value;
        injectedCount++;
    }

    return { env, injectedCount, skippedSecrets };
}
