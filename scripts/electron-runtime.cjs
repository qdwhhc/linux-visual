const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const projectRoot = path.resolve(__dirname, '..')
const packageInfo = require(path.join(projectRoot, 'package.json'))
const sourceExecutable = require('electron')
const iconPath = path.join(projectRoot, 'build', 'app-icon.ico')
const productName = packageInfo.build?.productName || packageInfo.name
const executableName = packageInfo.build?.win?.executableName || productName
const companyName = packageInfo.author || productName
const windowsVersion = String(packageInfo.version || '0.0.0').split('.').slice(0, 4).concat(['0', '0', '0', '0']).slice(0, 4).join('.')

const ICON_LANG = 1033
const ICON_GROUP_ID = 1
const VERSION_LANG = 1033
const VERSION_CODEPAGE = 1200

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

function applyBranding(executablePath) {
  const ResEdit = require('resedit')
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(executablePath), { ignoreCert: true })
  const resource = ResEdit.NtExecutableResource.from(exe)

  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath))
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resource.entries,
    ICON_GROUP_ID,
    ICON_LANG,
    iconFile.icons.map((item) => item.data)
  )

  const versionInfos = ResEdit.Resource.VersionInfo.fromEntries(resource.entries)
  const versionInfo = versionInfos[0] || ResEdit.Resource.VersionInfo.createEmpty()
  versionInfo.setFileVersion(windowsVersion, VERSION_LANG)
  versionInfo.setProductVersion(windowsVersion, VERSION_LANG)
  versionInfo.setStringValues({ lang: VERSION_LANG, codepage: VERSION_CODEPAGE }, {
    FileDescription: productName,
    ProductName: productName,
    CompanyName: companyName,
    InternalName: executableName,
    OriginalFilename: `${executableName}.exe`,
    LegalCopyright: `Copyright (c) ${new Date().getFullYear()} ${companyName}`
  })
  versionInfo.outputToResourceEntries(resource.entries)

  resource.outputResource(exe)
  fs.writeFileSync(executablePath, Buffer.from(exe.generate()))
}

function prepareBrandedElectronRuntime() {
  if (process.platform !== 'win32') return sourceExecutable
  if (process.env.LINUX_VISUAL_SKIP_DEV_BRANDING === '1') return sourceExecutable

  const expectedStamp = getBrandingStamp()
  const runtimeExecutable = getRuntimeExecutable(expectedStamp)
  const brandingStampPath = `${runtimeExecutable}.branding.json`

  if (hasCurrentBranding(runtimeExecutable, expectedStamp)) return runtimeExecutable
  if (shouldSkipBranding(runtimeExecutable, expectedStamp)) return sourceExecutable

  try {
    fs.copyFileSync(sourceExecutable, runtimeExecutable)
    applyBranding(runtimeExecutable)
    fs.writeFileSync(brandingStampPath, expectedStamp)
    return runtimeExecutable
  } catch (error) {
    try {
      fs.rmSync(runtimeExecutable, { force: true })
    } catch {}
    console.warn(`[dev] 写入开发运行时图标失败，已降级使用 Electron 默认运行时${error?.message ? `：${error.message}` : ''}`)
    writeBrandingSkipMarker(runtimeExecutable, expectedStamp)
    return sourceExecutable
  }
}

module.exports = { prepareBrandedElectronRuntime }
