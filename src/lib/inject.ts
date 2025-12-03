import type { Secret } from "@/providers/base/Provider.js";

/**
 * Secret injector options
 */
export interface InjectOptions {
    /**
     * Additional environment variables to inject
     */
    env?: { [key: string]: string };
}

/**
 * Secret injector - converts secrets to environment variables and executes commands
 *
 * Works for ALL providers (they all return normalized Secret[] format)
 */
export class SecretInjector {
    /**
     * Inject secrets as environment variables and execute command
     * @param secrets Array of secrets to inject
     * @param command Command to execute (e.g., ["npm", "start"])
     * @param options Optional inject options
     */
    async injectAndRun(secrets: Secret[], command: string[], options?: InjectOptions): Promise<void> {}
}

// Singleton instance
export const injector = new SecretInjector();
