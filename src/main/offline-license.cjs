const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const LICENSE_VERSION = 1
const LICENSE_PREFIX = 'LV1'
const PRODUCT_CODE = 'desktop'
const PRODUCT_ID = 'linux-visual-desktop'
const PURCHASE_PAGE_URL = `https://qdwh.site/authorization?productCode=${PRODUCT_CODE}`
const PURCHASE_DEVICE_PARAM = 'device'
const WECHAT_PAY_APP_ID = String(process.env.LINUX_VISUAL_WECHAT_PAY_APP_ID || '').trim()
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

const activationPublicKey = fs.readFileSync(path.join(__dirname, 'license-keys', 'activation-public.pem'), 'utf8')
const devicePublicKey = fs.readFileSync(path.join(__dirname, 'license-keys', 'device-public.pem'), 'utf8')

function decodeBase64Url(value) {
  const text = String(value || '')
  if (!text || !/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('Invalid Base64URL')
  const decoded = Buffer.from(text, 'base64url')
  if (decoded.toString('base64url') !== text) throw new Error('Non-canonical Base64URL')
  return decoded
}

function decodeBase64UrlJson(value) {
  return JSON.parse(decodeBase64Url(value).toString('utf8'))
}

function verifyActivationCode(code, deviceId, now = Date.now()) {
  try {
    const normalizedCode = String(code || '').replace(/\s+/g, '')
    const parts = normalizedCode.split('.')
    if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) {
      return { ok: false, error: '激活码格式无效' }
    }

    const signingInput = `${parts[0]}.${parts[1]}`
    const signature = decodeBase64Url(parts[2])
    const signatureValid = crypto.verify(
      'sha256',
      Buffer.from(signingInput, 'utf8'),
      {
        key: activationPublicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 32
      },
      signature
    )
    if (!signatureValid) return { ok: false, error: '激活码签名无效' }

    const payload = decodeBase64UrlJson(parts[1])
    if (Number(payload.v) !== LICENSE_VERSION || String(payload.product || '') !== PRODUCT_ID) {
      return { ok: false, error: '激活码不适用于当前产品' }
    }
    if (String(payload.deviceId || '') !== String(deviceId || '')) {
      return { ok: false, error: '激活码与当前设备不匹配' }
    }
    const issuedAt = Number(payload.issuedAt || 0)
    const expiresAt = Number(payload.expiresAt || 0)
    if (!issuedAt || issuedAt > now + MAX_CLOCK_SKEW_MS) {
      return { ok: false, error: '激活码签发时间无效' }
    }
    if (expiresAt && expiresAt <= now) return { ok: false, error: '激活码已过期' }
    if (String(payload.edition || '') !== 'full') return { ok: false, error: '激活码版本无效' }

    return {
      ok: true,
      code: normalizedCode,
      license: {
        version: LICENSE_VERSION,
        licenseId: String(payload.licenseId || ''),
        product: PRODUCT_ID,
        edition: 'full',
        deviceId: String(payload.deviceId),
        issuedAt,
        expiresAt
      }
    }
  } catch {
    return { ok: false, error: '激活码内容无法解析' }
  }
}

function createPurchaseUrl(deviceId) {
  return PURCHASE_PAGE_URL
}

module.exports = {
  PRODUCT_CODE,
  PRODUCT_ID,
  PURCHASE_PAGE_URL,
  PURCHASE_DEVICE_PARAM,
  WECHAT_PAY_APP_ID,
  createPurchaseUrl,
  verifyActivationCode
}
