import { z } from "zod";

export const secretNameSchema = z
    .string({
        message: "Name must be at least 2 characters long.",
    })
    .min(2, { message: "Name must be at least 2 characters long." })
    .max(48, { message: "Name must be 48 or less characters long." })
    .regex(/^[A-Za-z0-9_-]+$/, { message: "Name can only contain A-Z, a-z, 0-9, _ and -." });

export const createSecretSchema = z.object({
    name: secretNameSchema,
    value: z.string().trim().min(1, { message: "Secret value cannot be empty." }),
});

export type CreateSecretInput = z.infer<typeof createSecretSchema>;
