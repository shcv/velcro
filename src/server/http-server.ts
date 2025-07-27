import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { configManager } from '../config/index.js';
import { HookData } from '../types/hooks.js';
import { HandlerExecutor, HookExecutionResult } from '../handlers/executor.js';
import { handlerResolver } from '../handlers/resolver.js';
import { createMCPServer } from './mcp-handlers.js';
import { logger } from '../logging/logger.js';
import { SimpleOAuthProvider } from './auth/simple-oauth.js';
import { createSecurityMiddleware, logSecurityConfiguration } from './auth/security-middleware.js';

interface CcguardResponse {
  decision?: string;
  reason?: string;
}

// Initialize components
const handlerExecutor = new HandlerExecutor();
const oauthProvider = new SimpleOAuthProvider();

// Map to store active MCP sessions
const mcpSessions = new Map<string, Server>();

export async function startHTTPServer(options: { port?: number, host?: string } = {}): Promise<void> {
  const config = configManager.getConfig();
  const port = options.port || config.server.port;
  const host = options.host || config.server.host;
  
  // Create Express app
  const app = express();
  app.use(express.json());
  
  // Add security middleware BEFORE other routes
  app.use(createSecurityMiddleware());
  
  // Add CORS headers for MCP
  app.use((req, res, next) => {
    // Only allow CORS from localhost for security
    const origin = req.headers.origin || '';
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      res.header('Access-Control-Allow-Origin', origin);
    } else if (config.server.host !== 'localhost' && config.server.allowRemoteWithoutAuth) {
      // Only allow remote CORS if explicitly configured
      res.header('Access-Control-Allow-Origin', '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, x-session-id');
    res.header('Access-Control-Expose-Headers', 'mcp-session-id');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });
  
  // Add OAuth routes
  app.use('/', oauthProvider.createRouter());

  // Hook submission endpoint
  app.post('/hooks', async (req, res) => {
    try {
      const hookData = req.body as HookData;
      
      // Log the incoming hook
      logger.logHook(hookData);
      logger.info(`Processing ${hookData.hook_event_name} hook`);
      
      // Execute handlers for this hook using resolver
      const handlers = handlerResolver.resolveHandlers(hookData);
      logger.debug(`Found ${handlers.length} handlers for ${hookData.hook_event_name}`);
      
      // Track results from handlers
      const results: HookExecutionResult[] = [];
      let blocked = false;
      let blockingResult: HookExecutionResult | null = null;
      
      // Execute handlers in parallel (like Claude Code does)
      const executionPromises = handlers.map(handler => 
        handlerExecutor.execute(handler, hookData)
      );
      
      const executionResults = await Promise.allSettled(executionPromises);
      
      // Process results
      for (let i = 0; i < executionResults.length; i++) {
        const promiseResult = executionResults[i];
        const handler = handlers[i];
        
        if (promiseResult.status === 'fulfilled') {
          const result = promiseResult.value;
          results.push(result);
          
          // Log successful output
          if (result.success && result.output) {
            logger.info(`Handler output from ${handler.name}`, { output: result.output });
          }
          
          // Check for blocking
          if (result.blockExecution) {
            blocked = true;
            blockingResult = result;
            // Log blocking message
            if (result.stderr) {
              logger.warn(`Handler ${handler.name} blocked execution`, { stderr: result.stderr });
            }
          } else if (!result.success && result.stderr) {
            // Log non-blocking errors
            logger.error(`Handler ${handler.name} failed`, { stderr: result.stderr });
          }
        } else {
          // Promise rejected - handler threw an exception
          const error = promiseResult.reason;
          logger.error(`Handler ${handler.name} execution failed`, { error });
          results.push({
            handler: handler.name,
            success: false,
            error: error.message,
            duration: 0
          });
        }
      }
      
      // Build response matching Claude Code's format
      interface HookResponse {
        success: boolean;
        handlers: number;
        blocked?: boolean;
        blockingHandler?: string;
        decision?: string;
        reason?: string;
        blockingMessage?: string;
        output?: string;
        responses?: Array<unknown>;
      }
      
      const response: HookResponse = {
        success: !blocked,
        handlers: results.length
      };
      
      if (blocked && blockingResult) {
        response.blocked = true;
        response.blockingHandler = blockingResult.handler;
        
        // If the blocking handler returned JSON with decision/reason (like ccguard)
        if (blockingResult.response && typeof blockingResult.response === 'object') {
          const blockingResponse = blockingResult.response as CcguardResponse;
          response.decision = blockingResponse.decision;
          response.reason = blockingResponse.reason;
          // Don't duplicate the reason in blockingMessage
          if (!blockingResponse.reason || blockingResult.stderr !== blockingResponse.reason) {
            response.blockingMessage = blockingResult.stderr || 'Operation blocked';
          }
        } else {
          // Non-JSON blocking response
          response.blockingMessage = blockingResult.stderr || 'Operation blocked';
        }
      }
      
      // Collect successful outputs to send back
      const successfulOutputs = results
        .filter(r => r.success && r.output && r.output.trim())
        .map(r => r.output!.trim());
      
      if (successfulOutputs.length > 0) {
        // Join outputs with double newlines like Claude Code does
        response.output = successfulOutputs.join('\n\n');
      }
      
      // Include any JSON responses that affect behavior
      const jsonResponses = results
        .filter(r => r.response && typeof r.response === 'object')
        .map(r => r.response);
      
      if (jsonResponses.length > 0) {
        response.responses = jsonResponses;
      }
      
      // Return results
      res.status(200).json(response);
    } catch (error: unknown) {
      logger.error('Hook processing error', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(500).send('Internal Server Error');
    }
  });

  // MCP endpoints
  
  // SSE transport (legacy)
  app.get('/sse', async (req, res) => {
    const sessionId = req.headers['x-session-id'] as string || `sse-${Date.now()}`;
    
    // Create new MCP server for this session
    const mcpServer = createMCPServer();
    mcpSessions.set(sessionId, mcpServer);
    
    // Create SSE transport
    const transport = new SSEServerTransport('/messages', res);
    
    // Connect server to transport
    await mcpServer.connect(transport);
    
    // Clean up on close
    transport.onclose = () => {
      mcpSessions.delete(sessionId);
    };
  });

  // SSE message endpoint
  app.post('/messages', async (req, res) => {
    const sessionId = req.headers['x-session-id'] as string;
    
    if (!sessionId) {
      res.status(400).send('Missing session ID');
      return;
    }
    
    const server = mcpSessions.get(sessionId);
    if (!server) {
      res.status(404).send('Session not found');
      return;
    }
    
    // The SSE transport will handle the message
    res.status(200).send('OK');
  });

  // Store MCP server instances and transports per session
  const streamableSessions = new Map<string, { server: Server, transport: StreamableHTTPServerTransport }>();
  
  // Streamable HTTP transport handler
  const mcpHandler = async (req: express.Request, res: express.Response): Promise<void> => {
    // Get or create session ID
    const sessionId = req.headers['mcp-session-id'] as string || 
                     req.headers['x-session-id'] as string ||
                     `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if we have an existing session
    let session = streamableSessions.get(sessionId);
    
    if (!session) {
      // Create a new MCP server for this session
      const mcpServer = createMCPServer();
      
      // Create a new transport for this session
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
        enableJsonResponse: false, // Use SSE streaming
        onsessioninitialized: async (sid) => {
          logger.info(`MCP session initialized: ${sid}`);
        },
        onsessionclosed: (sid) => {
          logger.info(`MCP session closed: ${sid}`);
          streamableSessions.delete(sid);
        }
      });
      
      // Connect the server to the transport
      await mcpServer.connect(transport);
      
      // Store the session
      session = { server: mcpServer, transport };
      streamableSessions.set(sessionId, session);
    }
    
    // Handle the request through the session's transport
    await session.transport.handleRequest(req, res, req.body);
  };
  
  // Register MCP endpoint with optional OAuth
  if (config.auth?.enabled && config.auth?.required) {
    app.all('/mcp', oauthProvider.requireAuth(), mcpHandler);
  } else {
    app.all('/mcp', mcpHandler);
  }

  // Start HTTP server
  app.listen(port, host, () => {
    // Log security configuration warnings
    logSecurityConfiguration();
    
    logger.info(`Velcro server listening on http://${host}:${port}`, {
      endpoints: {
        hooks: 'POST /hooks',
        mcp: '/mcp (recommended)',
        sse: 'GET /sse, POST /messages (legacy)'
      },
      auth: config.auth?.enabled ? {
        authorization: '/oauth/authorize',
        token: '/oauth/token',
        metadata: '/.well-known/oauth-authorization-server',
        required: config.auth.required
      } : undefined
    });
    
    // Also log to console for immediate visibility
    console.error(`\nVelcro server listening on http://${host}:${port}`);
    console.error('Hook submission endpoint: POST /hooks');
    console.error('MCP endpoints:');
    console.error('  - Streamable HTTP: /mcp (recommended)');
    console.error('  - SSE: GET /sse, POST /messages (legacy)');
    
    if (config.auth?.enabled) {
      console.error('\nOAuth endpoints:');
      console.error('  - Authorization: /oauth/authorize');
      console.error('  - Token: /oauth/token');
      console.error('  - Metadata: /.well-known/oauth-authorization-server');
      console.error(`  - OAuth ${config.auth.required ? 'REQUIRED' : 'optional'} for MCP access`);
    }
  });
}