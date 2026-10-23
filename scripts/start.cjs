const { spawn } = require('child_process')
const { prepareBrandedElectronRuntime } = require('./electron-runtime.cjs')

const electronExecutable = prepareBrandedElectronRuntime()
const electronProcess = spawn(electronExecutable, ['.'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env
})

electronProcess.once('exit', code => process.exit(code || 0))
