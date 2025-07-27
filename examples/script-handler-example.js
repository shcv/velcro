/**
 * JavaScript Script Handler Example for Velcro
 *
 * This handler demonstrates how to create a JavaScript script handler that:
 * 1. Receives hook data as a global 'hookData' variable
 * 2. Can use console.log() for output
 * 3. Returns values directly (no function wrapper needed)
 * 4. Has access to require() for modules
 *
 * INPUT FORMAT (via global hookData variable):
 * {
 *   session_id: "unique-session-id",
 *   transcript_path: "/path/to/transcript.jsonl",
 *   cwd: "/current/working/directory",
 *   hook_event_name: "PreToolUse",
 *   tool_name: "Edit",  // Only for tool-related hooks
 *   tool_input: {       // Tool-specific input data
 *     file_path: "/path/to/file",
 *     old_string: "text to replace",
 *     new_string: "replacement text"
 *   }
 * }
 *
 * OUTPUT FORMAT:
 * - Return a string for simple output
 * - Return an object for structured responses
 * - Use console.log() for additional output
 * - Throw errors to indicate failures
 *
 * AVAILABLE GLOBALS:
 * - hookData: The hook event data
 * - console: For logging output
 * - require: For importing modules
 */

// Example 1: Simple logging for all tools
if (hookData.hook_event_name === 'PostToolUse') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Tool ${hookData.tool_name} was executed`);
}

// Example 2: Validate file paths
if (hookData.hook_event_name === 'PreToolUse' && hookData.tool_name === 'Write') {
  const filePath = hookData.tool_input?.file_path;
  
  // Prevent writing to system directories
  const dangerousPaths = ['/etc', '/usr', '/bin', '/sbin', '/sys', '/proc'];
  if (filePath && dangerousPaths.some(path => filePath.startsWith(path))) {
    // Throw an error to block the operation
    throw new Error(`Writing to system directory is not allowed: ${filePath}`);
  }
  
  // Warn about writing outside project
  if (filePath && filePath.startsWith('/') && !filePath.startsWith(hookData.cwd)) {
    console.log(`[Warning] Writing file outside project directory: ${filePath}`);
  }
}

// Example 3: Count lines being added/removed in edits
if (hookData.hook_event_name === 'PreToolUse' && hookData.tool_name === 'Edit') {
  const oldString = hookData.tool_input?.old_string || '';
  const newString = hookData.tool_input?.new_string || '';
  
  const oldLines = oldString.split('\n').length;
  const newLines = newString.split('\n').length;
  const diff = newLines - oldLines;
  
  if (diff !== 0) {
    console.log(`[Edit Stats] ${diff > 0 ? '+' : ''}${diff} lines`);
  }
}

// Example 4: Custom command processing
if (hookData.hook_event_name === 'UserPromptSubmit') {
  const prompt = hookData.prompt || '';
  
  if (prompt === '/session-info') {
    // Return structured data
    return {
      session_id: hookData.session_id,
      working_dir: hookData.cwd,
      transcript: hookData.transcript_path,
      timestamp: new Date().toISOString()
    };
  }
}

// Example 5: Enforce file naming conventions
if (hookData.hook_event_name === 'PreToolUse' && hookData.tool_name === 'Write') {
  const filePath = hookData.tool_input?.file_path || '';
  const fileName = filePath.split('/').pop() || '';
  
  // Check for proper naming conventions
  if (fileName.endsWith('.js') && !/^[a-z][a-z0-9-]*\.js$/.test(fileName)) {
    console.log(`[Style] JavaScript files should use kebab-case: ${fileName}`);
  }
}

// Default: Return nothing (operation continues)
// You can also return a string or object here

/**
 * USAGE EXAMPLE:
 *
 * 1. Save this script to a file
 *
 * 2. Add as a Velcro handler:
 *    velcro handler add \
 *      --name js-validator \
 *      --type script \
 *      --script /path/to/script-handler-example.js \
 *      --hook PreToolUse PostToolUse UserPromptSubmit
 *
 * 3. Test standalone:
 *    # Create test data
 *    echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"/etc/passwd"}}' > test.json
 *    
 *    # Run the script
 *    node -e "global.hookData = require('./test.json'); require('./script-handler-example.js')"
 *
 * 4. Using with npm packages:
 *    # If your script needs packages, install them globally or in the handler's package directory
 *    
 *    # Then in your script:
 *    const lodash = require('lodash');
 *    const validator = require('validator');
 *    // ... use the packages
 */