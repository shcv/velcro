import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ClaudeHandlerConfig, ClaudeHandlerEntry } from '../types/claude-handlers.js';
import { Handler } from './index.js';
import { HookType } from '../types/hooks.js';

export class ClaudeHandlerImporter {
  /**
   * Import handlers from Claude Code settings
   */
  static importFromClaudeSettings(settingsPath?: string): Handler[] {
    // Default to global Claude settings
    if (!settingsPath) {
      settingsPath = join(homedir(), '.claude', 'settings.json');
    }
    
    if (!existsSync(settingsPath)) {
      throw new Error(`Claude settings file not found: ${settingsPath}`);
    }
    
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content);
      
      if (!settings.hooks) {
        return [];
      }
      
      return this.convertClaudeHandlers(settings.hooks);
    } catch (error) {
      throw new Error(`Failed to parse Claude settings: ${error}`);
    }
  }
  
  /**
   * Convert Claude handler format to Velcro format
   */
  static convertClaudeHandlers(claudeHooks: ClaudeHandlerConfig): Handler[] {
    const handlers: Handler[] = [];
    let handlerIndex = 0;
    
    for (const [hookType, entries] of Object.entries(claudeHooks)) {
      for (const entry of entries) {
        // Skip entries that only have velcro hooks
        const nonVelcroHooks = entry.hooks.filter(h => 
          h.type === 'command' && h.command !== 'velcro hook'
        );
        
        if (nonVelcroHooks.length === 0) {
          continue;
        }
        
        for (const hook of nonVelcroHooks) {
          if (hook.type === 'command' && hook.command) {
            handlerIndex++;
            const handler: Handler = {
              name: `claude-import-${handlerIndex}`,
              enabled: hook.enabled !== false,
              hooks: [hookType as HookType],
              type: 'command',
              command: hook.command,
              matcher: entry.matcher,
              source: 'claude',
              managed: true,
              packages: []
            };
            handlers.push(handler);
          } else if (hook.type === 'script' && hook.script) {
            handlerIndex++;
            const handler: Handler = {
              name: `claude-script-${handlerIndex}`,
              enabled: hook.enabled !== false,
              hooks: [hookType as HookType],
              type: 'script',
              script: hook.script,
              matcher: entry.matcher,
              source: 'claude',
              managed: true,
              packages: []
            };
            handlers.push(handler);
          }
        }
      }
    }
    
    return handlers;
  }
  
  /**
   * Export Velcro handlers to Claude Code format
   */
  static exportToClaudeFormat(handlers: Handler[]): ClaudeHandlerConfig {
    const claudeConfig: ClaudeHandlerConfig = {};
    
    for (const handler of handlers) {
      // Skip disabled handlers unless explicitly requested
      if (!handler.enabled) {
        continue;
      }
      
      for (const hookType of handler.hooks) {
        if (!claudeConfig[hookType]) {
          claudeConfig[hookType] = [];
        }
        
        const entry: ClaudeHandlerEntry = {
          matcher: handler.matcher || '.*',
          hooks: []
        };
        
        if (handler.type === 'command' && handler.command) {
          entry.hooks.push({
            type: 'command',
            command: handler.command,
            enabled: handler.enabled
          });
        } else if (handler.type === 'script' && handler.script) {
          entry.hooks.push({
            type: 'script',
            script: handler.script,
            enabled: handler.enabled
          });
        } else if (handler.type === 'velcro') {
          // Velcro handlers can't be directly exported to Claude format
          // Add a command that calls velcro with the handler name
          entry.hooks.push({
            type: 'command',
            command: `velcro run-handler "${handler.name}"`,
            enabled: handler.enabled
          });
        }
        
        claudeConfig[hookType].push(entry);
      }
    }
    
    // Add velcro hook to each type if not already present
    const hookTypes = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop', 'SubagentStop', 'Notification', 'PreCompact'];
    for (const hookType of hookTypes) {
      if (!claudeConfig[hookType]) {
        claudeConfig[hookType] = [];
      }
      
      // Check if velcro hook already exists
      const hasVelcroHook = claudeConfig[hookType].some(entry =>
        entry.hooks.some(h => h.type === 'command' && h.command === 'velcro hook')
      );
      
      if (!hasVelcroHook) {
        claudeConfig[hookType].unshift({
          hooks: [{
            type: 'command',
            command: 'velcro hook'
          }]
        });
      }
    }
    
    return claudeConfig;
  }
}