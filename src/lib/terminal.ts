export function restoreCursor(): void {
    process.stdout.write("\x1b[?25h");
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
        console.error(error);
        process.exit(1);
    });
}
