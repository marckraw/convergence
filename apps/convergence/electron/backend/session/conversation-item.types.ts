import type { TranscriptEntry } from '../provider/provider.types'
import type { SkillSelection } from '../skills/skills.types'
import type { SessionSummary } from './session.types'
import type { Turn, TurnFileChange } from './turn/turn.types'
import type { HarnessEvidence } from './harness-evidence.types'

export type ConversationItemKind =
  | 'message'
  | 'thinking'
  | 'tool-call'
  | 'tool-result'
  | 'approval-request'
  | 'input-request'
  | 'note'

export type ConversationItemState = 'streaming' | 'complete' | 'error'

/**
 * Why a tool result's image is not shown under it (MAR-4274). The first six
 * are the execution-host protocol's fixed codes (protocol 0.23), which a host
 * counts for the images it left out; a local Claude run counts its own under
 * the same names. `download-failed` is Convergence's: the host kept the image,
 * and fetching it from there did not work.
 */
export const TOOL_ATTACHMENT_OMISSION_CODES = [
  'unsupported-mime-type',
  'invalid-image',
  'image-too-large',
  'turn-limit',
  'session-limit',
  'storage-failed',
  'download-failed',
] as const

export type ToolAttachmentOmissionCode =
  (typeof TOOL_ATTACHMENT_OMISSION_CODES)[number]

/** How many of a tool result's images were left out, by reason. */
export type ToolAttachmentOmissions = Partial<
  Record<ToolAttachmentOmissionCode, number>
>

/**
 * One image a tool result produced, as bytes on their way into the attachment
 * store. Only the `conversation.item.toolImages` delta carries these; the item
 * keeps the store's ids.
 */
export interface ToolImageBytes {
  name: string
  mimeType: string
  bytes: Uint8Array
}

export interface InteractionChoiceOption {
  label: string
  description?: string
  preview?: string
}

export interface InteractionQuestion {
  id: string
  question: string
  header: string
  options: InteractionChoiceOption[]
  multiSelect: boolean
}

export type InteractionFormFieldType = 'string' | 'number' | 'boolean'

export interface InteractionFormField {
  id: string
  label: string
  description?: string
  type: InteractionFormFieldType
  required: boolean
  defaultValue?: string | number | boolean
  multiline?: boolean
}

export type InteractionRequest =
  | {
      kind: 'text'
      prompt: string
    }
  | {
      kind: 'choice'
      questions: InteractionQuestion[]
    }
  | {
      kind: 'plan'
      plan: string
      planPath?: string
      allowedPrompts?: string[]
    }
  | {
      kind: 'form'
      title: string
      message: string
      fields: InteractionFormField[]
    }
  | {
      kind: 'url'
      title: string
      message: string
      url: string
    }

export interface InteractionChoiceResponse {
  providerItemId?: string
  kind: 'choice'
  answers: Array<{
    questionId: string
    values: string[]
  }>
}

export interface InteractionPlanResponse {
  providerItemId?: string
  kind: 'plan'
  decision: 'approve' | 'reject'
  message?: string
}

export interface InteractionFormResponse {
  providerItemId?: string
  kind: 'form'
  action: 'accept' | 'decline'
  values: Record<string, string | number | boolean>
}

export interface InteractionUrlResponse {
  providerItemId?: string
  kind: 'url'
  action: 'accept' | 'decline'
}

export type InteractionResponse =
  | InteractionChoiceResponse
  | InteractionPlanResponse
  | InteractionFormResponse
  | InteractionUrlResponse

export interface ConversationItemBase {
  agentAttribution?: { description: string | null; agentType: string | null }
  id: string
  sessionId: string
  sequence: number
  turnId: string | null
  agentRunId?: string | null
  taskId?: string | null
  kind: ConversationItemKind
  state: ConversationItemState
  createdAt: string
  updatedAt: string
  providerMeta: {
    providerId: string
    providerItemId: string | null
    providerEventType: string | null
  }
}

export type ConversationItem =
  | (ConversationItemBase & {
      kind: 'message'
      actor: 'user' | 'assistant'
      text: string
      attachmentIds?: string[]
      skillSelections?: SkillSelection[]
      deliveryMode?: 'steer' | 'follow-up'
    })
  | (ConversationItemBase & {
      kind: 'thinking'
      actor: 'assistant'
      text: string
    })
  | (ConversationItemBase & {
      kind: 'tool-call'
      toolName: string
      inputText: string
    })
  | (ConversationItemBase & {
      kind: 'tool-result'
      toolName: string | null
      relatedItemId: string | null
      outputText: string
      /** The images the tool produced, as attachment-store ids (MAR-4274). */
      attachmentIds?: string[]
      /** The images it produced that are not shown, counted by reason. */
      attachmentOmissions?: ToolAttachmentOmissions
    })
  | (ConversationItemBase & {
      kind: 'approval-request'
      resolution?: 'pending' | 'approved' | 'denied'
      description: string
      permissionDetails?: { blockedPath?: string; decisionReason?: string }
      supportsSessionApproval?: boolean
    })
  | (ConversationItemBase & {
      kind: 'input-request'
      responseProviderItemId?: string
      resolution?: 'pending' | 'approved' | 'denied'
      prompt: string
      request?: InteractionRequest
    })
  | (ConversationItemBase & {
      kind: 'note'
      level: 'info' | 'warning' | 'error'
      text: string
      /**
       * Something the user can do about this note, if there is one. Kept as
       * data rather than as prose in `text`, so the surface renders a real
       * control instead of asking the user to go and find it (ADR 0007, PA11).
       */
      action?: ConversationNoteAction
    })

/**
 * Actions a note can offer.
 *
 * A union of one today. The shape exists so the next actionable note does not
 * have to reinvent the plumbing, and so the renderer can refuse to render an
 * action it does not understand rather than guessing.
 */
export type ConversationNoteAction = {
  kind: 'authorize-mcp-server'
  serverName: string
  /** The account the turn ran as; null is the ambient default. */
  providerAccountId: string | null
}

export type ConversationItemDraft = ConversationItem extends infer T
  ? T extends unknown
    ? Omit<T, 'sessionId' | 'sequence'>
    : never
  : never

export type SessionDelta =
  | {
      kind: 'harness.evidence'
      evidence: HarnessEvidence
      /**
       * The execution-host event sequence this evidence came from, when it
       * came from one. As on `session.patch`: it lets the record commit the
       * evidence and the stream cursor in one transaction, so a crash between
       * the two cannot leave the envelope applied and still owed (MAR-4293).
       * Local adapters leave it unset.
       */
      executionHostSeq?: number
    }
  | {
      kind: 'session.patch'
      patch: Partial<
        Pick<
          SessionSummary,
          | 'status'
          | 'attention'
          | 'activity'
          | 'contextWindow'
          | 'continuationToken'
          | 'updatedAt'
        >
      > & {
        /** Ephemeral refresh hint, never a persisted session field. */
        prUrl?: string | null
        /** Who opened this local provider turn; a user send begins a new answer window. */
        turnOpenedBy?: 'user' | 'harness'
        /**
         * Tasks a remote session's agent started that still run, as its host
         * counts them (MAR-3987). Ephemeral like `prUrl`: the summary's
         * parallel-work count reads it, and no column stores it.
         */
        runningTasks?: number
      }
      /**
       * The execution-host event sequence this patch came from, when it came
       * from one. Metadata about the delta rather than a session field: it is
       * what lets the record commit the patch and the stream cursor in one
       * write, and recognise a terminal event the stream has replayed
       * (MAR-2582). Hosts whose transport has no sequence -- every local
       * adapter -- leave it unset.
       */
      executionHostSeq?: number
    }
  | {
      kind: 'conversation.item.add'
      item: ConversationItemDraft
      /** Adapter-owned account binding for a user turn: null is ambient; omitted is unknown. */
      providerAccountId?: string | null
    }
  | {
      kind: 'conversation.item.patch'
      itemId: string
      patch: Partial<ConversationItem>
    }
  | {
      /**
       * The images a tool result produced, still as bytes (MAR-4274). The
       * session service writes them to the attachment store and patches the
       * item with their ids, so an adapter never touches the store: a local
       * run sends the images it read from the provider, a remote one the
       * images it fetched from its host. `omissions` counts the images that
       * did not make it this far, and adds to the item's own.
       */
      kind: 'conversation.item.toolImages'
      itemId: string
      images: ToolImageBytes[]
      omissions: ToolAttachmentOmissions
    }
  | {
      kind: 'turn.add'
      turn: Turn
    }
  | {
      kind: 'turn.fileChanges.add'
      turnId: string
      fileChanges: TurnFileChange[]
    }

export interface ConversationPatchEvent {
  sessionId: string
  op: 'add' | 'patch'
  item: ConversationItem
}

export interface ConversationItemInsertRow {
  id: string
  sessionId: string
  sequence: number
  turnId: string | null
  agentRunId?: string | null
  taskId?: string | null
  kind: ConversationItemKind
  state: ConversationItemState
  payloadJson: string
  providerItemId: string | null
  providerEventType: string | null
  createdAt: string
  updatedAt: string
}

export interface BuildConversationItemFromTranscriptEntryInput {
  id: string
  sessionId: string
  providerId: string
  sequence: number
  turnId: string | null
  agentRunId?: string | null
  taskId?: string | null
  entry: TranscriptEntry
}
