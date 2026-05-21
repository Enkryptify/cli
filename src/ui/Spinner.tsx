import { PREFIX } from "@/lib/logger";
import ansiEscapes from "ansi-escapes";
import { Box, Text, render } from "ink";
import Spinner from "ink-spinner";

function SpinnerComponent({ message, hint }: { message: string; hint?: string }) {
    return (
        <Box flexDirection="row" gap={1}>
            <Text>
                <Spinner type="dots" />
            </Text>
            <Text>
                {PREFIX} {message}
            </Text>
            {hint ? <Text dimColor>· {hint}</Text> : null}
        </Box>
    );
}

// Render a spinner to stderr while `fn` runs, then erase it. Mirrors RunFlow's pattern.
// `hint` is shown dimmed after the message (e.g. an attribution).
export async function withSpinner<T>(message: string, fn: () => Promise<T>, hint?: string): Promise<T> {
    const spinner = render(<SpinnerComponent message={message} hint={hint} />, { stdout: process.stderr });

    try {
        return await fn();
    } finally {
        spinner.unmount();
        process.stderr.write(ansiEscapes.eraseLines(1));
    }
}
