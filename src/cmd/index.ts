import { registerConfigureCommand } from "@/cmd/configure";
import { registerCreateCommand } from "@/cmd/create";
import { registerDeleteCommand } from "@/cmd/delete";
import { registerListCommand } from "@/cmd/listCommand";
import { registerLoginCommand } from "@/cmd/login";
import { registerLogoutCommand } from "@/cmd/logout";
import { registerRunCommand } from "@/cmd/run";
import { registerRunFileCommand } from "@/cmd/run-file";
import { registerSdkCommand } from "@/cmd/sdk";
import { registerUpdateCommand } from "@/cmd/update";
import { registerUpgradeCommand } from "@/cmd/upgrade";
import { registerWhoamiCommand } from "@/cmd/whoami";
import type { Command } from "commander";

export function registerCommands(program: Command) {
    registerLoginCommand(program);
    registerLogoutCommand(program);
    registerWhoamiCommand(program);
    registerConfigureCommand(program);
    registerRunCommand(program);
    registerRunFileCommand(program);
    registerSdkCommand(program);

    const secretCommand = program.command("secret").description("Manage secrets in the current environment");

    registerListCommand(secretCommand);
    registerCreateCommand(secretCommand);
    registerDeleteCommand(secretCommand);
    registerUpdateCommand(secretCommand);

    registerUpgradeCommand(program);
}
