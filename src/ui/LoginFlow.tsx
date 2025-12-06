import { Box, Text, useStdout } from "ink";
import BigText from "ink-big-text";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";

export interface LoginFlowProps {
    providerName: string;
    runLogin: () => Promise<void>;
}

export function LoginFlow({ providerName, runLogin }: LoginFlowProps) {
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState<string>("");

    const { stdout } = useStdout();
    const columns = stdout?.columns ?? 80;

    const primaryBlue = "#60a5fa";
    const primaryBlueDark = "#2563eb";

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
        <Box flexDirection="column" padding={1}>
            <Box flexDirection="column" marginBottom={2}>
                <BigText text="WELCOME TO" colors={[primaryBlue, primaryBlueDark]} />
                <BigText text="ENKRYPTIFY" colors={[primaryBlue, primaryBlueDark]} />
            </Box>

            <Box width={columns} justifyContent="center">
                <Box flexDirection="column" alignItems="center">
                    {status === "loading" && (
                        <Box flexDirection="column" alignItems="center">
                            <Box>
                                <Text color={primaryBlueDark}>
                                    <Spinner type="dots" />
                                </Text>
                            </Box>
                            <Text bold color={primaryBlueDark}>
                                {message}
                            </Text>
                        </Box>
                    )}

                    {status === "success" && (
                        <Box marginTop={1} alignItems="center" paddingX={2}>
                            <Text bold color={primaryBlueDark}>
                                {message}
                            </Text>
                        </Box>
                    )}

                    {status === "error" && (
                        <Box marginTop={1} alignItems="center" paddingX={2}>
                            <Text bold color={primaryBlueDark}>
                                {message}
                            </Text>
                        </Box>
                    )}
                </Box>
            </Box>

            {status === "loading" && (
                <Box width={columns} justifyContent="center" marginTop={1}>
                    <Text bold color={primaryBlue}>
                        Please complete authentication in your browser...
                    </Text>
                </Box>
            )}
        </Box>
    );
}
