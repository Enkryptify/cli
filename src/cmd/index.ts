// src/cmd/index.ts
import { registerLoginCommand } from "@/cmd/login.js";
import { registerRunCommand } from "@/cmd/run.js";
import { registerSetupCommand } from "@/cmd/setup.js";
import type { Command } from "commander";

export function registerCommands(program: Command) {
    registerLoginCommand(program);
    registerSetupCommand(program);
    registerRunCommand(program);
}
