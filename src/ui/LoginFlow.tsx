import type { LoginOptions } from "@/api/auth";
import { Box, render } from "ink";
import { EnkryptifyLogin } from "./EnkryptifyLogin";

export interface LoginFlowProps {
    options?: LoginOptions;
    onError?: (error: Error) => void;
    onComplete?: () => void;
}

function LoginFlowComponent({ options, onError, onComplete }: LoginFlowProps) {
    return (
        <Box flexDirection="column" padding={1}>
            <EnkryptifyLogin options={options} onError={onError} onComplete={onComplete} />
        </Box>
    );
}
export async function LoginFlow({ options, onError, onComplete }: LoginFlowProps): Promise<void> {
    return new Promise((resolve, reject) => {
        let isResolved = false;

        const login = render(
            <LoginFlowComponent
                options={options}
                onError={(error) => {
                    if (isResolved) return;
                    isResolved = true;
                    onError?.(error);
                    process.nextTick(() => {
                        login.unmount();
                        reject(error);
                    });
                }}
                onComplete={() => {
                    if (isResolved) return;
                    isResolved = true;
                    process.nextTick(() => {
                        login.unmount();
                        onComplete?.();
                        resolve();
                    });
                }}
            />,
        );

        login
            .waitUntilExit()
            .then(() => {
                if (!isResolved) {
                    isResolved = true;
                    resolve();
                }
            })
            .catch((error) => {
                if (!isResolved) {
                    isResolved = true;
                    reject(error);
                }
            });
    });
}
