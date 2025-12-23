import { Box, Text, render } from "ink";
import Spinner from "ink-spinner";

export interface RunFlowProps {
    envName?: string;
    run: (unmountSpinner: () => void) => Promise<void>;
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

    const unmountSpinner = () => spinner.unmount();

    try {
        await run(unmountSpinner);

        const successMessage = envName
            ? `Secrets injected successfully for environment "${envName}".\n`
            : "Secrets injected successfully.\n";

        process.stderr.write(successMessage);
    } catch (error) {
        spinner.unmount();
        throw error;
    }
}
