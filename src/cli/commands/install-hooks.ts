import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface ClaudeSettings {
  hooks?: {
    [hookType: string]: Array<{
      hooks: Array<{
        type: string;
        command: string;
      }>;
    }>;
  };
}

const HOOK_TYPES = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Notification',
  'Stop',
  'SubagentStop',
  'PreCompact'
];

const VELCRO_HOOK = {
  type: 'command',
  command: 'velcro handler'
};

export const installHooksCommand = new Command('install-hooks')
  .description('Install Velcro hooks in Claude Code settings')
  .option('--global', 'Install hooks globally (default)')
  .option('--project', 'Install hooks in current project')
  .option('--last', 'Add hooks at the end of the list (default is first)')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (options) => {
    const isGlobal = !options.project;
    const position = options.last ? 'last' : 'first';
    const dryRun = options.dryRun || false;
    
    // Determine settings file path
    let settingsPath: string;
    if (isGlobal) {
      const claudeDir = join(homedir(), '.claude');
      settingsPath = join(claudeDir, 'settings.json');
      
      // Ensure directory exists
      if (!dryRun && !existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true });
      }
    } else {
      // Project level - look for .claude directory in current directory
      const projectClaudeDir = join(process.cwd(), '.claude');
      settingsPath = join(projectClaudeDir, 'settings.json');
      
      // Ensure directory exists
      if (!dryRun && !existsSync(projectClaudeDir)) {
        mkdirSync(projectClaudeDir, { recursive: true });
      }
    }
    
    console.log(`Installing hooks ${isGlobal ? 'globally' : 'in project'} at: ${settingsPath}`);
    console.log(`Position: ${position}`);
    
    // Load existing settings
    let settings: ClaudeSettings = {};
    if (existsSync(settingsPath)) {
      try {
        const content = readFileSync(settingsPath, 'utf-8');
        settings = JSON.parse(content);
        console.log('Loaded existing settings');
      } catch (error) {
        console.error('Error reading existing settings:', error);
        process.exit(1);
      }
    }
    
    // Initialize hooks object if it doesn't exist
    if (!settings.hooks) {
      settings.hooks = {};
    }
    
    let hooksAdded = 0;
    let hooksSkipped = 0;
    
    // Process each hook type
    for (const hookType of HOOK_TYPES) {
      if (!settings.hooks[hookType]) {
        settings.hooks[hookType] = [];
      }
      
      // Check if Velcro hook already exists
      const existingHooks = settings.hooks[hookType];
      const hasVelcroHook = existingHooks.some(entry => 
        entry.hooks && entry.hooks.some(hook => 
          hook.type === 'command' && hook.command === 'velcro hook'
        )
      );
      
      if (hasVelcroHook) {
        console.log(`  ✓ ${hookType}: Velcro hook already installed`);
        hooksSkipped++;
        continue;
      }
      
      // Add Velcro hook
      const velcroEntry = { hooks: [VELCRO_HOOK] };
      
      if (position === 'first') {
        settings.hooks[hookType].unshift(velcroEntry);
      } else {
        settings.hooks[hookType].push(velcroEntry);
      }
      
      console.log(`  + ${hookType}: Added Velcro hook at ${position}`);
      hooksAdded++;
    }
    
    // Save settings
    if (!dryRun) {
      try {
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log(`\n✅ Successfully installed ${hooksAdded} hooks (${hooksSkipped} already existed)`);
      } catch (error) {
        console.error('Error saving settings:', error);
        process.exit(1);
      }
    } else {
      console.log(`\n[DRY RUN] Would install ${hooksAdded} hooks (${hooksSkipped} already exist)`);
      console.log('\nResulting settings would be:');
      console.log(JSON.stringify(settings, null, 2));
    }
    
    // Show next steps
    console.log('\n📝 Next steps:');
    if (isGlobal) {
      console.log('1. Restart Claude Code to apply global hook changes');
    } else {
      console.log('1. Open this project in Claude Code');
    }
    console.log('2. Start the Velcro server: velcro serve');
    console.log('3. Check logs: tail -f ~/.local/share/velcro/logs/hooks-*.jsonl');
  });