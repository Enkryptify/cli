import { analytics } from "@/lib/analytics";
import { findBetterleaks, installBetterleaks, runBetterleaks } from "@/lib/betterleaks";
import { config } from "@/lib/config";
import { CLIError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { confirm } from "@/ui/Confirm";
import { showScanReport } from "@/ui/ScanReport";
import { withSpinner } from "@/ui/Spinner";
import ansiEscapes from "ansi-escapes";
import type { Command } from "commander";

const BETTERLEAKS_URL = "https://github.com/betterleaks/betterleaks";

// Clickable attribution shown on the scanning spinner. Terminals without hyperlink
// support just render the plain text.
const BETTERLEAKS_ATTRIBUTION = `powered by ${ansiEscapes.link("Betterleaks", BETTERLEAKS_URL)}`;

// General remediation steps, shown whenever secrets are found (regardless of Enkryptify use).
function showRemediation(count: number): void {
    logger.info(
        `How to fix ${count === 1 ? "this secret" : "these secrets"}:\n` +
            "  1. Rotate or revoke each exposed secret now; assume it is already compromised.\n" +
            "  2. Remove the secret from your code (and scrub it from your git history).\n" +
            "  3. Store it in a secrets manager and inject it at runtime instead of hardcoding it.",
    );
}

// Subtle product nudge — only for people who have never configured Enkryptify.
async function showEnkryptifyPlug(foundSecrets: boolean): Promise<void> {
    if (await config.hasAnyProject()) return;

    if (foundSecrets) {
        logger.info(
            'Enkryptify can handle step 3 for you: your secrets stay out of your code and are injected at runtime. Get started with "ek login".',
        );
    } else {
        logger.info(
            'Want to keep it that way? Enkryptify injects your secrets at runtime so they never touch your code. Get started with "ek login".',
        );
    }
}

export function registerScanCommand(program: Command) {
    program
        .command("scan")
        .description("Scan the current folder (recursively) for hardcoded secrets.")
        .action(async () => {
            const tracker = analytics.trackCommand("command_scan", {});

            try {
                let bin = await findBetterleaks();
                let installedBetterleaks = false;

                if (!bin) {
                    logger.info(
                        "ek scan uses betterleaks (github.com/betterleaks/betterleaks) to scan for secrets, but it isn't installed yet.",
                    );

                    const ok = await confirm("Install betterleaks now?");
                    if (!ok) {
                        logger.warn("Skipped secret scan.", {
                            fix: 'Install betterleaks manually from https://github.com/betterleaks/betterleaks/releases, then run "ek scan" again.',
                        });
                        tracker.success({ installed_betterleaks: false, scanned: false });
                        return;
                    }

                    bin = await withSpinner("Installing betterleaks...", installBetterleaks);
                    installedBetterleaks = true;
                }

                const findings = await withSpinner(
                    "Scanning for secrets...",
                    () => runBetterleaks(bin, process.cwd()),
                    BETTERLEAKS_ATTRIBUTION,
                );

                if (findings.length > 0) {
                    await showScanReport(findings);
                    showRemediation(findings.length);
                    await showEnkryptifyPlug(true);
                    process.exitCode = 1;
                } else {
                    logger.success("No secrets found.");
                    await showEnkryptifyPlug(false);
                    process.exitCode = 0;
                }

                tracker.success({
                    installed_betterleaks: installedBetterleaks,
                    scanned: true,
                    findings_count: findings.length,
                });
            } catch (error) {
                tracker.error(error);
                if (error instanceof CLIError) {
                    logger.error(error.message, { why: error.why, fix: error.fix, docs: error.docs });
                } else {
                    logger.error(error instanceof Error ? error.message : String(error));
                }
                process.exit(1);
            }
        });
}
