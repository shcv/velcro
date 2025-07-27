import { Request, Response, NextFunction } from 'express';
import { configManager } from '../../config/index.js';
import { logger } from '../../logging/logger.js';

export function createSecurityMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const config = configManager.getConfig();
    
    // Get the client IP address
    const clientIp = req.ip || req.socket.remoteAddress || '';
    
    // Check if this is a localhost connection
    const isLocalhost = ['127.0.0.1', '::1', 'localhost'].includes(clientIp) ||
                       clientIp.startsWith('127.') ||
                       clientIp === '::ffff:127.0.0.1';
    
    // If not localhost and not allowing remote without auth
    if (!isLocalhost && config.server.host !== 'localhost') {
      // Check if auth is required for remote connections
      if (config.server.requireAuthForRemote && !config.server.allowRemoteWithoutAuth) {
        // Check for authorization header
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          logger.warn('Remote connection attempt without authentication', {
            clientIp,
            path: req.path,
            method: req.method
          });
          
          res.status(401).json({
            error: 'Authentication required for remote connections',
            message: 'Remote connections require OAuth authentication. Configure your client to use OAuth or set server.allowRemoteWithoutAuth to true (WARNING: This allows remote code execution!)'
          });
          return;
        }
        
        // TODO: Validate the OAuth token
        // For now, we'll just check that a token exists
        const token = authHeader.substring(7);
        if (!token) {
          res.status(401).json({
            error: 'Invalid authentication token'
          });
          return;
        }
      } else if (!isLocalhost && config.server.allowRemoteWithoutAuth) {
        // Log warning about insecure configuration
        logger.warn('SECURITY WARNING: Remote connection allowed without authentication', {
          clientIp,
          path: req.path,
          method: req.method,
          warning: 'This configuration allows REMOTE CODE EXECUTION. Anyone who can reach this server can execute arbitrary code!'
        });
      }
    }
    
    next();
  };
}

export function logSecurityConfiguration() {
  const config = configManager.getConfig();
  
  if (config.server.host !== 'localhost' && config.server.host !== '127.0.0.1') {
    logger.warn('='.repeat(80));
    logger.warn('SECURITY CONFIGURATION WARNING');
    logger.warn('='.repeat(80));
    logger.warn(`Server is listening on ${config.server.host}:${config.server.port}`);
    
    if (config.server.allowRemoteWithoutAuth) {
      logger.warn('');
      logger.warn('🚨 CRITICAL SECURITY WARNING 🚨');
      logger.warn('Remote connections are allowed WITHOUT authentication!');
      logger.warn('This means ANYONE who can reach this server can:');
      logger.warn('  - Execute arbitrary code on your system');
      logger.warn('  - Read and modify any files accessible to this process');
      logger.warn('  - Install and run malicious packages');
      logger.warn('');
      logger.warn('To fix this:');
      logger.warn('1. Set server.requireAuthForRemote to true');
      logger.warn('2. Configure OAuth authentication');
      logger.warn('3. Or restrict server.host to "localhost"');
    } else if (config.server.requireAuthForRemote) {
      logger.info('Remote connections require OAuth authentication ✓');
      
      if (!config.auth.clientId || !config.auth.clientSecret) {
        logger.warn('');
        logger.warn('⚠️  OAuth is required but not fully configured!');
        logger.warn('Please set auth.clientId and auth.clientSecret in your config');
      }
    }
    
    logger.warn('='.repeat(80));
  } else {
    logger.info(`Server listening on ${config.server.host}:${config.server.port} (localhost only)`);
  }
}