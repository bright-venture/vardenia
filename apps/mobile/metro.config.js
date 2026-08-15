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

// `disableHierarchicalLookup = true` used to sit here, to stop two copies of
// React being bundled when a workspace package hoisted its own. Removed on the
// SDK 57 upgrade for two reasons: expo-doctor flags it as an override that
// fights the defaults, and the situation it worked around is gone now that the
// whole monorepo is on React 19. Verified by bundling and counting - see the
// note on the .npmrc.

module.exports = config
