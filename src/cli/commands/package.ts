import { Command } from 'commander';
import { packageManager, InstalledPackage } from '../../packages/manager.js';
import { configManager } from '../../config/index.js';

export const packageCommand = new Command('package')
  .description('NPM package management for handlers')
  .addCommand(
    new Command('install')
      .alias('i')
      .alias('add')
      .description('Install package(s)')
      .argument('<packages...>', 'Package names (can include version like lodash@4.17.21)')
      .option('-g, --global', 'Install globally (available to all handlers)')
      .option('-h, --handler <name>', 'Install for specific handler')
      .action(async (packages, options) => {
        try {
          const scope = options.global ? 'global' : 'handler';
          const handlerName = options.handler || 'default';
          
          if (!options.global && !options.handler) {
            console.error('Error: Must specify either --global or --handler <name>');
            process.exit(1);
          }
          
          console.log(`Installing packages for ${scope === 'global' ? 'global scope' : `handler '${handlerName}'`}...`);
          
          for (const pkg of packages) {
            console.log(`Installing ${pkg}...`);
            await packageManager.install([pkg], scope, handlerName);
          }
          
          console.log('Installation complete');
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Installation failed: ${errorMessage}`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('list')
      .alias('ls')
      .description('List installed packages')
      .option('-g, --global', 'List global packages')
      .option('-h, --handler <name>', 'List packages for specific handler')
      .option('-a, --all', 'List all packages (global and per-handler)')
      .option('--json', 'JSON output')
      .action(async (options) => {
        try {
          if (options.all) {
            // List all packages by listing global and all handler packages
            const handlers = configManager.listHandlers();
            interface PackageListItem extends InstalledPackage {
              scope: 'global' | 'handler';
              handlerName?: string;
            }
            const allPackages: PackageListItem[] = [];
            
            // Get global packages
            const globalPackages = await packageManager.list('global');
            globalPackages.forEach(pkg => {
              allPackages.push({
                ...pkg,
                scope: 'global'
              });
            });
            
            // Get packages for each handler
            for (const handler of handlers) {
              const handlerPackages = await packageManager.list('handler', handler.name);
              handlerPackages.forEach(pkg => {
                allPackages.push({
                  ...pkg,
                  scope: 'handler',
                  handlerName: handler.name
                });
              });
            }
            
            if (options.json) {
              console.log(JSON.stringify(allPackages, null, 2));
            } else {
              if (allPackages.length === 0) {
                console.log('No packages installed');
                return;
              }
              
              console.log('All installed packages:');
              allPackages.forEach(pkg => {
                const location = pkg.scope === 'global' ? 'global' : `handler: ${pkg.handlerName}`;
                console.log(`  ${pkg.name}@${pkg.version} (${location})`);
              });
            }
          } else {
            // List specific scope
            const scope = options.global ? 'global' : 'handler';
            const handlerName = options.handler;
            
            if (!options.global && !options.handler) {
              console.error('Error: Must specify either --global, --handler <name>, or --all');
              process.exit(1);
            }
            
            const packages = await packageManager.list(scope, handlerName);
            
            if (options.json) {
              console.log(JSON.stringify(packages, null, 2));
            } else {
              if (packages.length === 0) {
                console.log(`No packages installed for ${scope === 'global' ? 'global scope' : `handler '${handlerName}'`}`);
                return;
              }
              
              console.log(`Packages for ${scope === 'global' ? 'global scope' : `handler '${handlerName}'`}:`);
              packages.forEach(pkg => {
                console.log(`  ${pkg.name}@${pkg.version}`);
              });
            }
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error listing packages: ${errorMessage}`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('search')
      .description('Search npm registry')
      .argument('<query>', 'Search query')
      .option('-l, --limit <n>', 'Max results', '10')
      .action(async (query, options) => {
        try {
          console.log(`Searching for '${query}'...`);
          const results = await packageManager.search(query);
          
          if (results.length === 0) {
            console.log('No packages found');
            return;
          }
          
          const limit = parseInt(options.limit);
          results.slice(0, limit).forEach(pkg => {
            console.log(`\n${pkg.name}@${pkg.version}`);
            if (pkg.description) {
              console.log(`  ${pkg.description}`);
            }
          });
          
          if (results.length > limit) {
            console.log(`\n... and ${results.length - limit} more results`);
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Search failed: ${errorMessage}`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('info')
      .description('Show package details')
      .argument('<package>', 'Package name')
      .option('--json', 'JSON output')
      .action(async (pkg, options) => {
        try {
          const info = await packageManager.info(pkg);
          
          if (!info) {
            console.log(`Package not found: ${pkg}`);
            return;
          }
          
          if (options.json) {
            console.log(JSON.stringify(info, null, 2));
          } else {
            console.log(`${info.name}@${info.version}`);
            if (info.description) {
              console.log(`\n${info.description}`);
            }
            
            if (info.dependencies && Object.keys(info.dependencies).length > 0) {
              console.log('\nDependencies:');
              Object.entries(info.dependencies).forEach(([name, version]) => {
                console.log(`  ${name}: ${version}`);
              });
            }
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error getting package info: ${errorMessage}`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('path')
      .description('Show packages directory')
      .option('-g, --global', 'Show global packages path')
      .option('-h, --handler <name>', 'Show handler packages path')
      .action((options) => {
        const dataDir = configManager.getDataDirectory();
        
        if (options.global) {
          console.log(`${dataDir}/packages/global`);
        } else if (options.handler) {
          console.log(`${dataDir}/packages/handlers/${options.handler}`);
        } else {
          console.log(`${dataDir}/packages`);
        }
      })
  );