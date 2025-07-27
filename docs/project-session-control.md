# Project and Session Hook Control

Velcro supports fine-grained control over which hooks run at three levels:

1. **Global** - Default configuration in `~/.config/velcro/config.json`
2. **Project** - Project-specific overrides in `.velcro/project.json`
3. **Session** - Runtime overrides for the current Claude Code session

## Priority Order

Session overrides > Project configuration > Global configuration

## Project Configuration

Create a `.velcro/project.json` file in your project root:

```json
{
  "hooks": {
    "enabled": ["logger", "security-check"],
    "disabled": ["debug-hook"],
    "overrides": {
      "logger": {
        "matcher": "*.ts"  // Only for TypeScript files
      }
    }
  }
}
```

### Fields:
- `enabled`: Array of handler names to enable for this project
- `disabled`: Array of handler names to disable for this project
- `overrides`: Handler-specific configuration overrides

## Session Control

Use the `session` MCP tool to control hooks for the current Claude Code session:

### Enable a hook for current session
```
mcp_session enable --name logger
```

### Disable a hook for current session
```
mcp_session disable --name security-check
```

### View current session status
```
mcp_session status
```

### Clear all session overrides
```
mcp_session clear
```

## Examples

### Example 1: Project with strict security
`.velcro/project.json`:
```json
{
  "hooks": {
    "enabled": ["security-check", "audit-log"],
    "disabled": ["debug-logger"],
    "overrides": {
      "security-check": {
        "matcher": ".*"  // Check all tools
      }
    }
  }
}
```

### Example 2: Development vs Production
During development, temporarily disable strict checks:
```
mcp_session disable --name security-check
mcp_session disable --name audit-log
```

### Example 3: Debugging specific handler
Enable verbose logging for one session:
```
mcp_session enable --name debug-logger
```

## Implementation Details

The hook resolution follows this logic:

1. Check session state for override
2. If no session override, check project config
3. If no project config, use global setting
4. Apply any project-level handler overrides (like matcher patterns)

This allows maximum flexibility while maintaining clear precedence rules.