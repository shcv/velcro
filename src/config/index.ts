import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { z } from 'zod';

// Handler configuration schema - supports both Velcro and Claude formats
const HandlerSchema = z.object({
  // Core fields
  name: z.string(),
  enabled: z.boolean().default(true),
  hooks: z.array(z.enum(['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop', 'SubagentStop', 'Notification', 'PreCompact'])),
  
  // Handler type and content
  type: z.enum(['velcro', 'command', 'script', 'function', 'external']).default('velcro'),
  code: z.string().optional(),  // For velcro and function handlers
  command: z.string().optional(),  // For command and external handlers
  script: z.string().optional(),  // For script handlers
  args: z.array(z.string()).optional(),  // For external handlers
  env: z.record(z.string()).optional(),  // For external handlers
  
  // Additional features
  packages: z.array(z.string()).default([]),
  matcher: z.string().optional(),  // Regex for tool filtering
  
  // Metadata
  source: z.enum(['velcro', 'claude']).default('velcro'),
  managed: z.boolean().default(true)
});

// Main configuration schema
const ConfigSchema = z.object({
  dataDir: z.string().optional(), // Base data directory for all Velcro data
  server: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(3010),
    requireAuthForRemote: z.boolean().default(true),
    allowRemoteWithoutAuth: z.boolean().default(false) // Dangerous option
  }).default({ host: 'localhost', port: 3010, requireAuthForRemote: true, allowRemoteWithoutAuth: false }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    logDir: z.string().optional(), // Can be absolute or relative to dataDir
    maxFiles: z.number().default(30),
    maxSize: z.string().default('10MB')
  }).default({ level: 'info', maxFiles: 30, maxSize: '10MB' }),
  auth: z.object({
    enabled: z.boolean().default(true),
    required: z.boolean().default(false), // OAuth is optional for localhost
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    redirectUri: z.string().default('http://localhost:3010/oauth/callback')
  }).default({ enabled: true, required: false, redirectUri: 'http://localhost:3010/oauth/callback' }),
  handlers: z.array(HandlerSchema).default([])
});

export type VelcroConfig = z.infer<typeof ConfigSchema>;
export type Handler = z.infer<typeof HandlerSchema>;
export type Config = VelcroConfig;
export type HookType = 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit' | 'Stop' | 'SubagentStop' | 'Notification' | 'PreCompact';

export class ConfigManager {
  private configPath: string;
  private config: VelcroConfig;

  constructor(configPath?: string) {
    // Use provided path or default to XDG config location
    const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
    this.configPath = configPath || join(xdgConfig, 'velcro', 'config.json');
    
    // Ensure config directory exists
    const configDir = join(this.configPath, '..');
    mkdirSync(configDir, { recursive: true });
    
    this.config = this.loadConfig();
  }

  getDataDirectory(): string {
    if (this.config.dataDir) {
      return this.config.dataDir;
    }
    // Default to XDG data directory
    const xdgData = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
    return join(xdgData, 'velcro');
  }

  getConfigPath(): string {
    return this.configPath;
  }

  reload(): void {
    this.config = this.loadConfig();
  }

  private loadConfig(): VelcroConfig {
    if (existsSync(this.configPath)) {
      try {
        const rawConfig = JSON.parse(readFileSync(this.configPath, 'utf-8'));
        return ConfigSchema.parse(rawConfig);
      } catch (error) {
        console.error('Error loading config:', error);
        console.error('Using default configuration');
      }
    }
    
    // Return default config
    const defaultConfig = ConfigSchema.parse({});
    this.saveConfig(defaultConfig);
    return defaultConfig;
  }

  private saveConfig(config: VelcroConfig): void {
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  getConfig(): VelcroConfig {
    return this.config;
  }

  updateConfig(updates: Partial<VelcroConfig>): void {
    this.config = ConfigSchema.parse({ ...this.config, ...updates });
    this.saveConfig(this.config);
  }

  // Handler management methods
  addHandler(handler: Handler): void {
    this.config.handlers.push(handler);
    this.saveConfig(this.config);
  }

  removeHandler(name: string): boolean {
    const index = this.config.handlers.findIndex(h => h.name === name);
    if (index !== -1) {
      this.config.handlers.splice(index, 1);
      this.saveConfig(this.config);
      return true;
    }
    return false;
  }

  getHandler(name: string): Handler | undefined {
    return this.config.handlers.find(h => h.name === name);
  }

  listHandlers(): Handler[] {
    return this.config.handlers;
  }

  enableHandler(name: string): boolean {
    const handler = this.config.handlers.find(h => h.name === name);
    if (handler) {
      handler.enabled = true;
      this.saveConfig(this.config);
      return true;
    }
    return false;
  }

  disableHandler(name: string): boolean {
    const handler = this.config.handlers.find(h => h.name === name);
    if (handler) {
      handler.enabled = false;
      this.saveConfig(this.config);
      return true;
    }
    return false;
  }

  getHandlersForHook(hookType: string): Handler[] {
    return this.config.handlers.filter(
      h => h.enabled && h.hooks.includes(hookType as HookType)
    );
  }
}

// Export singleton instance
export const configManager = new ConfigManager();