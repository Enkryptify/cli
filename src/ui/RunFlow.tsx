import ansiEscapes from "ansi-escapes";
import { Box, Text, render } from "ink";
import Spinner from "ink-spinner";

export interface RunFlowProps {
    envName?: string;
    projectName?: string;
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

export async function RunFlow({ envName, projectName, run }: RunFlowProps): Promise<void> {
    let loadingMessage = "Injecting secrets";
    if (projectName) {
        loadingMessage += ` for project "${projectName}"`;
    }
    if (envName) {
        loadingMessage += projectName ? ` environment "${envName}"` : ` for environment "${envName}"`;
    }
    loadingMessage += "...";

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
