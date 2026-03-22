const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export const PREFIX = "[Enkryptify]";
export const DOCS_BASE = "https://docs.enkryptify.com";

export type LogOptions = {
    why?: string;
    fix?: string;
    docs?: string;
};

function formatMessage(color: string, message: string, options?: LogOptions): string {
    let output = `${color}${PREFIX} ${message}${RESET}`;

    if (options?.why) {
        output += `\n${DIM}  Why: ${options.why}${RESET}`;
    }
    if (options?.fix) {
        output += `\n${DIM}  Fix: ${options.fix}${RESET}`;
    }
    if (options?.docs) {
        const docsUrl = options.docs.startsWith("http") ? options.docs : `${DOCS_BASE}${options.docs}`;
        output += `\n${DIM}  Docs: ${docsUrl}${RESET}`;
    }

    return output;
}

function isDebug(): boolean {
    return process.env.EK_DEBUG === "1" || process.env.EK_VERBOSE === "1";
}

export const logger = {
    info(message: string): void {
        console.log(formatMessage(CYAN, message));
    },

    success(message: string): void {
        console.log(formatMessage(GREEN, message));
    },

    warn(message: string, options?: LogOptions): void {
        console.error(formatMessage(YELLOW, message, options));
    },

    error(message: string, options?: LogOptions): void {
        console.error(formatMessage(RED, message, options));
    },

    debug(message: string): void {
        if (!isDebug()) return;
        console.error(formatMessage(DIM, message));
    },

    stderr: {
        info(message: string): void {
            process.stderr.write(`${formatMessage(CYAN, message)}\n`);
        },

        success(message: string): void {
            process.stderr.write(`${formatMessage(GREEN, message)}\n`);
        },

        warn(message: string, options?: LogOptions): void {
            process.stderr.write(`${formatMessage(YELLOW, message, options)}\n`);
        },
    },
};
