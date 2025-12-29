import type { Command } from "commander";

function getAliases(c: Command): string[] {
    return typeof c.aliases === "function" ? c.aliases() : [];
}

export function getCompletions(program: Command, words: string[]): string[] {
    let cmd: Command = program;

    const args = words.slice(1);

    for (const word of args) {
        const sub = cmd.commands.find((c) => c.name() === word || getAliases(c).includes(word));
        if (!sub) break;
        cmd = sub;
    }

    const subcommands = cmd.commands.flatMap((c) => [c.name(), ...getAliases(c)]);
    const options = cmd.options.map((o) => o.long).filter(Boolean) as string[];

    return Array.from(new Set([...subcommands, ...options]));
}
