// Metro config: consume @mango/shared from source (packages/shared/src) without
// adding apps/mobile to the root npm workspace.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../../packages/shared');
const sharedEntry = path.join(sharedRoot, 'src/index.ts');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];
// Prefer this app's node_modules (the monorepo root hoists the web app's React).
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@mango/shared') {
    return { type: 'sourceFile', filePath: sharedEntry };
  }
  return upstreamResolve ? upstreamResolve(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
