import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { SessionService } from './session.service'
import { TEST_EXECUTION_HOST_ENDPOINT_ID } from '../execution-host-endpoint/execution-host-endpoint.fixture'
import {
  REMOTE_SPAWN_PLACE_REQUIRED,
  spawnSpecProblem,
} from '../../../src/shared/lib/spawn-spec.pure'

/**
 * Two doors refuse a remote session with no place, and they say one sentence
 * (MAR-2999).
 *
 * `spawnSpecProblem` is the door the composer draft, the recipe normalizer and
 * the YAML reader all ask; `SessionService.create` is the door every caller
 * passes through on the way to the record (MAR-2689). The sentence used to be
 * written out twice, byte for byte, which is two encodings of one fact: reword
 * the copy a user reports and the other half keeps saying the old thing, with
 * nothing to notice it had. These assertions compare the two doors against the
 * same exported constant rather than against a quoted string, so the pin holds
 * whatever the sentence is reworded to -- what it pins is that there is only
 * one of it.
 */
describe('the remote-place refusal is one sentence (MAR-2999)', () => {
  let service: SessionService
  let tempDir: string
  const projectId = 'place-refusal-project'

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-place-refusal-'))
    resetDatabase()
    const db = getDatabase()
    db.prepare(
      'INSERT INTO projects (id, name, repository_path) VALUES (?, ?, ?)',
    ).run(projectId, 'Place Refusal Project', tempDir)
    service = new SessionService(
      db,
      new LocalExecutionHost(new ProviderRegistry()),
    )
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  const createRemoteWithoutPlace = () =>
    service.create({
      projectId,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: null,
      name: 'remote session with nowhere to work',
      executionHost: TEST_EXECUTION_HOST_ENDPOINT_ID,
      workAddress: null,
    })

  it('refuses at the create door with the shared sentence', () => {
    // Mutation: reword the literal back into `requireStatedWorkAddress`
    // instead of importing the constant -- red.
    expect(createRemoteWithoutPlace).toThrow(REMOTE_SPAWN_PLACE_REQUIRED)
  })

  it('refuses at the spec door with the shared sentence', () => {
    // Mutation: reword `REMOTE_SPAWN_PLACE_REQUIRED` -- both this and the
    // create-door assertion above follow it, and a second copy anywhere would
    // no longer follow, which is the divergence this pins.
    expect(
      spawnSpecProblem({
        projectId,
        executionHost: TEST_EXECUTION_HOST_ENDPOINT_ID,
        workAddress: null,
      }),
    ).toBe(REMOTE_SPAWN_PLACE_REQUIRED)
  })

  it('says the identical string at both doors', () => {
    let createDoor: string | null = null
    try {
      createRemoteWithoutPlace()
    } catch (error) {
      createDoor = (error as Error).message
    }
    const specDoor = spawnSpecProblem({
      projectId,
      executionHost: TEST_EXECUTION_HOST_ENDPOINT_ID,
      workAddress: null,
    })

    expect(createDoor).not.toBeNull()
    expect(createDoor).toBe(specDoor)
  })
})
