import { HookType } from './hooks.js';

export interface VelcroConfig {
  // Server configuration
  server: {
    port: number;              // Default: 3010
    host: string;              // Default: 'localhost'
    apiKey?: string;           // Optional authentication
  };
  
  // MCP configuration
  mcp: {
    transport: 'stdio' | 'http';  // Default: 'http' for multiple connections
    httpPort?: number;            // Default: 3011
    enableOAuth?: boolean;
    enabledTools?: string[];      // Default: all tools. Tool names without 'velcro_' prefix
    requireApiKey?: boolean;      // Default: true for non-localhost connections
  };
  
  // Logging configuration
  logging: {
    dataDir: string;           // Default: XDG_DATA_HOME/velcro
    level: 'debug' | 'info' | 'warn' | 'error';
    maxFiles: number;          // Log rotation
    maxSize: string;           // e.g., '10MB'
    filters: LogFilter[];
    enableConsole: boolean;
  };
  
  // Handler configuration
  handlers: {
    timeout: number;           // Default: 30000ms
    sandboxing: boolean;       // Default: true
    allowedModules: string[];  // Whitelist for built-in modules
    packageDir?: string;       // Default: $XDG_DATA_HOME/velcro/node_modules
    errorBehavior: 'continue' | 'block';  // Default: 'continue' (log and continue)
  };
  
  // Hook filtering
  hooks: {
    enabled: HookType[];       // Which hooks to process
    filters: HookFilter[];     // Pattern-based filtering
  };
}

export interface LogFilter {
  field: string;
  pattern: string | RegExp;
  action: 'include' | 'exclude';
}

export interface HookFilter {
  type?: HookType;
  toolName?: string | RegExp;
  action: 'include' | 'exclude';
}