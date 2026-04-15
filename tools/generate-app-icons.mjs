import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const sourcePath = join(
  repoRoot,
  'build',
  'branding',
  'convergence-app-logo.png',
)
const buildDir = join(repoRoot, 'build')
const iconPngPath = join(buildDir, 'icon.png')
const iconIcnsPath = join(buildDir, 'icon.icns')
const tempDir = join(buildDir, '.icon-build')
const tempSourcePath = join(tempDir, 'icon-source.png')
const iconsetDir = join(tempDir, 'icon.iconset')

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' })
}

function ensureCommand(command) {
  try {
    execFileSync('/bin/zsh', ['-lc', `command -v ${command}`], {
      stdio: 'ignore',
    })
  } catch {
    throw new Error(`Required command is unavailable: ${command}`)
  }
}

function generateSquareSource() {
  run('magick', [
    sourcePath,
    '-crop',
    '760x520+388+70',
    '+repage',
    '-background',
    'none',
    '-gravity',
    'center',
    '-extent',
    '1024x1024',
    '-strip',
    iconPngPath,
  ])
}

function generateIconset() {
  mkdirSync(iconsetDir, { recursive: true })
  run('cp', [iconPngPath, tempSourcePath])

  const sizes = [16, 32, 128, 256, 512]
  for (const size of sizes) {
    run('magick', [
      tempSourcePath,
      '-resize',
      `${size}x${size}`,
      join(iconsetDir, `icon_${size}x${size}.png`),
    ])
    run('magick', [
      tempSourcePath,
      '-resize',
      `${size * 2}x${size * 2}`,
      join(iconsetDir, `icon_${size}x${size}@2x.png`),
    ])
  }

  run('iconutil', ['-c', 'icns', iconsetDir, '-o', iconIcnsPath])
}

function main() {
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing source artwork: ${sourcePath}`)
  }

  ensureCommand('magick')
  ensureCommand('iconutil')

  mkdirSync(buildDir, { recursive: true })
  rmSync(tempDir, { recursive: true, force: true })
  mkdirSync(tempDir, { recursive: true })

  generateSquareSource()
  generateIconset()

  rmSync(tempDir, { recursive: true, force: true })

  console.log(`Generated ${iconPngPath}`)
  console.log(`Generated ${iconIcnsPath}`)
}

main()
