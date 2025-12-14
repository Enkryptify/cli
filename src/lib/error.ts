export function logError(message: string): void {
    const red = "\x1b[31m";
    const reset = "\x1b[0m";
    console.error(`${red}⚠️  ${message}${reset}`);
}
