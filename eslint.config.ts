import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

/**
 * ESLint configuration for Bun/TypeScript CLI application
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
    eslintConfigPrettier,

    {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaFeatures: {
                    modules: true,
                    jsx: true,
                },
                ecmaVersion: 2022,
                sourceType: "module",
                projectService: true,
            },
            globals: {
                ...globals.node,
                Bun: "readonly",
                $: "readonly",
            },
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
        },
        rules: {
            "no-debugger": "error",
            "no-duplicate-imports": "error",
            "prefer-const": "error",
            "no-var": "error",

            "sort-imports": [
                "error",
                {
                    ignoreCase: false,
                    ignoreDeclarationSort: true,
                    ignoreMemberSort: false,
                    memberSyntaxSortOrder: ["none", "all", "multiple", "single"],
                    allowSeparatedGroups: false,
                },
            ],

            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unsafe-assignment": "error",
            "@typescript-eslint/no-unsafe-member-access": "error",
            "@typescript-eslint/no-unsafe-call": "error",
            "@typescript-eslint/no-unsafe-return": "error",
            "@typescript-eslint/no-unsafe-argument": "error",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_$|^_[a-zA-Z]",
                    destructuredArrayIgnorePattern: "^_$|^_[a-zA-Z]",
                    ignoreRestSiblings: true,
                },
            ],
            "@typescript-eslint/consistent-type-imports": [
                "error",
                {
                    prefer: "type-imports",
                    fixStyle: "inline-type-imports",
                },
            ],
            "@typescript-eslint/no-misused-promises": "error",
            "@typescript-eslint/no-floating-promises": "error",
        },
    },

    {
        ignores: ["node_modules/**", "dist/**", "bin/**", "*.config.js", "*.config.ts", ".bun/**"],
    },
];
