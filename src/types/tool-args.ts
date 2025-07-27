/**
 * Type definitions for MCP tool arguments
 */

export interface HookToolArgs {
  action: 'list' | 'add' | 'remove' | 'enable' | 'disable' | 'test' | 'import';
  name?: string;
  hooks?: string[];
  type?: 'velcro' | 'command' | 'script';
  code?: string;
  command?: string;
  script?: string;
  matcher?: string;
  packages?: string[];
  test_data?: unknown;
  import_path?: string;
}

export interface SettingsToolArgs {
  action: 'show' | 'update';
  settings?: Record<string, unknown>;
}

export interface PackageToolArgs {
  command: 'install' | 'list' | 'search' | 'info';
  packages?: string[];
  scope?: 'handler' | 'global';
  handler_name?: string;
}

export interface MonitorToolArgs {
  type?: 'stats' | 'health' | 'active';
  handler_name?: string;
  detailed?: boolean;
}

export interface LogToolArgs {
  action?: 'query' | 'tail';
  count?: number;
  filters?: {
    hook_type?: string;
    tool_name?: string;
    start_time?: string;
    end_time?: string;
  };
  limit?: number;
  offset?: number;
}

export type ToolArgs = HookToolArgs | SettingsToolArgs | PackageToolArgs | MonitorToolArgs | LogToolArgs;