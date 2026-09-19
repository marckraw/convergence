import { CursorAcpProcessClient } from '../provider/cursor/cursor-acp-client'
import { mapCursorCommandCatalog } from './cursor-skills.mapper.pure'
import { buildProviderSkillErrorCatalog } from './skill-catalog.pure'
import type { ProviderSkillCatalog, SkillCatalogOptions } from './skills.types'

export interface CursorCommandsClient {
  listAvailableCommands: (
    projectPath: string,
    options?: { waitMs?: number },
  ) => Promise<unknown>
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Failed to inspect Cursor commands'
}

export interface CursorSkillsServiceOptions {
  appVersion?: string | null
}

export class CursorSkillsService {
  private client: CursorCommandsClient

  constructor(
    binaryPath: string,
    client?: CursorCommandsClient,
    options: CursorSkillsServiceOptions = {},
  ) {
    this.client =
      client ??
      new CursorAcpProcessClient(binaryPath, {
        appVersion: options.appVersion ?? null,
      })
  }

  async list(
    projectPath: string,
    options: SkillCatalogOptions = {},
  ): Promise<ProviderSkillCatalog> {
    // Cursor discovery always spawns a fresh ACP process; `forceReload` is a
    // no-op here (MAR-3240 R4). Accept the shared SkillCatalogOptions shape so
    // the Skills browser can keep one refresh call site across providers.
    void options.forceReload
    try {
      const payload = await this.client.listAvailableCommands(projectPath)
      return mapCursorCommandCatalog(payload)
    } catch (error) {
      return buildProviderSkillErrorCatalog({
        providerId: 'cursor',
        providerName: 'Cursor',
        catalogSource: 'native-rpc',
        invocationSupport: 'native-command',
        activationConfirmation: 'none',
        error: errorMessage(error),
      })
    }
  }
}
