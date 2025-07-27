import { Command } from 'commander';
import { configManager } from '../../config/index.js';
import chalk from 'chalk';

export const securityCommand = new Command('security')
  .description('Security configuration for remote access')
  .addCommand(
    new Command('status')
      .description('Show current security configuration')
      .action(() => {
        const config = configManager.getConfig();
        
        console.log('=== Velcro Security Configuration ===\n');
        
        // Server binding
        console.log(`Server binding: ${config.server.host}:${config.server.port}`);
        if (config.server.host === 'localhost' || config.server.host === '127.0.0.1') {
          console.log(chalk.green('✓ Server is only accessible from localhost\n'));
        } else {
          console.log(chalk.yellow('⚠ Server is accessible from network\n'));
        }
        
        // Authentication settings
        console.log('Authentication:');
        console.log(`  OAuth enabled: ${config.auth.enabled}`);
        console.log(`  OAuth required for localhost: ${config.auth.required}`);
        console.log(`  OAuth required for remote: ${config.server.requireAuthForRemote}`);
        
        // Security analysis
        if (config.server.host !== 'localhost' && config.server.host !== '127.0.0.1') {
          if (config.server.allowRemoteWithoutAuth) {
            console.log(chalk.red('\n🚨 CRITICAL SECURITY WARNING:'));
            console.log(chalk.red('Remote connections are allowed WITHOUT authentication!'));
            console.log(chalk.red('This allows REMOTE CODE EXECUTION from any network client.'));
            console.log(chalk.red('\nTo secure your server:'));
            console.log(chalk.red('  velcro security require-auth'));
          } else if (config.server.requireAuthForRemote) {
            if (config.auth.clientId && config.auth.clientSecret) {
              console.log(chalk.green('\n✓ Remote connections require OAuth authentication'));
            } else {
              console.log(chalk.yellow('\n⚠ OAuth is required but not configured'));
              console.log(chalk.yellow('  Set auth.clientId and auth.clientSecret'));
            }
          }
        }
      })
  )
  .addCommand(
    new Command('allow-remote')
      .description('Allow remote connections (requires additional steps)')
      .option('-h, --host <host>', 'Host to bind to (e.g., 0.0.0.0 for all interfaces)')
      .action((options) => {
        const host = options.host || '0.0.0.0';
        
        console.log(chalk.yellow('⚠️  WARNING: Allowing remote connections'));
        console.log('');
        console.log('This will make your Velcro server accessible from the network.');
        console.log('By default, remote connections will require OAuth authentication.');
        console.log('');
        console.log(`Setting server.host to: ${host}`);
        
        configManager.updateConfig({
          server: {
            ...configManager.getConfig().server,
            host: host,
            requireAuthForRemote: true
          }
        });
        
        console.log(chalk.green('\n✓ Configuration updated'));
        console.log('\nNext steps:');
        console.log('1. Configure OAuth: velcro security configure-oauth');
        console.log('2. Restart the server for changes to take effect');
        console.log('\nTo allow remote access WITHOUT authentication (NOT RECOMMENDED):');
        console.log('  velcro security disable-auth --i-understand-the-risks');
      })
  )
  .addCommand(
    new Command('require-auth')
      .description('Require authentication for remote connections')
      .action(() => {
        configManager.updateConfig({
          server: {
            ...configManager.getConfig().server,
            requireAuthForRemote: true,
            allowRemoteWithoutAuth: false
          }
        });
        
        console.log(chalk.green('✓ Remote connections now require authentication'));
        console.log('\nRestart the server for changes to take effect');
      })
  )
  .addCommand(
    new Command('disable-auth')
      .description('Disable authentication requirement (DANGEROUS)')
      .option('--i-understand-the-risks', 'Acknowledge the security risks')
      .action((options) => {
        if (!options.iUnderstandTheRisks) {
          console.log(chalk.red('🚨 CRITICAL SECURITY WARNING 🚨'));
          console.log('');
          console.log('Disabling authentication for remote connections allows:');
          console.log('  - ANYONE on your network to execute arbitrary code');
          console.log('  - Reading and modifying any files accessible to Velcro');
          console.log('  - Installing and running malicious packages');
          console.log('');
          console.log('Only proceed if you:');
          console.log('  1. Fully trust everyone on your network');
          console.log('  2. Are running in an isolated environment');
          console.log('  3. Understand and accept these risks');
          console.log('');
          console.log('To proceed, run:');
          console.log('  velcro security disable-auth --i-understand-the-risks');
          process.exit(1);
        }
        
        configManager.updateConfig({
          server: {
            ...configManager.getConfig().server,
            requireAuthForRemote: false,
            allowRemoteWithoutAuth: true
          }
        });
        
        console.log(chalk.red('⚠️  Authentication disabled for remote connections'));
        console.log(chalk.red('Your server is now vulnerable to remote code execution!'));
        console.log('\nRestart the server for changes to take effect');
      })
  )
  .addCommand(
    new Command('configure-oauth')
      .description('Configure OAuth settings')
      .option('--client-id <id>', 'OAuth client ID')
      .option('--client-secret <secret>', 'OAuth client secret')
      .option('--redirect-uri <uri>', 'OAuth redirect URI')
      .action((options) => {
        const config = configManager.getConfig();
        interface ConfigUpdate {
          auth: typeof config.auth;
        }
        const updates: ConfigUpdate = { auth: { ...config.auth } };
        
        if (options.clientId) {
          updates.auth.clientId = options.clientId;
        }
        if (options.clientSecret) {
          updates.auth.clientSecret = options.clientSecret;
        }
        if (options.redirectUri) {
          updates.auth.redirectUri = options.redirectUri;
        }
        
        if (Object.keys(options).length === 0) {
          // Show current OAuth config
          console.log('Current OAuth configuration:');
          console.log(`  Client ID: ${config.auth.clientId || '(not set)'}`);
          console.log(`  Client Secret: ${config.auth.clientSecret ? '***' : '(not set)'}`);
          console.log(`  Redirect URI: ${config.auth.redirectUri}`);
          console.log('');
          console.log('To configure OAuth:');
          console.log('  velcro security configure-oauth --client-id YOUR_ID --client-secret YOUR_SECRET');
        } else {
          configManager.updateConfig(updates);
          console.log(chalk.green('✓ OAuth configuration updated'));
          console.log('\nRestart the server for changes to take effect');
        }
      })
  )
  .addCommand(
    new Command('localhost-only')
      .description('Restrict server to localhost connections only')
      .action(() => {
        configManager.updateConfig({
          server: {
            ...configManager.getConfig().server,
            host: 'localhost'
          }
        });
        
        console.log(chalk.green('✓ Server restricted to localhost connections only'));
        console.log('\nRestart the server for changes to take effect');
      })
  );