import { registerCommands } from "@/cmd/index.js";
import "@/providers/registry/index.js";
import { Command } from "commander";

const program = new Command();

program.name("ek").description("CLI for Enkryptify").version(process.env.CLI_VERSION!);

registerCommands(program);

//better message for hte error
program.parseAsync(process.argv).catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
