import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
    test: {
        include: ["tests/**/*.test.ts"],
        setupFiles: ["tests/setup.ts"],
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            exclude: ["src/ui/**", "src/env.ts", "src/cli.ts"],
        },
    },
});
