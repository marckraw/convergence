import { describe, expect, it } from 'vitest'
import {
  compareCursorVersions,
  parseCursorLatestVersion,
} from './cursor-latest-version.pure'

// Exact public download assignment captured from cursor.com/install on 2026-09-20.
const sample =
  'DOWNLOAD_URL="https://downloads.cursor.com/lab/2026.09.18-9a7762b/${OS}/${ARCH}/agent-cli-package.tar.gz"'

describe('parseCursorLatestVersion', () => {
  it('reads the measured installer assignment', () => {
    expect(parseCursorLatestVersion(sample)).toBe('2026.09.18-9a7762b')
    expect(parseCursorLatestVersion(`#!/usr/bin/env bash\n${sample}\r\n`)).toBe(
      '2026.09.18-9a7762b',
    )
  })

  it.each([
    '',
    'garbage',
    '# old release 2026.06.03-0bbb28e',
    `# ${sample}`,
    `echo '${sample}'`,
    sample.replace('downloads.cursor.com', 'example.com'),
    sample.replace('2026.09.18', '2026.02.30'),
    `${sample}\n${sample}`,
  ])('rejects unrecognized or ambiguous text: %s', (text) => {
    expect(parseCursorLatestVersion(text)).toBeNull()
  })
})

describe('compareCursorVersions', () => {
  it('orders dates numerically, independently of hashes and zero padding', () => {
    expect(
      compareCursorVersions('2026.06.03-fffffff', '2026.07.11-aaaaaaa'),
    ).toBeLessThan(0)
    expect(
      compareCursorVersions('2026.10.01-aaaaaaa', '2026.9.30-fffffff'),
    ).toBeGreaterThan(0)
    expect(
      compareCursorVersions('2026.9.30-fffffff', '2026.10.01-aaaaaaa'),
    ).toBeLessThan(0)
    expect(
      compareCursorVersions('2026.09.18-9a7762b', '2026.9.18-9a7762b'),
    ).toBe(0)
    expect(
      compareCursorVersions('2026.09.18-aaaaaaa', '2026.09.18-bbbbbbb'),
    ).toBeNull()
  })

  it.each([
    'garbage',
    '2026.13.01-abc1234',
    '2026.02.29-abc1234',
    '2026.04.31-abc1234',
    '2026.00.01-abc1234',
    '2026.01.00-abc1234',
    '2026.09.18',
    '2026.09.18-xyz',
    '2026.09.18-abc1234-extra',
  ])('cannot order malformed versions: %s', (value) => {
    expect(compareCursorVersions(value, '2026.09.18-9a7762b')).toBeNull()
    expect(compareCursorVersions('2026.09.18-9a7762b', value)).toBeNull()
  })

  it('accepts valid leap days', () => {
    expect(
      compareCursorVersions('2024.02.29-abc1234', '2024.03.01-abc1234'),
    ).toBeLessThan(0)
  })
})
