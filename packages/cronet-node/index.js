/* tslint:disable */
/* eslint-disable */

const { existsSync, readFileSync } = require('fs')
const { join } = require('path')

const { platform, arch } = process

let nativeBinding = null
let loadError = null

function isMusl() {
  if (!process.report || typeof process.report.getReport !== 'function') {
    try {
      const lddPath = require('child_process').execSync('which ldd').toString().trim()
      return readFileSync(lddPath, 'utf8').includes('musl')
    } catch (e) {
      return true
    }
  } else {
    const { glibcVersionRuntime } = process.report.getReport().header
    return !glibcVersionRuntime
  }
}

const platforms = {
  'darwin-arm64': {
    file: 'cronet-node.darwin-arm64.node',
    package: '@aspect-build/cronet-fetch-darwin-arm64',
  },
  'darwin-x64': {
    file: 'cronet-node.darwin-x64.node',
    package: '@aspect-build/cronet-fetch-darwin-x64',
  },
  'linux-x64-gnu': {
    file: 'cronet-node.linux-x64-gnu.node',
    package: '@aspect-build/cronet-fetch-linux-x64-gnu',
  },
}

function getPlatformKey() {
  switch (platform) {
    case 'darwin':
      switch (arch) {
        case 'arm64': return 'darwin-arm64'
        case 'x64': return 'darwin-x64'
        default: throw new Error(`Unsupported architecture on macOS: ${arch}`)
      }
    case 'linux':
      switch (arch) {
        case 'x64':
          if (isMusl()) throw new Error('musl libc is not supported')
          return 'linux-x64-gnu'
        default: throw new Error(`Unsupported architecture on Linux: ${arch}`)
      }
    default:
      throw new Error(`Unsupported OS: ${platform}, architecture: ${arch}`)
  }
}

const key = getPlatformKey()
const { file, package: pkg } = platforms[key]

// Resolution order:
// 1. Local file next to this loader (dev build)
// 2. Sibling platform package directory (git/monorepo install)
// 3. npm-installed platform package (@aspect-build/cronet-fetch-*)
const localPath = join(__dirname, file)
const siblingPath = join(__dirname, '..', `cronet-fetch-${key}`, file)

if (existsSync(localPath)) {
  try {
    nativeBinding = require(localPath)
  } catch (e) {
    loadError = e
  }
} else if (existsSync(siblingPath)) {
  try {
    nativeBinding = require(siblingPath)
  } catch (e) {
    loadError = e
  }
} else {
  try {
    nativeBinding = require(pkg)
  } catch (e) {
    loadError = e
  }
}

if (!nativeBinding) {
  if (loadError) {
    throw loadError
  }
  throw new Error(`Failed to load native binding for ${platform}-${arch}`)
}

const { initEngine, executeRequest, executeStreamingRequest } = nativeBinding

module.exports.initEngine = initEngine
module.exports.executeRequest = executeRequest
module.exports.executeStreamingRequest = executeStreamingRequest
