import assert from 'node:assert/strict'
import { readdir, realpath, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve, sep } from 'node:path'

const within = (path, root) => path === root || path.startsWith(`${root}${sep}`)

async function existingPath(path) {
  try {
    return await realpath(path)
  } catch (error) {
    if (error.code === 'ENOENT') return resolve(path)
    throw error
  }
}

async function entries(path) {
  try {
    return await readdir(path)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

/** Reject real user homes before any account server or credential read starts. */
export async function assertCanaryProfileIsolation({
  profiles,
  userHome,
  codexHome,
}) {
  const root = await realpath(profiles)
  const enrolledRoot = join(userHome, '.convergence', 'provider-accounts')
  const protectedPaths = [join(userHome, '.codex'), enrolledRoot]
  if (codexHome) protectedPaths.push(codexHome)
  // Account directories may themselves be symlinks outside the enrollment root.
  for (const provider of await entries(enrolledRoot)) {
    const providerRoot = join(enrolledRoot, provider)
    for (const account of await entries(providerRoot)) {
      protectedPaths.push(join(providerRoot, account))
    }
  }
  const protectedRoots = await Promise.all(protectedPaths.map(existingPath))
  const assertNotProtected = (path) => {
    assert(
      !protectedRoots.some((protectedRoot) => within(path, protectedRoot)),
      'Canary refuses ambient or enrolled account storage',
    )
  }
  assertNotProtected(root)
  const homes = await Promise.all(
    ['account-a', 'account-b'].map((name) => realpath(join(root, name))),
  )
  assert.notEqual(
    homes[0],
    homes[1],
    'Canary accounts must have different homes',
  )
  const sessions = []
  for (const home of homes) {
    assertNotProtected(home)
    assert(
      within(home, root) && home !== root,
      'Canary account home must stay inside the test profiles root',
    )
    for (const name of ['auth.json', 'config.toml']) {
      const file = await realpath(join(home, name))
      assertNotProtected(file)
      assert(
        within(file, home),
        `Canary ${name} must stay inside its test account home`,
      )
    }
    const shared = []
    for (const name of [
      'sessions',
      'archived_sessions',
      'thread-writer-locks',
    ]) {
      const sharedRoot = await realpath(join(home, name))
      assertNotProtected(sharedRoot)
      assert(
        within(sharedRoot, root) &&
          !homes.some((accountHome) => within(sharedRoot, accountHome)),
        'Canary history and locks must use a third directory inside the test profiles root',
      )
      shared.push(sharedRoot)
    }
    sessions.push(shared)
  }
  assert.deepEqual(
    sessions[0],
    sessions[1],
    'Test homes must share their isolated conversation storage and writer locks',
  )
  return homes
}

export function assertExpectedCanaryAccounts(expected) {
  assert(
    expected.length === 2 &&
      expected.every(
        (value) => typeof value === 'string' && /^[a-f0-9]{16}$/.test(value),
      ),
    'CVG_CANARY_ACCOUNT_A and CVG_CANARY_ACCOUNT_B must be the expected account_id SHA-256 fingerprints (first 16 hex characters)',
  )
  assert.notEqual(
    expected[0],
    expected[1],
    'Canary requires two distinct expected accounts',
  )
}

/** Check the declared accounts before the CLI has any chance to refresh them. */
export async function assertCanaryAccountIdentities(homes, expected) {
  assertExpectedCanaryAccounts(expected)
  for (const [index, home] of homes.entries()) {
    const stored = await readFile(join(home, 'auth.json'), 'utf8')
    let auth
    try {
      auth = JSON.parse(stored)
    } catch {
      throw new Error('Test account credential file is not valid JSON')
    }
    assert.equal(
      typeof auth?.tokens?.account_id,
      'string',
      'Test account has no account_id',
    )
    const fingerprint = createHash('sha256')
      .update(auth.tokens.account_id)
      .digest('hex')
      .slice(0, 16)
    assert.equal(
      fingerprint,
      expected[index],
      'Test account does not match its expected fingerprint; no server may start',
    )
  }
}
