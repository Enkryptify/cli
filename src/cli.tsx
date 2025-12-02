import { Command } from 'commander';
import React from 'react';
import { render } from 'ink';

import type { LoginOptions } from './providers/base/AuthProvider.js';
import { runLogin } from './cmd/login.js';
import { LoginFlow } from './ui/LoginFlow.js';
import './providers/registry/index.js';

import 'dotenv/config'; 

const program = new Command();

program
  .name('ek')
  .description('CLI for Enkryptify')
  .version('1.0.0');

program
  .command('login')
  .argument('<provider>', 'Provider name (e.g., enkryptify, aws, gcp......)')
  .option('-f, --force', 'Force re-authentication even if already logged in')
  .action(async (provider: string, options: LoginOptions & { force?: boolean }) => {
    let app: ReturnType<typeof render> | null = null;

    try {
      app = render(
        <LoginFlow
          providerName={provider}
          onLogin={async () => {
            await runLogin(provider, options);
          }}
          onComplete={() => {
            // Cleanup and exit
            if (app) {
              app.unmount();
            }
            process.exit(0);
          }}
          onError={(err: Error) => {
            console.error('\nError:', err.message);
            if (app) {
              app.unmount();
            }
            process.exit(1);
          }}
        /> as React.ReactElement
      );

      await app.waitUntilExit();
    } catch (error) {
      if (app) {
        app.unmount();
      }
      console.error('\nError:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

