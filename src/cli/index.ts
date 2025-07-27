#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Import commands
import { handlerCommand } from './commands/handler.js';
import { serveCommand } from './commands/serve.js';
import { installHooksCommand } from './commands/install-hooks.js';
import { importCommand } from './commands/import.js';
import { hookCommand } from './commands/hook.js';
import { packageCommand } from './commands/package.js';
import { configCommand } from './commands/config.js';
import { logCommand } from './commands/log.js';
import { monitorCommand } from './commands/monitor.js';
import { executeCommand } from './commands/execute.js';
import { securityCommand } from './commands/security.js';

// Get package.json for version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
);

program
  .name('velcro')
  .description('Master hook interceptor and manager for Claude Code')
  .version(packageJson.version);

// Add commands
program.addCommand(handlerCommand);
program.addCommand(serveCommand);
program.addCommand(installHooksCommand);
program.addCommand(importCommand);
program.addCommand(hookCommand);
program.addCommand(packageCommand);
program.addCommand(configCommand);
program.addCommand(logCommand);
program.addCommand(monitorCommand);
program.addCommand(executeCommand);
program.addCommand(securityCommand);

// Parse arguments
program.parse();