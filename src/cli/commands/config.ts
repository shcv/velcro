import { Command } from 'commander';
import { configManager } from '../../config/index.js';
import { execSync } from 'child_process';

export const configCommand = new Command('config')
  .description('Configuration management')
  .addCommand(
    new Command('list')
      .description('List all settings')
      .argument('[prefix]', 'Filter by prefix (e.g., "logging" or "server.port")')
      .action((prefix) => {
        const config = configManager.getConfig();
        
        if (prefix) {
          // Filter by prefix
          const keys = prefix.split('.');
          let value: unknown = config;
          
          for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
              value = (value as Record<string, unknown>)[key];
            } else {
              console.error(`Configuration key '${prefix}' not found`);
              process.exit(1);
            }
          }
          
          if (typeof value === 'object') {
            console.log(JSON.stringify(value, null, 2));
          } else {
            console.log(`${prefix} = ${value}`);
          }
        } else {
          // Show full config
          console.log(JSON.stringify(config, null, 2));
        }
      })
  )
  .addCommand(
    new Command('get')
      .description('Get configuration value')
      .argument('<key>', 'Configuration key (e.g., "logging.level")')
      .action((key) => {
        const config = configManager.getConfig();
        const keys = key.split('.');
        let value: unknown = config;
        
        for (const k of keys) {
          if (value && typeof value === 'object' && k in value) {
            value = (value as Record<string, unknown>)[k];
          } else {
            console.error(`Configuration key '${key}' not found`);
            process.exit(1);
          }
        }
        
        if (typeof value === 'object') {
          console.log(JSON.stringify(value, null, 2));
        } else {
          console.log(value);
        }
      })
  )
  .addCommand(
    new Command('set')
      .description('Set configuration value')
      .argument('<key>', 'Configuration key (e.g., "logging.level")')
      .argument('<value>', 'Value to set')
      .action((key, value) => {
        try {
          const config = configManager.getConfig();
          const keys = key.split('.');
          let target: Record<string, unknown> = config as Record<string, unknown>;
          
          // Navigate to the parent object
          for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!(k in target)) {
              target[k] = {};
            }
            target = target[k] as Record<string, unknown>;
          }
          
          // Set the value
          const lastKey = keys[keys.length - 1];
          
          // Try to parse as JSON first (for objects/arrays)
          try {
            target[lastKey] = JSON.parse(value);
          } catch {
            // If not JSON, try to parse as number
            if (!isNaN(Number(value))) {
              target[lastKey] = Number(value);
            } else if (value === 'true') {
              target[lastKey] = true;
            } else if (value === 'false') {
              target[lastKey] = false;
            } else {
              // Otherwise, treat as string
              target[lastKey] = value;
            }
          }
          
          configManager.updateConfig(config);
          console.log(`Configuration updated: ${key} = ${target[lastKey]}`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error updating configuration: ${errorMessage}`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('edit')
      .description('Open config in editor')
      .action(() => {
        const editor = process.env.EDITOR || 'vi';
        const configPath = configManager.getConfigPath();
        
        try {
          execSync(`${editor} ${configPath}`, { stdio: 'inherit' });
          
          // Reload config to validate after edit
          configManager.reload();
          console.log('Configuration reloaded successfully');
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error editing configuration: ${errorMessage}`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('path')
      .description('Show config file locations')
      .option('-d, --data', 'Show data directory')
      .option('-l, --logs', 'Show logs directory')
      .action((options) => {
        if (options.data) {
          console.log(configManager.getDataDirectory());
        } else if (options.logs) {
          const { logger } = require('../../logging/logger.js');
          console.log(logger.getLogDirectory());
        } else {
          console.log(`Config file: ${configManager.getConfigPath()}`);
          console.log(`Data directory: ${configManager.getDataDirectory()}`);
        }
      })
  );