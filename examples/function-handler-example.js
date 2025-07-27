/**
 * Function Handler Example for Velcro
 *
 * This handler demonstrates how to create a JavaScript function handler that:
 * 1. Receives hook data as a function parameter
 * 2. Can use console.log() for output
 * 3. Returns an object to control behavior
 * 4. Runs in-process (no external execution)
 *
 * INPUT FORMAT (as function parameter):
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
 * RETURN FORMAT:
 * - For blocking: { blocked: true, message: "reason" }
 * - For errors: { error: true, message: "error details" }
 * - For success with output: { message: "output text" }
 * - For simple approval: {} or null
 *
 * AVAILABLE GLOBALS:
 * - console: For logging output
 * - require: For importing modules (with package support)
 */

// Function handlers must return a result object
return (async (hookData) => {
  // Example 1: Code quality checks for Edit operations
  if (hookData.hook_event_name === 'PreToolUse' && hookData.tool_name === 'Edit') {
    const { file_path, new_string } = hookData.tool_input || {};
    
    // Check for code quality issues
    if (file_path && file_path.endsWith('.js')) {
      // Check for console.log in production code
      if (new_string && new_string.includes('console.log') && !file_path.includes('test')) {
        return {
          blocked: true,
          message: `Found console.log in production code. Please use proper logging instead.`
        };
      }
      
      // Check for TODO comments
      const todoMatch = new_string && new_string.match(/TODO|FIXME|XXX/g);
      if (todoMatch) {
        console.log(`[CodeQuality] Found ${todoMatch.length} TODO/FIXME comments in edit`);
      }
    }
  }
  
  // Example 2: Track file statistics
  if (hookData.hook_event_name === 'PostToolUse') {
    const stats = {
      Write: 'created',
      Edit: 'modified',
      Read: 'accessed'
    };
    
    const action = stats[hookData.tool_name];
    if (action && hookData.tool_input?.file_path) {
      console.log(`[FileTracker] ${hookData.tool_input.file_path} was ${action}`);
    }
  }
  
  // Example 3: Custom command handling
  if (hookData.hook_event_name === 'UserPromptSubmit') {
    const prompt = hookData.prompt || '';
    
    // Parse custom commands
    if (prompt.startsWith('/stats')) {
      const sessionInfo = {
        session: hookData.session_id,
        cwd: hookData.cwd,
        transcript: hookData.transcript_path
      };
      
      return {
        message: `Session Statistics:\n${JSON.stringify(sessionInfo, null, 2)}`
      };
    }
    
    // Validate certain prompts
    if (prompt.toLowerCase().includes('delete') && prompt.toLowerCase().includes('all')) {
      return {
        blocked: true,
        message: 'Operations that delete all files require explicit confirmation. Please be more specific.'
      };
    }
  }
  
  // Example 4: Enforce coding standards
  if (hookData.hook_event_name === 'PreToolUse' && hookData.tool_name === 'Write') {
    const { file_path, content } = hookData.tool_input || {};
    
    // Ensure new files have proper headers
    if (file_path && file_path.endsWith('.js') && content) {
      if (!content.startsWith('/**') && !content.startsWith('//')) {
        console.log('[Standards] New JS file missing header comment');
        // Just warn, don't block
      }
    }
  }
  
  // Default: Approve the operation
  return null;
})(hookData);

/**
 * USAGE EXAMPLE:
 *
 * 1. Save this code to a file (or use inline)
 *
 * 2. Add as a Velcro handler:
 *    velcro handler add \
 *      --name code-quality \
 *      --type function \
 *      --file function-handler-example.js \
 *      --hook PreToolUse PostToolUse UserPromptSubmit
 *
 * 3. Or add inline:
 *    velcro handler add \
 *      --name simple-logger \
 *      --type function \
 *      --code "return { message: 'Tool ' + hookData.tool_name + ' was called' };" \
 *      --hook PostToolUse
 *
 * 4. Advanced: Using npm packages
 *    velcro handler add \
 *      --name validator \
 *      --type function \
 *      --file validator.js \
 *      --packages joi \
 *      --hook PreToolUse
 *
 *    Then in validator.js:
 *    const Joi = require('joi');
 *    // ... use Joi for validation
 */