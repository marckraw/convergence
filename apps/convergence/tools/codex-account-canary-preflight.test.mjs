import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import {
  assertCanaryProfileIsolation,
  assertExpectedCanaryAccounts,
  assertCanaryAccountIdentities,
} from './codex-account-canary-preflight.mjs'

let root, userHome, profiles
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'canary-isolation-test-'))
  userHome = join(root, 'user')
  profiles = join(userHome, 'profiles')
  await mkdir(join(userHome, '.codex'), { recursive: true })
  await mkdir(join(profiles, 'shared', 'sessions'), { recursive: true })
  for (const name of ['account-a', 'account-b']) {
    const home = join(profiles, name)
    await mkdir(home)
    await writeFile(join(home, 'auth.json'), '{}')
    await writeFile(join(home, 'config.toml'), '')
    await symlink(join(profiles, 'shared', 'sessions'), join(home, 'sessions'))
  }
})
afterEach(async () => rm(root, { recursive: true, force: true }))

test('accepts two contained profiles with their own shared test history', async () => {
  const homes = await assertCanaryProfileIsolation({ profiles, userHome })
  assert.equal(homes.length, 2)
})

test('refuses a profile symlink to the ambient home', async () => {
  await rm(join(profiles, 'account-a'), { recursive: true })
  await symlink(join(userHome, '.codex'), join(profiles, 'account-a'))
  await assert.rejects(
    assertCanaryProfileIsolation({ profiles, userHome }),
    /ambient or enrolled/,
  )
})

test('refuses an enrolled home even when its enrollment path is a symlink', async () => {
  const enrolledRoot = join(
    userHome,
    '.convergence',
    'provider-accounts',
    'codex',
  )
  await mkdir(enrolledRoot, { recursive: true })
  await symlink(join(profiles, 'account-a'), join(enrolledRoot, 'real-account'))
  await assert.rejects(
    assertCanaryProfileIsolation({ profiles, userHome }),
    /ambient or enrolled/,
  )
})

test('refuses custom ambient CODEX_HOME', async () => {
  await assert.rejects(
    assertCanaryProfileIsolation({
      profiles,
      userHome,
      codexHome: join(profiles, 'account-a'),
    }),
    /ambient or enrolled/,
  )
})

test('refuses a credential symlink into the ambient home', async () => {
  await writeFile(join(userHome, '.codex', 'auth.json'), '{}')
  await rm(join(profiles, 'account-a', 'auth.json'))
  await symlink(
    join(userHome, '.codex', 'auth.json'),
    join(profiles, 'account-a', 'auth.json'),
  )
  await assert.rejects(
    assertCanaryProfileIsolation({ profiles, userHome }),
    /ambient or enrolled/,
  )
})

test('refuses history symlinked into the ambient home', async () => {
  await mkdir(join(userHome, '.codex', 'sessions'))
  await rm(join(profiles, 'account-a', 'sessions'))
  await symlink(
    join(userHome, '.codex', 'sessions'),
    join(profiles, 'account-a', 'sessions'),
  )
  await assert.rejects(
    assertCanaryProfileIsolation({ profiles, userHome }),
    /ambient or enrolled/,
  )
})

test('requires two explicit different account fingerprints', () => {
  assert.throws(
    () => assertExpectedCanaryAccounts([undefined, undefined]),
    /expected account_id/,
  )
  assert.throws(
    () =>
      assertExpectedCanaryAccounts(['aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa']),
    /distinct/,
  )
  assert.doesNotThrow(() =>
    assertExpectedCanaryAccounts(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']),
  )
})

test('checks the expected account identities from disk before a server can start', async () => {
  const homes = [join(profiles, 'account-a'), join(profiles, 'account-b')]
  const ids = ['synthetic-a', 'synthetic-b']
  for (const [index, home] of homes.entries()) {
    await writeFile(
      join(home, 'auth.json'),
      JSON.stringify({ tokens: { account_id: ids[index] } }),
    )
  }
  const expected = ids.map((id) =>
    createHash('sha256').update(id).digest('hex').slice(0, 16),
  )
  await assertCanaryAccountIdentities(homes, expected)
  await assert.rejects(
    assertCanaryAccountIdentities(homes, [expected[1], expected[0]]),
    /expected fingerprint/,
  )
})

test('does not echo malformed credential contents in its error', async () => {
  const home = join(profiles, 'account-a')
  await writeFile(join(home, 'auth.json'), 'private-synthetic-credential')
  await assert.rejects(
    assertCanaryAccountIdentities(
      [home],
      ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'],
    ),
    { message: 'Test account credential file is not valid JSON' },
  )
})
