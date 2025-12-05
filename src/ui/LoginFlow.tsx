import { Box, Text } from "ink";
import BigText from "ink-big-text";
import Gradient from "ink-gradient";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";
export interface LoginFlowProps {
    providerName: string;
    runLogin: () => Promise<void>;
}

export function LoginFlow({ providerName, runLogin }: LoginFlowProps) {
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState<string>("");

    useEffect(() => {
        const performLogin = async () => {
            try {
                setMessage(`Authenticating with ${providerName}...`);
                await runLogin();
                setStatus("success");
                setMessage(`✓ Successfully authenticated with ${providerName}`);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                setStatus("error");
                setMessage(`✗ Error: ${err.message}`);
            }
        };

        void performLogin();
    }, [providerName, runLogin]);

    return (
        <Box flexDirection="column" padding={1} alignItems="center">
            <Box marginBottom={2}>
                <Gradient name="rainbow">
                    <BigText text="Welcome to Enkryptify" />
                </Gradient>
            </Box>
            <Box>
                {status === "loading" && <Spinner type="dots" />}
                {status === "success" ? (
                    <Box marginTop={1} alignItems="center" paddingX={2}>
                        <Text bold underline color="green">
                            ✓ Successfully authenticated with {providerName}
                        </Text>
                    </Box>
                ) : (
                    <Text>{message}</Text>
                )}
            </Box>
            {status === "loading" && (
                <Box marginTop={1}>
                    <Text dimColor>Please complete authentication in your browser...</Text>
                </Box>
            )}
        </Box>
    );
}
