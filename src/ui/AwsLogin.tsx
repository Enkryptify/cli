import type { LoginOptions } from "@/providers/base/AuthProvider";
import type { Provider } from "@/providers/base/Provider";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useRef, useState } from "react";

export interface AwsLoginProps {
    provider: Provider;
    options?: LoginOptions;
    onError?: (error: Error) => void;
    onComplete?: () => void;
}

export function AwsLogin({ provider, options, onError, onComplete }: AwsLoginProps) {
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState<string>("");
    const onErrorRef = useRef(onError);
    const onCompleteRef = useRef(onComplete);

    useEffect(() => {
        onErrorRef.current = onError;
        onCompleteRef.current = onComplete;
    });
    useEffect(() => {
        const performLogin = async () => {
            try {
                setMessage(`Authenticating with AWS...`);
                await provider.login(options);
                setStatus("success");
                setMessage(`✓ Successfully authenticated with AWS`);
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
                    <Text>
                        Using your local AWS CLI credentials (profile, SSO, or access keys) to verify your identity...
                    </Text>
                </Box>
            )}
        </>
    );
}
