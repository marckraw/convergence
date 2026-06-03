import { CursorAcpProcessClient } from '../provider/cursor/cursor-acp-client'
import { mapCursorCommandCatalog } from './cursor-skills.mapper.pure'
import { buildProviderSkillErrorCatalog } from './skill-catalog.pure'
import type { ProviderSkillCatalog, SkillCatalogOptions } from './skills.types'

export interface CursorCommandsClient {
  listAvailableCommands: (
    projectPath: string,
    options?: SkillCatalogOptions,
  ) => Promise<unknown>
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Failed to inspect Cursor commands'
}

export class CursorSkillsService {
  private client: CursorCommandsClient

  constructor(binaryPath: string, client?: CursorCommandsClient) {
    this.client = client ?? new CursorAcpProcessClient(binaryPath)
  }

  async list(
    projectPath: string,
    options: SkillCatalogOptions = {},
  ): Promise<ProviderSkillCatalog> {
    try {
      const payload = await this.client.listAvailableCommands(
        projectPath,
        options,
      )
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
