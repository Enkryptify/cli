import type { LoginOptions } from "@/providers/base/AuthProvider";
import type { Provider } from "@/providers/base/Provider";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";

export interface OnePasswordLoginProps {
    provider: Provider;
    options?: LoginOptions;
    onError?: (error: Error) => void;
    onComplete?: () => void;
}

export function OnePasswordLogin({ provider, options, onError, onComplete }: OnePasswordLoginProps) {
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState<string>("");

    useEffect(() => {
        const performLogin = async () => {
            try {
                setMessage("Authenticating with 1Password...");
                await provider.login(options);
                setStatus("success");
                setMessage("✓ Successfully authenticated with 1Password");
                process.nextTick(() => {
                    onComplete?.();
                });
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                setStatus("error");
                setMessage(`⚠️  ${err.message}`);
                onError?.(err);
            }
        };

        void performLogin();
    }, [provider, options, onError, onComplete]);

    return (
        <>
            {status === "loading" && (
                <Box flexDirection="column">
                    <Box flexDirection="row" alignItems="center" gap={1}>
                        <Text>
                            <Spinner type="dots" />
                        </Text>
                        <Text bold>{message}</Text>
                    </Box>

                    <Box marginTop={1}>
                        <Text>Using your 1Password token to verify your identity...</Text>
                    </Box>
                </Box>
            )}

            {status === "success" && (
                <Box marginTop={1}>
                    <Text bold>{message}</Text>
                </Box>
            )}

            {status === "error" && (
                <Box marginTop={1} flexDirection="column">
                    <Text bold color="red">
                        {message}
                    </Text>
                    <Box marginTop={1}>
                        <Text>Press Ctrl+C to exit, or re-run the command to try again.</Text>
                    </Box>
                </Box>
            )}
        </>
    );
}
