import type { ProjectConfig } from "@/lib/config.js";
import { Box, Text, useStdout } from "ink";
import BigText from "ink-big-text";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";

export interface RunFlowProps {
    projectConfig: ProjectConfig;
    envName: string;
    run: () => Promise<void>;
}

export function RunFlow({ projectConfig, envName, run }: RunFlowProps) {
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState<string>("");

    const { stdout } = useStdout();
    const columns = stdout?.columns ?? 80;

    const primaryBlue = "#60a5fa";
    const primaryBlueDark = "#2563eb";

    useEffect(() => {
        const performRun = async () => {
            try {
                setMessage(
                    `Injecting secrets for workspace "${projectConfig.workspace_slug}" / project "${projectConfig.project_slug}" / env "${envName}"...`,
                );
                await run();
                setStatus("success");
                setMessage(
                    `✓ Secrets injected for workspace "${projectConfig.workspace_slug}" / project "${projectConfig.project_slug}" / env "${envName}".`,
                );
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                setStatus("error");
                setMessage(err.message);
            }
        };

        void performRun();
    }, [projectConfig, envName, run]);

    return (
        <Box flexDirection="column" padding={1}>
            <Box flexDirection="column" marginBottom={2}>
                <BigText text="injecting" colors={[primaryBlue, primaryBlueDark]} />
            </Box>

            <Box width={columns} justifyContent="center">
                <Box flexDirection="column" alignItems="center">
                    {status === "loading" && (
                        <Box flexDirection="column" alignItems="center">
                            <Box marginBottom={1}>
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
                            <Text bold color="red">
                                {message}
                            </Text>
                        </Box>
                    )}
                </Box>
            </Box>
        </Box>
    );
}
