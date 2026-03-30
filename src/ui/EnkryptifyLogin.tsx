import type { LoginOptions } from "@/api/auth";
import { client } from "@/api/client";
import { PREFIX } from "@/lib/logger";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";

export interface EnkryptifyLoginProps {
    options?: LoginOptions;
    onError?: (error: Error) => void;
    onComplete?: () => void;
}

export function EnkryptifyLogin({ options, onError, onComplete }: EnkryptifyLoginProps) {
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState<string>("");

    useEffect(() => {
        const performLogin = async () => {
            try {
                setMessage(`${PREFIX} Authenticating with Enkryptify...`);
                await client.login(options);
                setStatus("success");
                setMessage(`${PREFIX} Successfully authenticated with Enkryptify`);

                setTimeout(() => {
                    onComplete?.();
                }, 1000);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                setStatus("error");
                setMessage(`${PREFIX} ${err.message}`);
                onError?.(err);
            }
        };

        void performLogin();
    }, [options]);

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
                        <Text bold color="green">{message}</Text>
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
                    <Text>{PREFIX} Please complete authentication in your browser...</Text>
                </Box>
            )}
        </>
    );
}
