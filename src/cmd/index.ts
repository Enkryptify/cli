import { registerConfigureCommand } from "@/cmd/configure";
import { registerCreateCommand } from "@/cmd/create";
import { registerDeleteCommand } from "@/cmd/delete";
import { registerListCommand } from "@/cmd/listCommand";
import { registerLoginCommand } from "@/cmd/login";
import { registerRunCommand } from "@/cmd/run";
import { registerRunFileCommand } from "@/cmd/run-file";
import { registerUpdateCommand } from "@/cmd/update";
import type { Command } from "commander";

export function registerCommands(program: Command) {
    registerLoginCommand(program);
    registerConfigureCommand(program);
    registerRunCommand(program);
    registerRunFileCommand(program);
    registerListCommand(program);
    registerCreateCommand(program);
    registerDeleteCommand(program);
    registerUpdateCommand(program);
}
