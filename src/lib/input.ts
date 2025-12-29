import prompts from "prompts";

export async function getSecureInput(prompt: string): Promise<string> {
    const response = await prompts({
        type: "password",
        name: "value",
        message: prompt,
        validate: (value: string) => {
            if (!value || value.trim().length === 0) {
                return "Value cannot be empty";
            }
            return true;
        },
    });

    if (!response.value) {
        throw new Error("Input cancelled by user");
    }

    return response.value as string;
}

export async function getTextInput(prompt: string): Promise<string> {
    const response = await prompts(
        {
            type: "text",
            name: "value",
            message: prompt,
        },
        {
            onCancel: () => {
                process.exit(130);
            },
        },
    );

    return (response.value as string) || "";
}

export async function confirmPrompt(message: string): Promise<boolean> {
    const response = await prompts(
        {
            type: "confirm",
            name: "value",
            message: message,
            initial: false,
        },
        {
            onCancel: () => {
                process.exit(130);
            },
        },
    );

    return (response.value ?? false) === true;
}
