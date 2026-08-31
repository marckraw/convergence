import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { resolveProviderSelection, type ProviderInfo } from '@/entities/session'
import type {
  Attachment,
  AttachmentDraftController,
} from '@/entities/attachment'
import { ForkComposer } from './fork-composer.presentational'

const providers: ProviderInfo[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
    kind: 'conversation',
    supportsContinuation: true,
    defaultModelId: 'sonnet',
    modelOptions: [
      {
        id: 'sonnet',
        label: 'Claude Sonnet',
        defaultEffort: 'medium',
        effortOptions: [
          { id: 'low', label: 'Low' },
          { id: 'medium', label: 'Medium' },
          { id: 'high', label: 'High' },
        ],
      },
    ],
    attachments: {
      supportsImage: true,
      supportsPdf: true,
      supportsText: true,
      maxImageBytes: 10 * 1024 * 1024,
      maxPdfBytes: 20 * 1024 * 1024,
      maxTextBytes: 1024 * 1024,
      maxTotalBytes: 50 * 1024 * 1024,
    },
    midRunInput: {
      supportsAnswer: false,
      supportsNativeFollowUp: false,
      supportsAppQueuedFollowUp: false,
      supportsSteer: false,
      supportsInterrupt: false,
      defaultRunningMode: null,
    },
  } as unknown as ProviderInfo,
]

const selection = resolveProviderSelection(
  providers,
  'claude-code',
  'sonnet',
  'medium',
  undefined,
)

const sampleAttachment: Attachment = {
  id: 'att-1',
  sessionId: 'fork:parent-1',
  kind: 'image',
  mimeType: 'image/png',
  filename: 'shot.png',
  sizeBytes: 3,
  storagePath: '/tmp/shot.png',
  thumbnailPath: null,
  textPreview: null,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function makeDraft(
  overrides: Partial<AttachmentDraftController> = {},
): AttachmentDraftController {
  return {
    attachments: [],
    rejections: [],
    ingestInFlight: false,
    isDragging: false,
    dragHandlers: {
      onDragEnter: vi.fn(),
      onDragLeave: vi.fn(),
      onDragOver: vi.fn(),
      onDrop: vi.fn(),
    },
    onPaste: vi.fn(),
    openFileDialog: vi.fn().mockResolvedValue(undefined),
    ingestFiles: vi.fn().mockResolvedValue(undefined),
    removeOne: vi.fn(),
    clearDraft: vi.fn(),
    ...overrides,
  }
}

function renderComposer(
  props: Partial<Parameters<typeof ForkComposer>[0]> = {},
) {
  const onChange = vi.fn()
  const draft = props.attachmentDraft ?? makeDraft()
  render(
    <ForkComposer
      textareaId="fork-instruction"
      value=""
      onChange={onChange}
      attachmentDraft={draft}
      onAttachmentOpen={vi.fn()}
      providers={providers}
      selection={selection}
      onProviderChange={vi.fn()}
      onModelChange={vi.fn()}
      onEffortChange={vi.fn()}
      {...props}
    />,
  )
  return { onChange, draft }
}

describe('ForkComposer', () => {
  it('renders a multiline instruction field and reports edits', () => {
    const { onChange } = renderComposer()
    const textarea = screen.getByRole('textbox')
    expect(textarea.tagName).toBe('TEXTAREA')

    fireEvent.change(textarea, { target: { value: 'Focus on the bug' } })
    expect(onChange).toHaveBeenCalledWith('Focus on the bug')
  })

  it('renders the run-with provider and model selectors', () => {
    renderComposer()
    expect(screen.getByText('Anthropic')).toBeInTheDocument()
    expect(screen.getByText('Claude Sonnet')).toBeInTheDocument()
    expect(screen.getByText('Medium')).toBeInTheDocument()
  })

  it('opens the file dialog when Attach is pressed', () => {
    const draft = makeDraft()
    renderComposer({ attachmentDraft: draft })

    fireEvent.click(screen.getByRole('button', { name: /Attach file/i }))
    expect(draft.openFileDialog).toHaveBeenCalledTimes(1)
  })

  it('renders attachment chips and a count badge', () => {
    renderComposer({
      attachmentDraft: makeDraft({ attachments: [sampleAttachment] }),
    })

    expect(screen.getByTestId('attachments-row')).toBeInTheDocument()
    const attachButton = screen.getByRole('button', { name: /Attach file/i })
    expect(attachButton).toHaveTextContent('1')
  })

  it('forwards drop events to the draft handler', () => {
    const draft = makeDraft()
    renderComposer({ attachmentDraft: draft })

    fireEvent.drop(screen.getByTestId('fork-composer'))
    expect(draft.dragHandlers.onDrop).toHaveBeenCalledTimes(1)
  })
})
