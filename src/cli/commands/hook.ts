import { Command } from 'commander';
import { configManager } from '../../config/index.js';
import { HandlerExecutor } from '../../handlers/executor.js';
import { readFileSync } from 'fs';

export const hookCommand = new Command('hook')
  .description('Manage hook handlers')
  .addCommand(
    new Command('list')
      .description('List all handlers')
      .action(() => {
        const handlers = configManager.listHandlers();
        
        if (handlers.length === 0) {
          console.log('No handlers configured');
          return;
        }
        
        console.log('Configured handlers:\n');
        handlers.forEach(handler => {
          const status = handler.enabled ? '✓' : '✗';
          const hooks = handler.hooks.join(', ');
          console.log(`${status} ${handler.name} (${handler.type})`);
          console.log(`  Hooks: ${hooks}`);
          if (handler.matcher) {
            console.log(`  Matcher: ${handler.matcher}`);
          }
          console.log();
        });
      })
  )
  .addCommand(
    new Command('add')
      .description('Create a new handler')
      .requiredOption('-n, --name <name>', 'Handler name')
      .requiredOption('-h, --hook <hooks...>', 'Hook types to attach to')
      .option('-t, --type <type>', 'Handler type (velcro, command, script, function, external)', 'velcro')
      .option('-f, --file <path>', 'Load handler code from file')
      .option('-c, --code <string>', 'Inline handler code')
      .option('--command <command>', 'Command to execute (for command/external handlers)')
      .option('--script <path>', 'Script path (for script handlers)')
      .option('--args <args...>', 'Arguments for external command')
      .option('--env <env...>', 'Environment variables (KEY=value format)')
      .option('-m, --matcher <regex>', 'Tool filter regex')
      .option('-p, --packages <packages...>', 'NPM packages required')
      .option('--disabled', 'Create in disabled state')
      .action((options) => {
        try {
          // Validate handler type and required fields
          if ((options.type === 'velcro' || options.type === 'function') && !options.code && !options.file) {
            console.error(`Error: ${options.type} handlers require --code or --file`);
            process.exit(1);
          }
          if ((options.type === 'command' || options.type === 'external') && !options.command) {
            console.error(`Error: ${options.type} handlers require --command`);
            process.exit(1);
          }
          if (options.type === 'script' && !options.script) {
            console.error('Error: Script handlers require --script');
            process.exit(1);
          }
          
          // Load code from file if specified
          let code = options.code;
          if (options.file && (options.type === 'velcro' || options.type === 'function')) {
            code = readFileSync(options.file, 'utf-8');
          }
          
          // Parse environment variables for external handlers
          let env: Record<string, string> | undefined;
          if (options.env && options.type === 'external') {
            env = {};
            for (const envVar of options.env) {
              const [key, value] = envVar.split('=');
              if (key && value !== undefined) {
                env[key] = value;
              }
            }
          }
          
          // Add the handler
          configManager.addHandler({
            name: options.name,
            enabled: !options.disabled,
            hooks: options.hook,
            type: options.type,
            code: code,
            command: options.command,
            script: options.script,
            args: options.args,
            env: env,
            packages: options.packages || [],
            matcher: options.matcher,
            source: 'velcro',
            managed: true
          });
          
          console.log(`Handler '${options.name}' created successfully`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error creating handler: ${errorMessage}`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('update')
      .description('Update an existing handler')
      .argument('<name>', 'Handler name')
      .option('-n, --new-name <name>', 'New name')
      .option('-c, --code <string>', 'New code')
      .option('-f, --file <path>', 'Load new code from file')
      .option('-m, --matcher <regex>', 'New matcher regex')
      .option('-h, --hooks <hooks...>', 'New hook types')
      .action((name, options) => {
        try {
          const handler = configManager.getHandler(name);
          if (!handler) {
            console.error(`Handler '${name}' not found`);
            process.exit(1);
          }
          
          // Update fields
          if (options.newName) handler.name = options.newName;
          if (options.hooks) handler.hooks = options.hooks;
          if (options.matcher !== undefined) handler.matcher = options.matcher;
          
          // Update code
          if (options.file) {
            handler.code = readFileSync(options.file, 'utf-8');
          } else if (options.code) {
            handler.code = options.code;
          }
          
          // Remove old handler and add updated one
          configManager.removeHandler(name);
          configManager.addHandler(handler);
          
          console.log(`Handler '${name}' updated successfully`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error updating handler: ${errorMessage}`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('delete')
      .description('Delete a handler')
      .argument('<name>', 'Handler name')
      .action((name) => {
        if (configManager.removeHandler(name)) {
          console.log(`Handler '${name}' deleted`);
        } else {
          console.error(`Handler '${name}' not found`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('enable')
      .description('Enable a handler')
      .argument('<name>', 'Handler name')
      .action((name) => {
        if (configManager.enableHandler(name)) {
          console.log(`Handler '${name}' enabled`);
        } else {
          console.error(`Handler '${name}' not found`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('disable')
      .description('Disable a handler')
      .argument('<name>', 'Handler name')
      .action((name) => {
        if (configManager.disableHandler(name)) {
          console.log(`Handler '${name}' disabled`);
        } else {
          console.error(`Handler '${name}' not found`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('show')
      .description('Show the definition of a handler')
      .argument('<name>', 'Handler name')
      .action((name) => {
        const handler = configManager.getHandler(name);
        if (!handler) {
          console.error(`Handler '${name}' not found`);
          process.exit(1);
        }
        
        console.log(`Handler: ${handler.name}`);
        console.log(`Type: ${handler.type}`);
        console.log(`Enabled: ${handler.enabled ? 'Yes' : 'No'}`);
        console.log(`Hooks: ${handler.hooks.join(', ')}`);
        
        if (handler.matcher) {
          console.log(`Matcher: ${handler.matcher}`);
        }
        
        if (handler.source) {
          console.log(`Source: ${handler.source}`);
        }
        
        if (handler.packages && handler.packages.length > 0) {
          console.log(`Packages: ${handler.packages.join(', ')}`);
        }
        
        console.log();
        
        // Show type-specific details
        switch (handler.type) {
          case 'velcro':
          case 'function':
            if (handler.code) {
              console.log('Code:');
              console.log('---');
              console.log(handler.code);
              console.log('---');
            }
            break;
            
          case 'command':
          case 'external':
            if (handler.command) {
              console.log(`Command: ${handler.command}`);
            }
            if (handler.args && handler.args.length > 0) {
              console.log(`Arguments: ${handler.args.join(' ')}`);
            }
            if (handler.env) {
              console.log('Environment Variables:');
              for (const [key, value] of Object.entries(handler.env)) {
                console.log(`  ${key}=${value}`);
              }
            }
            break;
            
          case 'script':
            if (handler.script) {
              console.log(`Script: ${handler.script}`);
            }
            break;
        }
      })
  )
  .addCommand(
    new Command('test')
      .description('Test a handler with sample data')
      .argument('<name>', 'Handler name')
      .option('-e, --event <json>', 'Event data (JSON string or @file.json)')
      .action(async (name, options) => {
        try {
          const handler = configManager.getHandler(name);
          if (!handler) {
            console.error(`Handler '${name}' not found`);
            process.exit(1);
          }
          
          // Parse event data
          let eventData;
          if (options.event) {
            if (options.event.startsWith('@')) {
              const filePath = options.event.slice(1);
              eventData = JSON.parse(readFileSync(filePath, 'utf-8'));
            } else {
              eventData = JSON.parse(options.event);
            }
          } else {
            // Default test event
            eventData = {
              hook_event_name: 'Test',
              test: true,
              timestamp: new Date().toISOString()
            };
          }
          
          console.log(`Testing handler '${name}' with event data:`);
          console.log(JSON.stringify(eventData, null, 2));
          console.log('\nExecuting...\n');
          
          const executor = new HandlerExecutor();
          await executor.execute(handler, eventData);
          
          console.log('\nHandler executed successfully');
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`\nHandler execution failed: ${errorMessage}`);
          if (error instanceof Error && 'stderr' in error) {
            console.error('stderr:', (error as NodeJS.ErrnoException & { stderr?: string }).stderr);
          }
          process.exit(1);
        }
      })
  );