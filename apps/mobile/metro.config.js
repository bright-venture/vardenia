// Monorepo-aware Metro config: without this, Metro cannot resolve the
// workspace packages that live outside apps/mobile.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
// Stops two copies of React being bundled when a workspace package hoists one.
config.resolver.disableHierarchicalLookup = true

module.exports = config
