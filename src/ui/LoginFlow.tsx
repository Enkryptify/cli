import type { LoginOptions } from "@/providers/base/AuthProvider";
import type { Provider } from "@/providers/base/Provider";
import { Box, Text, render } from "ink";
import { AwsLogin } from "./AwsLogin";
import { EnkryptifyLogin } from "./EnkryptifyLogin";
import { GcpLogin } from "./GcpLogin";

export interface LoginFlowProps {
    provider: Provider;
    options?: LoginOptions;
    onError?: (error: Error) => void;
    onComplete?: () => void;
}

function LoginFlowComponent({ provider, options, onError, onComplete }: LoginFlowProps) {
    const renderProviderComponent = () => {
        switch (provider.name) {
            case "enkryptify":
                return (
                    <EnkryptifyLogin provider={provider} options={options} onError={onError} onComplete={onComplete} />
                );
            case "aws":
                return <AwsLogin provider={provider} options={options} onError={onError} onComplete={onComplete} />;
            case "gcp":
                return <GcpLogin provider={provider} options={options} onError={onError} onComplete={onComplete} />;

            default:
                return (
                    <Box>
                        <Text>Unknown provider: {provider.name}</Text>
                    </Box>
                );
        }
    };

    return (
        <Box flexDirection="column" padding={1}>
            {renderProviderComponent()}
        </Box>
    );
}
export async function LoginFlow({ provider, options, onError }: LoginFlowProps): Promise<void> {
    return new Promise((resolve, reject) => {
        let isResolved = false;

        const login = render(
            <LoginFlowComponent
                provider={provider}
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
