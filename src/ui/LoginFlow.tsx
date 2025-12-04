// src/ui/LoginFlow.tsx
import { Box, Text } from "ink";
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
        <Box flexDirection="column" padding={1}>
            <Box>
                {status === "loading" && <Spinner type="dots" />}
                <Text>{message}</Text>
            </Box>

            {status === "loading" && <Text dimColor>Please complete authentication in your browser...</Text>}
        </Box>
    );
}
