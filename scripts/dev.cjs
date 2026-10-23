const { spawn } = require('child_process')
const net = require('net')
const path = require('path')
const { candidatePorts } = require('./dev.config.cjs')
const { prepareBrandedElectronRuntime } = require('./electron-runtime.cjs')

const dryRun = process.argv.slice(2).includes('--dry-run')
const preferredPorts = candidatePorts

if (!preferredPorts.length) {
  console.error('[dev] 请先在 scripts/dev.config.cjs 里配置候选端口')
  process.exit(1)
}

function isPortAvailable(port) {
  return new Promise(resolve => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen({ host: '127.0.0.1', port }, () => server.close(() => resolve(true)))
  })
}

async function pickPort() {
  for (const port of preferredPorts) {
    if (await isPortAvailable(port)) return port
  }
  throw new Error(`没有可用端口：${preferredPorts.join(', ')}`)
}

function waitForPort(port, timeoutMs = 30000) {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`等待 Vite 启动超时：${port}`))
          return
        }
        setTimeout(tryConnect, 250)
      })
    }
    tryConnect()
  })
}

function resolveViteBin() {
  const vitePackagePath = require.resolve('vite/package.json')
  const vitePackage = require(vitePackagePath)
  return path.join(path.dirname(vitePackagePath), vitePackage.bin.vite)
}

async function main() {
  const port = await pickPort()
  if (dryRun) {
    console.log(String(port))
    return
  }

  const env = {
    ...process.env,
    APP_DEV_PORT: String(port),
    APP_DEV_URL: `http://127.0.0.1:${port}`,
    LINUX_VISUAL_LOG_DIR: path.resolve(__dirname, '..', 'runtime-logs')
  }
  const viteBin = resolveViteBin()
  const electronBin = prepareBrandedElectronRuntime()
  console.log(`[dev] 候选端口: ${preferredPorts.join(', ')}`)
  console.log(`[dev] 命中端口: ${port}`)
  console.log(`[dev] Vite bin: ${viteBin}`)
  console.log(`[dev] 应用地址: ${env.APP_DEV_URL}`)
  let electronProcess = null
  let shuttingDown = false

  const viteProcess = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: 'inherit',
    env
  })

  const shutdown = code => {
    if (shuttingDown) return
    shuttingDown = true
    if (electronProcess && !electronProcess.killed) electronProcess.kill()
    if (!viteProcess.killed) viteProcess.kill()
    setTimeout(() => process.exit(code), 50)
  }

  viteProcess.once('exit', code => {
    if (!shuttingDown) shutdown(code || 0)
  })

  process.once('SIGINT', () => shutdown(0))
  process.once('SIGTERM', () => shutdown(0))

  await waitForPort(port)
  console.log(`[dev] Vite 已就绪: ${env.APP_DEV_URL}`)

  electronProcess = spawn(electronBin, ['.'], {
    stdio: 'inherit',
    env
  })
  electronProcess.once('exit', code => shutdown(code || 0))
}

main().catch(error => {
  console.error(`[dev] ${error.message}`)
  process.exit(1)
})
