import ansiEscapes from "ansi-escapes";
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

    let done = false;

    const unmountSpinner = () => {
        if (done) return;
        done = true;

        spinner.unmount();

        process.stderr.write(ansiEscapes.eraseLines(1));
    };

    try {
        await run(unmountSpinner);
        unmountSpinner();
    } catch (error) {
        unmountSpinner();
        throw error;
    }
}
