// src/cmd/index.ts
import { registerLoginCommand } from "@/cmd/login.js";
import type { Command } from "commander";

export function registerCommands(program: Command) {
    registerLoginCommand(program);
}
