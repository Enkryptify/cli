type ErrorCatalogEntry = {
    message: string;
    why?: string;
    fix?: string | (() => string);
    docs?: string;
};

export class CLIError extends Error {
    constructor(
        message: string,
        public readonly why?: string,
        public readonly fix?: string,
        public readonly docs?: string,
    ) {
        super(message);
        this.name = "CLIError";
    }

    static from(code: keyof typeof CLI_ERRORS): CLIError {
        const e: ErrorCatalogEntry = CLI_ERRORS[code];
        const fix = typeof e.fix === "function" ? e.fix() : e.fix;
        return new CLIError(e.message, e.why, fix, e.docs);
    }
}

export const CLI_ERRORS = {
    // Authentication
    AUTH_NOT_LOGGED_IN: {
        message: "Not authenticated.",
        why: "No valid credentials were found.",
        fix: 'Run "ek login" to authenticate.',
        docs: "/cli/troubleshooting#authentication",
    },
    AUTH_TOKEN_EXPIRED: {
        message: "Authentication failed.",
        why: "Your session has expired or your credentials are invalid.",
        fix: 'Run "ek login" to re-authenticate.',
        docs: "/cli/troubleshooting#authentication",
    },
    AUTH_TIMEOUT: {
        message: "Authentication timed out.",
        why: "No response was received from the browser within the time limit.",
        fix: 'Run "ek login" to try again. Make sure to complete the login in your browser.',
    },
    AUTH_INVALID_STATE: {
        message: "Authentication failed due to a security mismatch.",
        why: "The authentication response could not be verified. This can happen if the login session expired.",
        fix: 'Run "ek login" to try again.',
    },
    AUTH_MISSING_CODE: {
        message: "Authentication failed. No authorization was received.",
        why: "The browser did not return a valid authorization code. You may have denied access or the flow was interrupted.",
        fix: 'Run "ek login" to try again.',
    },
    AUTH_TOKEN_EXCHANGE_FAILED: {
        message: "Could not complete the login.",
        why: "The server rejected the authentication request.",
        fix: 'Run "ek login" to try again. If this persists, check your network connection.',
    },
    AUTH_MISSING_TOKEN: {
        message: "Could not complete the login.",
        why: "The server response was incomplete. No access token was provided.",
        fix: 'Run "ek login" to try again.',
    },
    AUTH_USER_INFO_FAILED: {
        message: "Could not retrieve your account information.",
        why: "Authentication succeeded but the server failed to return your profile.",
        fix: 'Try running "ek login" again.',
    },
    AUTH_PORT_IN_USE: {
        message: "Could not start the login server.",
        why: "The required port is already in use by another application.",
        fix: "Close the application using that port and try again.",
    },

    // Configuration
    CONFIG_NOT_FOUND: {
        message: "No project configured for this directory.",
        why: "No Enkryptify configuration was found in this directory or any parent directory.",
        fix: 'Run "ek configure" to set up your project.',
        docs: "/cli/troubleshooting#configuration",
    },
    CONFIG_CORRUPTED: {
        message: "Configuration file is corrupted.",
        why: "The file contains invalid data.",
        fix: "Delete the file to reset: ~/.enkryptify/config.json",
        docs: "/cli/troubleshooting#configuration",
    },
    CONFIG_INVALID_JSON: {
        message: "Configuration file contains invalid JSON.",
        why: "The configuration file could not be parsed.",
        fix: "Delete the file to reset: ~/.enkryptify/config.json",
    },
    CONFIG_PERMISSION_DENIED: {
        message: "Cannot access the configuration file.",
        why: "Permission denied.",
        fix: (): string =>
            process.platform === "win32"
                ? "Adjust folder permissions or run your terminal as Administrator."
                : "Check file permissions: chmod 755 ~/.enkryptify",
    },
    CONFIG_READ_ONLY_FS: {
        message: "Cannot save the configuration file.",
        why: "The filesystem is mounted as read-only.",
        fix: "Remount the filesystem as read-write or use a different directory.",
    },
    CONFIG_INCOMPLETE: {
        message: "Your project configuration is incomplete.",
        why: "The configuration file is missing required fields (workspace, project or environment).",
        fix: 'Run "ek configure" to set up your project.',
        docs: "/cli/troubleshooting#configuration",
    },

    // API / HTTP
    API_UNAUTHORIZED: {
        message: "Authentication failed.",
        why: "Your session has expired or your credentials are invalid.",
        fix: 'Run "ek login" to re-authenticate.',
        docs: "/cli/troubleshooting#authentication",
    },
    API_FORBIDDEN: {
        message: "Access denied.",
        why: "Your account doesn't have permission to access this resource.",
        fix: "Check your role and permissions in the Enkryptify dashboard.",
    },
    API_NOT_FOUND: {
        message: "The requested resource was not found.",
        why: "The workspace, project, environment or secret you're trying to access doesn't exist.",
        fix: 'Run "ek configure" to update your project settings.',
    },
    API_SERVER_ERROR: {
        message: "The Enkryptify server encountered an error.",
        why: "This is a server-side issue, not a problem with your setup.",
        fix: "Try again in a few minutes. If the problem persists, contact support.",
    },
    API_NETWORK_ERROR: {
        message: "Could not connect to the Enkryptify API.",
        why: "The API server is unreachable. This could be a network issue, a firewall or the server may be down.",
        fix: "Check your internet connection and try again.",
        docs: "/cli/troubleshooting#network",
    },

    // Validation
    VALIDATION_SECRET_NAME: {
        message: "Invalid secret name.",
        why: "Secret names can only contain letters (A-Z, a-z), numbers (0-9), underscores (_) and hyphens (-).",
        docs: "/cli/troubleshooting#secrets",
    },
    VALIDATION_SECRET_VALUE_EMPTY: {
        message: "Secret value cannot be empty.",
        fix: "Provide a non-empty value for the secret.",
    },
    VALIDATION_SECRET_NAME_REQUIRED: {
        message: "Secret name is required.",
        fix: "Usage: ek [command] <secret-name>",
    },

    // Commands
    COMMAND_MISSING: {
        message: "No command provided.",
        fix: "Usage: ek run -- <your-command>. Example: ek run -- npm start",
    },
    COMMAND_CONFLICTING_FLAGS: {
        message: "Conflicting options: --skip-cache and --offline cannot be used together.",
        why: "--skip-cache forces a fresh API fetch, while --offline prevents any API calls.",
        fix: "Use only one of these options.",
    },
    ENV_REQUIRED_WITH_PROJECT: {
        message: "Missing --env flag.",
        why: "When you specify a project with --project, you must also specify which environment to use.",
        fix: "Usage: ek run --project <name> --env <environment> -- <command>",
    },

    // Resources
    NO_WORKSPACES: {
        message: "No workspaces found.",
        why: "Your account doesn't have any workspaces yet.",
        fix: "Create a workspace in the Enkryptify dashboard first.",
        docs: "/getting-started/quickstart",
    },
    NO_PROJECTS: {
        message: "No projects found.",
        why: "This workspace doesn't have any projects yet.",
        fix: "Create a project in the Enkryptify dashboard.",
        docs: "/getting-started/quickstart",
    },
    NO_ENVIRONMENTS: {
        message: "No environments found.",
        why: "This project doesn't have any environments set up yet.",
        fix: "Create an environment in the project settings on the Enkryptify dashboard.",
        docs: "/getting-started/quickstart",
    },
    NO_SECRETS: {
        message: "No secrets found.",
        why: "This project doesn't have any secrets in the current environment.",
        fix: 'Use "ek create" to add a secret.',
    },

    // SDK
    SDK_NO_COMMAND: {
        message: "No command provided.",
        fix: "Usage: ek sdk -- <command>",
    },
    SDK_NOT_CONFIGURED: {
        message: "No project configured in this directory.",
        fix: 'Run "ek configure" to set up your project first.',
        docs: "/cli/troubleshooting#configuration",
    },

    // Cache
    OFFLINE_NO_CACHE: {
        message: "No cached secrets available.",
        why: "You're in offline mode but no secrets have been cached yet.",
        fix: 'Run "ek run" at least once while online to populate the cache.',
    },

    // Upgrade
    UPGRADE_PERMISSION_DENIED: {
        message: "Upgrade failed due to insufficient permissions.",
        why: "The CLI binary could not be overwritten due to file permissions.",
        fix: "Run with elevated permissions: sudo ek upgrade",
    },
    UPGRADE_CORRUPTED: {
        message: "Upgrade failed. The download appears to be corrupted.",
        fix: "Try again or download manually from https://github.com/Enkryptify/cli/releases",
    },
    UPGRADE_CHECK_FAILED: {
        message: "Could not check for updates.",
        why: "The GitHub API is unreachable.",
        fix: "Check your internet connection and try again.",
    },
} as const;
