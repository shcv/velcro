#!/usr/bin/env python3
"""
External Handler Example for Velcro

This handler demonstrates how to create an external command handler that:
1. Reads hook data from stdin as JSON
2. Processes the data
3. Returns a response via stdout
4. Uses exit codes to control flow

INPUT FORMAT (via stdin):
{
  "session_id": "unique-session-id",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "PreToolUse",
  "tool_name": "Edit",  // Only for tool-related hooks
  "tool_input": {       // Tool-specific input data
    "file_path": "/path/to/file",
    "old_string": "text to replace",
    "new_string": "replacement text"
  }
}

OUTPUT FORMAT (via stdout):
- For approval: {"decision": "approve", "reason": "Optional reason"}
- For blocking: {"decision": "block", "reason": "Why blocked"}
- For simple text output: Just print to stdout (will be shown to user)

EXIT CODES:
- 0: Success (operation continues)
- 2: Block operation (prevents tool execution)
- Any other: Error (operation continues with warning)
"""

import json
import sys
import os

def main():
    try:
        # Read hook data from stdin
        hook_data_raw = sys.stdin.read()
        hook_data = json.loads(hook_data_raw)
        
        # Extract relevant information
        event_name = hook_data.get('hook_event_name', '')
        tool_name = hook_data.get('tool_name', '')
        tool_input = hook_data.get('tool_input', {})
        
        # Example: Block edits to sensitive files
        if event_name == 'PreToolUse' and tool_name == 'Edit':
            file_path = tool_input.get('file_path', '')
            
            # Check for sensitive files
            sensitive_patterns = ['.env', 'secrets', 'credentials', 'private']
            if any(pattern in file_path.lower() for pattern in sensitive_patterns):
                # Return JSON response to block
                response = {
                    "decision": "block",
                    "reason": f"Editing sensitive file '{file_path}' is not allowed"
                }
                print(json.dumps(response))
                sys.exit(2)  # Exit code 2 blocks the operation
        
        # Example: Log all tool usage
        if event_name == 'PostToolUse':
            # Simple text output (will be shown in Claude's output)
            print(f"[Logger] Tool '{tool_name}' was used successfully")
            sys.exit(0)
        
        # Example: Validate UserPromptSubmit
        if event_name == 'UserPromptSubmit':
            prompt = hook_data.get('prompt', '')
            
            # Check for special commands
            if prompt.startswith('/debug'):
                # Provide debug information
                print(f"Debug Info:")
                print(f"  Session: {hook_data.get('session_id', 'unknown')}")
                print(f"  CWD: {hook_data.get('cwd', 'unknown')}")
                print(f"  Transcript: {hook_data.get('transcript_path', 'unknown')}")
                sys.exit(0)
        
        # Default: Approve all operations
        response = {"decision": "approve", "reason": ""}
        print(json.dumps(response))
        sys.exit(0)
        
    except json.JSONDecodeError as e:
        # Invalid JSON input
        print(f"Error parsing hook data: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        # Any other error
        print(f"Handler error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

"""
USAGE EXAMPLE:

1. Make the script executable:
   chmod +x external-handler-example.py

2. Add as a Velcro handler:
   velcro handler add \
     --name sensitive-file-guard \
     --type external \
     --command /path/to/external-handler-example.py \
     --hook PreToolUse PostToolUse UserPromptSubmit \
     --matcher "Edit|Write"

3. Test with sample data:
   echo '{"hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":".env"}}' | ./external-handler-example.py
"""