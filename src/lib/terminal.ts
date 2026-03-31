import { logger } from "@/lib/logger";

export function restoreCursor(): void {
    if (process.stdout.isTTY) {
        process.stdout.write("\x1b[?25h");
    }
}

export function setupTerminalCleanup(): void {
    const cleanup = () => {
        restoreCursor();
    };

    process.on("exit", cleanup);

    process.on("SIGINT", () => {
        cleanup();
        process.exit(0);
    });

    process.on("SIGTERM", () => {
        cleanup();
        process.exit(0);
    });

    process.on("uncaughtException", (error) => {
        cleanup();
        logger.error("Uncaught exception.", {
            why: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
    });
}
