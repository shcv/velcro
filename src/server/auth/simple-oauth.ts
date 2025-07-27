import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';

// Extend Express Request type to include tokenInfo
declare module 'express' {
  interface Request {
    tokenInfo?: AccessToken;
  }
}

interface Client {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
}

interface AuthorizationCode {
  code: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  expires_at: number;
}

interface AccessToken {
  token: string;
  client_id: string;
  scope: string;
  expires_at?: number;
}

export class SimpleOAuthProvider {
  private clients = new Map<string, Client>();
  private authCodes = new Map<string, AuthorizationCode>();
  private accessTokens = new Map<string, AccessToken>();
  
  constructor() {
    // Add a default client for local development
    this.clients.set('velcro-local', {
      client_id: 'velcro-local',
      redirect_uris: ['http://localhost:*', 'https://localhost:*']
    });
  }
  
  createRouter(): Router {
    const router = Router();
    
    // Import express json middleware
    const jsonParser = express.json();
    
    // OAuth 2.0 Authorization Server Metadata (RFC8414)
    router.get('/.well-known/oauth-authorization-server', (req, res) => {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none']
      });
    });
    
    // OAuth 2.0 Protected Resource Metadata (RFC9728)
    router.get('/.well-known/oauth-protected-resource', (req, res) => {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      res.json({
        resource: baseUrl,
        authorization_servers: [baseUrl],
        bearer_methods_supported: ['header'],
        resource_documentation: `${baseUrl}/docs`
      });
    });
    
    // Authorization endpoint
    router.get('/oauth/authorize', (req, res) => {
      const { client_id, redirect_uri, response_type, state, scope } = req.query;
      
      if (response_type !== 'code') {
        res.status(400).send('Only authorization code flow is supported');
        return;
      }
      
      const client = this.clients.get(client_id as string);
      if (!client) {
        res.status(400).send('Invalid client_id');
        return;
      }
      
      // For local development, auto-approve
      const code = crypto.randomBytes(32).toString('hex');
      this.authCodes.set(code, {
        code,
        client_id: client_id as string,
        redirect_uri: redirect_uri as string,
        scope: scope as string || 'read write',
        expires_at: Date.now() + 10 * 60 * 1000 // 10 minutes
      });
      
      // Redirect with authorization code
      const redirectUrl = new URL(redirect_uri as string);
      redirectUrl.searchParams.set('code', code);
      if (state) {
        redirectUrl.searchParams.set('state', state as string);
      }
      
      res.redirect(redirectUrl.toString());
    });
    
    // Token endpoint
    router.post('/oauth/token', jsonParser, (req, res) => {
      const { grant_type, code, redirect_uri, client_id } = req.body;
      
      if (grant_type !== 'authorization_code') {
        res.status(400).json({
          error: 'unsupported_grant_type',
          error_description: 'Only authorization_code grant type is supported'
        });
        return;
      }
      
      const authCode = this.authCodes.get(code);
      if (!authCode) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid authorization code'
        });
        return;
      }
      
      // Validate code hasn't expired
      if (authCode.expires_at < Date.now()) {
        this.authCodes.delete(code);
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Authorization code has expired'
        });
        return;
      }
      
      // Validate client and redirect_uri
      if (authCode.client_id !== client_id || authCode.redirect_uri !== redirect_uri) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid client_id or redirect_uri'
        });
        return;
      }
      
      // Generate access token
      const accessToken = crypto.randomBytes(32).toString('hex');
      this.accessTokens.set(accessToken, {
        token: accessToken,
        client_id: authCode.client_id,
        scope: authCode.scope
      });
      
      // Delete used authorization code
      this.authCodes.delete(code);
      
      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        scope: authCode.scope
      });
    });
    
    return router;
  }
  
  validateToken(token: string): AccessToken | null {
    return this.accessTokens.get(token) || null;
  }
  
  // Middleware to protect routes
  requireAuth() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'unauthorized',
          error_description: 'Missing or invalid Authorization header'
        });
        return;
      }
      
      const token = authHeader.slice(7);
      const tokenInfo = this.validateToken(token);
      
      if (!tokenInfo) {
        res.status(401).json({
          error: 'invalid_token',
          error_description: 'Invalid access token'
        });
        return;
      }
      
      req.tokenInfo = tokenInfo;
      next();
    };
  }
}

// Import express type
import express from 'express';