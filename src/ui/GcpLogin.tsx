import type { LoginOptions } from "@/providers/base/AuthProvider";
import type { Provider } from "@/providers/base/Provider";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useRef, useState } from "react";

export interface GcpLoginProps {
    provider: Provider;
    options?: LoginOptions;
    onError?: (error: Error) => void;
    onComplete?: () => void;
}
export function GcpLogin({ provider, options, onError, onComplete }: GcpLoginProps) {
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState<string>("");

    const onErrorRef = useRef(onError);
    const onCompleteRef = useRef(onComplete);

    onErrorRef.current = onError;
    onCompleteRef.current = onComplete;
    useEffect(() => {
        const performLogin = async () => {
            try {
                setMessage(`Authenticating with ${provider.name}...`);
                await provider.login(options);
                setStatus("success");
                setMessage(`✓ Successfully authenticated with ${provider.name}`);
                process.nextTick(() => {
                    onCompleteRef.current?.();
                });
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                setStatus("error");
                setMessage(`⚠️  ${err.message}`);
                onErrorRef.current?.(err);
            }
        };

        void performLogin();
    }, [provider, options]);

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
                        <Text>Using your local Google Cloud credentials to verify your identity...</Text>
                    </Box>
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
        </>
    );
}
