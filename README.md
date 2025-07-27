# Velcro

Master hook interceptor for Claude Code with dynamic handler management.

## Why Velcro?

Claude Code's native hooks are static - you edit JSON files and restart. Velcro makes hooks dynamic:

- **Enable/disable handlers without restarting** - Toggle handlers via MCP tools
- **Use npm packages** - Full Node.js ecosystem in your handlers
- **Test before deploying** - Run handlers with mock data
- **Query hook history** - All hooks logged to searchable JSONL
- **Import existing hooks** - Works with your current Claude setup

## Quick Start

```bash
# Install globally
npm install -g @shcv/velcro

# Or install locally
npm install @shcv/velcro

# Add to Claude Code
velcro install-hooks

# Start server
velcro serve

# Import existing handlers (optional)
velcro import
```

## Example Handler

Block writes to sensitive files:

```javascript
// Via MCP: velcro-hook add
if (hookData.tool_name === 'Write' && /\.env$/.test(hookData.tool_input.file_path)) {
  console.error('Blocked: Cannot modify .env files');
  process.exit(2); // Exit code 2 blocks the tool
}
```

## Handler Types

1. **Velcro** - JavaScript with npm packages
2. **Command** - Shell commands (Claude-compatible)  
3. **Script** - External script files

All handlers support:
- Tool filtering via regex matchers
- Exit codes: 0=success, 2=block, other=error
- Full hook data via stdin/arguments

## MCP Tools

- `velcro-hook` - Manage handlers (add, test, enable/disable)
- `velcro-config` - Update configuration
- `velcro-package` - Install npm packages for handlers
- `velcro-log` - Query hook execution logs
- `velcro-monitor` - Monitor handler performance

## Security Configuration

By default, Velcro only accepts connections from localhost for security. To enable remote access:

### Safe Remote Access (Recommended)

```bash
# 1. Allow remote connections with OAuth requirement
velcro security allow-remote

# 2. Configure OAuth credentials
velcro security configure-oauth --client-id YOUR_ID --client-secret YOUR_SECRET

# 3. Check security status
velcro security status
```

### Disable Authentication (DANGEROUS)

⚠️ **WARNING**: This allows REMOTE CODE EXECUTION from any network client!

```bash
# Only use in trusted, isolated environments
velcro security disable-auth --i-understand-the-risks
```

### Security Commands

- `velcro security status` - Show current security configuration
- `velcro security allow-remote` - Enable remote connections (with auth)
- `velcro security localhost-only` - Restrict to localhost only
- `velcro security configure-oauth` - Set OAuth credentials
- `velcro security require-auth` - Re-enable authentication requirement

## Architecture

```
Claude Code → Hooks → Velcro → Log + Execute Handlers
                         ↓
                    MCP Server ← Claude UI
```

## Documentation

- [Design Document](docs/design.org) - Full architecture details
- [HTTP Transport](docs/http-transport.org) - MCP transport options
- [Security Guide](docs/security.org) - Security configuration and best practices
- [Examples](examples/) - Handler examples

## License

CC0 1.0 Universal - Public Domain Dedication