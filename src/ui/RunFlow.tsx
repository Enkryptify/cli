import { Box, Text, render } from "ink";
import Spinner from "ink-spinner";

export interface RunFlowProps {
    envName?: string;
    run: () => Promise<void>;
}

function SpinnerComponent({ message }: { message: string }) {
    return (
        <Box flexDirection="row" gap={1}>
            <Text>
                <Spinner type="dots" />
            </Text>
            <Text>{message}</Text>
        </Box>
    );
}

export async function RunFlow({ envName, run }: RunFlowProps): Promise<void> {
    const loadingMessage = envName ? `Injecting secrets for environment "${envName}"...` : "Injecting secrets...";

    const spinner = render(<SpinnerComponent message={loadingMessage} />, {
        stdout: process.stderr,
    });

    try {
        await run();

        spinner.unmount();
        const successMessage = envName
            ? `Secrets injected successfully for environment "${envName}".\n`
            : "Secrets injected successfully.\n";
        process.stderr.write(successMessage);
    } catch (error) {
        spinner.unmount();
        // Re-throw error - let command handler log it
        throw error;
    }
}
