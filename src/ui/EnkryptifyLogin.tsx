import type { LoginOptions } from "@/providers/base/AuthProvider";
import type { Provider } from "@/providers/base/Provider";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";

export interface EnkryptifyLoginProps {
    provider: Provider;
    options?: LoginOptions;
    onError?: (error: Error) => void;
    onComplete?: () => void;
}

export function EnkryptifyLogin({ provider, options, onError, onComplete }: EnkryptifyLoginProps) {
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState<string>("");

    useEffect(() => {
        const performLogin = async () => {
            try {
                setMessage(`Authenticating with ${provider.name}...`);
                await provider.login(options);
                setStatus("success");
                setMessage(`✓ Successfully authenticated with ${provider.name}`);

                setTimeout(() => {
                    onComplete?.();
                }, 1000);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                setStatus("error");
                setMessage(`⚠️  ${err.message}`);
                onError?.(err);
            }
        };

        void performLogin();
    }, [provider, options]);

    return (
        <>
            <Box flexDirection="column">
                {status === "loading" && (
                    <Box flexDirection="row" alignItems="center" gap={1}>
                        <Text>
                            <Spinner type="dots" />
                        </Text>
                        <Text bold>{message}</Text>
                    </Box>
                )}

                {status === "success" && (
                    <Box marginTop={1}>
                        <Text bold>{message}</Text>
                    </Box>
                )}

                {status === "error" && (
                    <Box marginTop={1}>
                        <Text bold color="red">
                            {message}
                        </Text>
                    </Box>
                )}
            </Box>

            {status === "loading" && (
                <Box marginTop={1}>
                    <Text>Please complete authentication in your browser...</Text>
                </Box>
            )}
        </>
    );
}
