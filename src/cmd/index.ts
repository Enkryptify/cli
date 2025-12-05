import { registerConfigureCommand } from "@/cmd/configure.js";
import { registerCreateCommand } from "@/cmd/create.js";
import { registerDeleteCommand } from "@/cmd/delete.js";
import { registerListCommand } from "@/cmd/listCommand.js";
import { registerLoginCommand } from "@/cmd/login.js";
import { registerRunCommand } from "@/cmd/run.js";
import { registerUpdateCommand } from "@/cmd/update.js";
import type { Command } from "commander";

export function registerCommands(program: Command) {
    registerLoginCommand(program);
    registerConfigureCommand(program);
    registerRunCommand(program);
    registerListCommand(program);
    registerCreateCommand(program);
    registerDeleteCommand(program);
    registerUpdateCommand(program);
}
