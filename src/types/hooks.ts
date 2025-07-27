export type HookType = 
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'Notification'
  | 'Stop'
  | 'SubagentStop'
  | 'PreCompact';

// Common fields for all hooks from Claude Code
export interface BaseHookData {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: HookType;
}

// Specific hook data structures based on captured data
export interface PreToolUseHookData extends BaseHookData {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface PostToolUseHookData extends BaseHookData {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
}

export interface UserPromptSubmitHookData extends BaseHookData {
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
}

// Additional hook data structures from captured data
export interface StopHookData extends BaseHookData {
  hook_event_name: 'Stop';
  stop_hook_active: boolean;
}

export interface SubagentStopHookData extends BaseHookData {
  hook_event_name: 'SubagentStop';
  stop_hook_active: boolean;
}

export interface NotificationHookData extends BaseHookData {
  hook_event_name: 'Notification';
  message: string;
}

export interface PreCompactHookData extends BaseHookData {
  hook_event_name: 'PreCompact';
  trigger: string;
  custom_instructions: string;
}

// Union type for all hook data from Claude Code
export type ClaudeHookData = 
  | PreToolUseHookData 
  | PostToolUseHookData 
  | UserPromptSubmitHookData
  | StopHookData
  | SubagentStopHookData
  | NotificationHookData
  | PreCompactHookData;

// Export HookData as alias for ClaudeHookData
export type HookData = ClaudeHookData;

// Our internal event structure (transformed from Claude's format)
export interface HookEvent {
  type: HookType;
  timestamp: Date;
  sessionId: string;
  transcriptPath: string;
  cwd: string;
  data: {
    toolName?: string;
    toolInput?: Record<string, unknown>;
    toolResponse?: unknown;
    prompt?: string;
    [key: string]: unknown;
  };
}