import { Box, render, Text } from "ink";
import SelectInput from "ink-select-input";

export async function selectName(options: string[], title?: string): Promise<string> {
    const items = options.map((name, index) => ({
        label: name,
        value: name,
        key: `${name}-${index}`,
    }));
    return new Promise((resolve) => {
        const app = render(
            <Box flexDirection="column" justifyContent="center" alignItems="center" height="100%" paddingTop={2}>
                {title && (
                    <Box marginBottom={2}>
                        <Text bold color="cyanBright" inverse>
                            {" "}
                            {title}{" "}
                        </Text>
                    </Box>
                )}
                <Box
                    flexDirection="column"
                    borderStyle="round"
                    borderColor="cyan"
                    paddingX={2}
                    paddingY={1}
                    minWidth={50}
                >
                    <SelectInput
                        items={items}
                        onSelect={(item) => {
                            app.unmount();
                            process.stdout.write("\x1b[2J\x1b[H");
                            resolve(item.value as string);
                        }}
                    />
                </Box>
            </Box>,
        );
    });
}
