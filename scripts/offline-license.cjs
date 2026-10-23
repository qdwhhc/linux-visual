const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const productId = 'linux-visual-desktop'
const activationPrivateKeyPath = process.env.LINUX_VISUAL_ACTIVATION_PRIVATE_KEY || path.join(projectRoot, 'license-tools', 'keys', 'activation-private.pem')
const devicePrivateKeyPath = process.env.LINUX_VISUAL_DEVICE_PRIVATE_KEY || path.join(projectRoot, 'license-tools', 'keys', 'device-private.pem')

function getArgument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : ''
}

function requireArgument(name) {
  const value = getArgument(name)
  if (!value) throw new Error(`缺少参数 --${name}`)
  return value
}

function parseExpiresAt(value) {
  if (!value) return 0
  const numeric = Number(value)
  const parsed = Number.isFinite(numeric) && numeric > 0 ? numeric : new Date(value).getTime()
  if (!Number.isFinite(parsed) || parsed <= Date.now()) throw new Error('有效期必须是未来的时间戳或日期')
  return parsed
}

function issueActivationCode() {
  const deviceId = requireArgument('device')
  const payload = {
    v: 1,
    licenseId: getArgument('license-id') || crypto.randomUUID(),
    product: productId,
    edition: 'full',
    deviceId,
    issuedAt: Date.now(),
    expiresAt: parseExpiresAt(getArgument('expires-at'))
  }
  const payloadText = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signingInput = `LV1.${payloadText}`
  const privateKey = fs.readFileSync(activationPrivateKeyPath, 'utf8')
  const signature = crypto.sign(
    'sha256',
    Buffer.from(signingInput, 'utf8'),
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32
    }
  )
  process.stdout.write(`${signingInput}.${signature.toString('base64url')}\n`)
}

function decryptDevicePayload() {
  const encrypted = requireArgument('value')
  const privateKey = fs.readFileSync(devicePrivateKeyPath, 'utf8')
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    Buffer.from(encrypted, 'base64url')
  )
  process.stdout.write(`${JSON.stringify(JSON.parse(decrypted.toString('utf8')), null, 2)}\n`)
}

function printHelp() {
  process.stdout.write([
    '生成激活码:',
    '  node scripts/offline-license.cjs issue --device <设备号> [--expires-at <日期或毫秒时间戳>] [--license-id <订单号>]',
    '',
    '解密购买链接中的设备参数:',
    '  node scripts/offline-license.cjs decrypt-device --value <device参数>'
  ].join('\n'))
}

try {
  const command = String(process.argv[2] || '')
  if (command === 'issue') issueActivationCode()
  else if (command === 'decrypt-device') decryptDevicePayload()
  else printHelp()
} catch (error) {
  console.error(error.message || error)
  process.exit(1)
}
