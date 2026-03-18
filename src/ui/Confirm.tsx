import prompts from "prompts";

export async function confirm(message: string): Promise<boolean> {
    const response = await prompts(
        {
            type: "confirm",
            name: "value",
            message,
            initial: true,
        },
        {
            onCancel: () => {
                process.exit(130);
            },
        },
    );

    return (response.value ?? false) === true;
}
