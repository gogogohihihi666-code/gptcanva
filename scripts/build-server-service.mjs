import fs from 'node:fs/promises'
import path from 'node:path'
import { build as buildWithEsbuild } from 'esbuild'

const rootDir = process.cwd()
const outputDir = path.resolve(rootDir, 'dist-service')
const serverOutputDir = path.resolve(outputDir, 'server')
const serverEntryPath = path.resolve(rootDir, 'server/index.ts')
const prismaSourceDir = path.resolve(rootDir, 'prisma')
const prismaConfigSourcePath = path.resolve(rootDir, 'prisma.config.ts')
const startScriptSourcePath = path.resolve(rootDir, 'scripts/start-production.mjs')
const startScriptPath = path.resolve(outputDir, 'start-production.mjs')
const packageJsonPath = path.resolve(outputDir, 'package.json')

const RUNTIME_DEPENDENCY_NAMES = [
  '@aws-sdk/client-s3',
  '@prisma/adapter-mariadb',
  '@prisma/client',
  'ioredis',
  'prisma',
]

const readRootPackageJson = async () => JSON.parse(await fs.readFile(path.resolve(rootDir, 'package.json'), 'utf8'))

const pickRuntimeDependencies = (packageJson) => {
  const dependencies = packageJson.dependencies || {}
  const devDependencies = packageJson.devDependencies || {}

  return RUNTIME_DEPENDENCY_NAMES.reduce((result, dependencyName) => {
    const version = dependencies[dependencyName] || devDependencies[dependencyName]
    if (!version) {
      throw new Error(`Missing runtime dependency declaration: ${dependencyName}`)
    }
    result[dependencyName] = version
    return result
  }, {})
}

const createServicePackageJson = packageJson => ({
  name: `${packageJson.name}-server-service`,
  private: true,
  version: packageJson.version,
  description: 'OKWook standalone server service package',
  type: 'module',
  engines: packageJson.engines,
  scripts: {
    start: 'node start-production.mjs',
    'start:server': 'node server/index.js',
    'prisma:migrate:deploy': 'prisma migrate deploy',
  },
  dependencies: pickRuntimeDependencies(packageJson),
})

const build = async () => {
  const packageJson = await readRootPackageJson()
  await fs.rm(outputDir, { recursive: true, force: true })
  await fs.mkdir(serverOutputDir, { recursive: true })

  await buildWithEsbuild({
    entryPoints: [serverEntryPath],
    outfile: path.resolve(serverOutputDir, 'index.js'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    packages: 'external',
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'info',
  })

  await fs.cp(prismaSourceDir, path.resolve(outputDir, 'prisma'), { recursive: true })
  await fs.copyFile(prismaConfigSourcePath, path.resolve(outputDir, 'prisma.config.ts'))
  await fs.copyFile(startScriptSourcePath, startScriptPath)
  await fs.writeFile(packageJsonPath, `${JSON.stringify(createServicePackageJson(packageJson), null, 2)}\n`, 'utf8')
  console.log('[build-server-service] server runtime package created')
}

build().catch((error) => {
  console.error('[build-server-service] build failed', error instanceof Error ? error.message : 'unknown error')
  process.exit(1)
})
