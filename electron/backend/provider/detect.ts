import { execFile } from 'child_process'

function which(binary: string): Promise<string | null> {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  return new Promise((resolve) => {
    execFile(cmd, [binary], (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null)
      } else {
        resolve(stdout.trim().split('\n')[0])
      }
    })
  })
}

export interface DetectedProvider {
  id: string
  name: string
  binaryPath: string
}

export async function detectProviders(): Promise<DetectedProvider[]> {
  const detected: DetectedProvider[] = []

  const claudePath = await which('claude')
  if (claudePath) {
    detected.push({
      id: 'claude-code',
      name: 'Claude Code',
      binaryPath: claudePath,
    })
  }

  const codexPath = await which('codex')
  if (codexPath) {
    detected.push({
      id: 'codex',
      name: 'Codex',
      binaryPath: codexPath,
    })
  }

  return detected
}
