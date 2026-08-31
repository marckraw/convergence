// Generates the two notification chimes used by the in-app sound channel.
// Run once when the chimes need to change; output is committed under
// src/shared/assets/sounds/. Synthesis is deterministic so the bytes are
// stable across machines.
//
// Usage: node tools/generate-notification-sounds.mjs

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SAMPLE_RATE = 44100

function pcmHeader(numSamples) {
  const byteRate = SAMPLE_RATE * 2
  const dataBytes = numSamples * 2
  const buf = Buffer.alloc(44)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(byteRate, 28)
  buf.writeUInt16LE(2, 32) // block align
  buf.writeUInt16LE(16, 34) // bits per sample
  buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)
  return buf
}

function writeWav(path, samples) {
  const header = pcmHeader(samples.length)
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    data.writeInt16LE(Math.round(clamped * 32760), i * 2)
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.concat([header, data]))
}

function softChime() {
  const durationSec = 0.3
  const total = Math.round(SAMPLE_RATE * durationSec)
  const samples = new Float32Array(total)
  const f1 = 880
  const f2 = 1760
  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE
    const env = Math.exp(-t * 6)
    const fundamental = Math.sin(2 * Math.PI * f1 * t)
    const overtone = 0.25 * Math.sin(2 * Math.PI * f2 * t)
    samples[i] = 0.4 * env * (fundamental + overtone)
  }
  return samples
}

function alertChime() {
  const totalSec = 0.4
  const total = Math.round(SAMPLE_RATE * totalSec)
  const splitAt = Math.round(total * 0.45)
  const samples = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE
    const inFirst = i < splitAt
    const localT = inFirst ? t : t - splitAt / SAMPLE_RATE
    const env = Math.exp(-localT * 9)
    const freq = inFirst ? 660 : 990
    const sin = Math.sin(2 * Math.PI * freq * localT)
    const overtone = 0.3 * Math.sin(2 * Math.PI * freq * 2 * localT)
    samples[i] = 0.45 * env * (sin + overtone)
  }
  return samples
}

const root = resolve(fileURLToPath(import.meta.url), '..', '..')
const outDir = resolve(root, 'src/shared/assets/sounds')

writeWav(resolve(outDir, 'chime-soft.wav'), softChime())
writeWav(resolve(outDir, 'chime-alert.wav'), alertChime())

console.log(`wrote ${outDir}/chime-soft.wav`)
console.log(`wrote ${outDir}/chime-alert.wav`)
