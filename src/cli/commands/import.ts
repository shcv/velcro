import { Command } from 'commander';
import { ClaudeHandlerImporter } from '../../config/claude-import.js';
import { configManager } from '../../config/index.js';

export const importCommand = new Command('import')
  .description('Import handlers from Claude Code settings')
  .option('--path <path>', 'Path to Claude settings.json file')
  .option('--dry-run', 'Show what would be imported without making changes')
  .option('--prefix <prefix>', 'Prefix for imported handler names', 'claude-import')
  .action(async (options) => {
    try {
      console.log('Importing handlers from Claude Code settings...');
      
      // Import handlers
      const handlers = ClaudeHandlerImporter.importFromClaudeSettings(options.path);
      
      if (handlers.length === 0) {
        console.log('No handlers found to import (velcro hooks are skipped)');
        return;
      }
      
      console.log(`Found ${handlers.length} handlers to import:\n`);
      
      // Update names with prefix if provided
      if (options.prefix && options.prefix !== 'claude-import') {
        handlers.forEach((handler, index) => {
          handler.name = `${options.prefix}-${index + 1}`;
        });
      }
      
      // Display handlers
      for (const handler of handlers) {
        console.log(`Handler: ${handler.name}`);
        console.log(`  Type: ${handler.type}`);
        console.log(`  Hooks: ${handler.hooks.join(', ')}`);
        console.log(`  Matcher: ${handler.matcher || '.*'}`);
        
        if (handler.type === 'command') {
          console.log(`  Command: ${handler.command}`);
        } else if (handler.type === 'script') {
          console.log(`  Script: ${handler.script}`);
        }
        
        console.log('');
      }
      
      if (!options.dryRun) {
        // Add handlers to config
        for (const handler of handlers) {
          configManager.addHandler(handler);
        }
        
        console.log(`✅ Successfully imported ${handlers.length} handlers`);
        console.log('\nYou can manage these handlers with:');
        console.log('  velcro-handlers list');
        console.log('  velcro-handlers enable/disable <name>');
        console.log('  velcro-handlers remove <name>');
      } else {
        console.log('[DRY RUN] Would import the above handlers');
      }
      
    } catch (error) {
      console.error('Error importing handlers:', error);
      process.exit(1);
    }
  });