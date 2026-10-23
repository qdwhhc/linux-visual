const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const { appBuilderPath } = require('app-builder-bin')

const projectRoot = path.resolve(__dirname, '..')
const packageInfo = require(path.join(projectRoot, 'package.json'))
const sourceExecutable = require('electron')
const iconPath = path.join(projectRoot, 'build', 'app-icon.ico')
const productName = packageInfo.build?.productName || packageInfo.name
const executableName = packageInfo.build?.win?.executableName || productName
const companyName = packageInfo.author || productName
const windowsVersion = String(packageInfo.version || '0.0.0').split('.').slice(0, 4).concat(['0', '0', '0', '0']).slice(0, 4).join('.')

function getBrandingStamp() {
  return JSON.stringify({
    sourceModifiedAt: fs.statSync(sourceExecutable).mtimeMs,
    iconModifiedAt: fs.statSync(iconPath).mtimeMs,
    productName,
    executableName,
    companyName,
    version: packageInfo.version
  })
}

function getRuntimeExecutable(expectedStamp) {
  const hash = crypto.createHash('sha1').update(expectedStamp).digest('hex').slice(0, 10)
  return path.join(path.dirname(sourceExecutable), `${executableName}-dev-${hash}.exe`)
}

function hasCurrentBranding(runtimeExecutable, expectedStamp) {
  const brandingStampPath = `${runtimeExecutable}.branding.json`

  try {
    return fs.existsSync(runtimeExecutable) && fs.readFileSync(brandingStampPath, 'utf8') === expectedStamp
  } catch {
    return false
  }
}

const BRANDING_SKIP_TTL_MS = 60 * 60 * 1000

function shouldSkipBranding(runtimeExecutable, expectedStamp) {
  const skipMarkerPath = `${runtimeExecutable}.branding-skip.json`

  try {
    const marker = JSON.parse(fs.readFileSync(skipMarkerPath, 'utf8'))
    return marker.stamp === expectedStamp && Date.now() - Number(marker.at || 0) < BRANDING_SKIP_TTL_MS
  } catch {
    return false
  }
}

function writeBrandingSkipMarker(runtimeExecutable, expectedStamp) {
  try {
    fs.writeFileSync(`${runtimeExecutable}.branding-skip.json`, JSON.stringify({ stamp: expectedStamp, at: Date.now() }))
  } catch {}
}

function prepareBrandedElectronRuntime() {
  if (process.platform !== 'win32') return sourceExecutable
  if (process.env.LINUX_VISUAL_SKIP_DEV_BRANDING === '1') return sourceExecutable

  const expectedStamp = getBrandingStamp()
  const runtimeExecutable = getRuntimeExecutable(expectedStamp)
  const brandingStampPath = `${runtimeExecutable}.branding.json`

  if (hasCurrentBranding(runtimeExecutable, expectedStamp)) return runtimeExecutable
  if (shouldSkipBranding(runtimeExecutable, expectedStamp)) return sourceExecutable

  fs.copyFileSync(sourceExecutable, runtimeExecutable)
  const rceditArgs = [
    runtimeExecutable,
    '--set-version-string', 'FileDescription', productName,
    '--set-version-string', 'ProductName', productName,
    '--set-version-string', 'CompanyName', companyName,
    '--set-version-string', 'InternalName', executableName,
    '--set-version-string', 'OriginalFilename', `${executableName}.exe`,
    '--set-version-string', 'LegalCopyright', `Copyright (c) ${new Date().getFullYear()} ${companyName}`,
    '--set-file-version', windowsVersion,
    '--set-product-version', windowsVersion,
    '--set-icon', iconPath
  ]
  let result = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    result = spawnSync(appBuilderPath, ['rcedit', '--args', JSON.stringify(rceditArgs)], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
      killSignal: 'SIGKILL'
    })
    if (result.status === 0) break
    if (result.error && result.error.code === 'ETIMEDOUT') break
    if (attempt < 3) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 500)
  }

  if (result?.status !== 0) {
    try {
      fs.rmSync(runtimeExecutable, { force: true })
    } catch {}
    const detail = String(result?.stderr || result?.stdout || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).pop()
    console.warn(`[dev] 写入开发运行时图标失败，已降级使用 Electron 默认运行时${detail ? `：${detail}` : ''}`)
    writeBrandingSkipMarker(runtimeExecutable, expectedStamp)
    return sourceExecutable
  }

  fs.writeFileSync(brandingStampPath, expectedStamp)
  return runtimeExecutable
}

module.exports = { prepareBrandedElectronRuntime }
