// Native Claude Code handler types

export interface ClaudeHook {
  type: 'command' | 'script';
  command?: string;
  script?: string;
  enabled?: boolean;
}

export interface ClaudeHandlerEntry {
  matcher?: string;  // Regex pattern for filtering (e.g., "Edit|Write", ".*")
  hooks: ClaudeHook[];
}

export interface ClaudeHandlerConfig {
  [hookType: string]: ClaudeHandlerEntry[];
}

// Extended handler format that combines Velcro and Claude features
export interface ExtendedHandler {
  // Velcro fields
  name: string;
  enabled: boolean;
  hooks: string[];
  code?: string;
  packages?: string[];
  
  // Claude compatibility fields
  type: 'velcro' | 'command' | 'script';
  matcher?: string;  // Regex for tool filtering
  command?: string;  // For command type handlers
  script?: string;   // For script type handlers
  
  // Metadata
  source?: 'velcro' | 'claude';  // Where the handler came from
  managed?: boolean;  // Whether Velcro manages this handler
}