export type ProjectContextReinjectMode = 'boot' | 'every-turn'

export interface SerializableProjectContextItem {
  label: string | null
  body: string
  reinjectMode: ProjectContextReinjectMode
}

export interface SerializeBlockInput {
  slug: string
  items: SerializableProjectContextItem[]
  originalText: string
}

export interface BootBlockResult {
  /** The block text suitable for a sequence-0 `note` ConversationItem, or null when there are no items. */
  note: string | null
  /** The user's first message with the block prepended, or the original text when there are no items. */
  augmentedText: string
}

const UNTITLED_LABEL = 'untitled'
const ITEM_SEPARATOR = '\n\n'
const BLOCK_TEXT_SEPARATOR = '\n\n'

function renderItem(item: SerializableProjectContextItem): string {
  const label = item.label?.trim() ? item.label.trim() : UNTITLED_LABEL
  return `${label}\n${item.body.trim()}`
}

function wrapBlock(slug: string, body: string): string {
  return `<${slug}:context>\n${body}\n</${slug}:context>`
}

function buildBlock(
  slug: string,
  items: SerializableProjectContextItem[],
): string {
  return wrapBlock(slug, items.map(renderItem).join(ITEM_SEPARATOR))
}

export function serializeBootBlock(
  input: SerializeBlockInput,
): BootBlockResult {
  const { slug, items, originalText } = input
  if (items.length === 0) {
    return { note: null, augmentedText: originalText }
  }
  const block = buildBlock(slug, items)
  return {
    note: block,
    augmentedText: `${block}${BLOCK_TEXT_SEPARATOR}${originalText}`,
  }
}

export function serializeEveryTurnBlock(input: SerializeBlockInput): string {
  const { slug, items, originalText } = input
  const everyTurnItems = items.filter(
    (item) => item.reinjectMode === 'every-turn',
  )
  if (everyTurnItems.length === 0) return originalText
  const block = buildBlock(slug, everyTurnItems)
  return `${block}${BLOCK_TEXT_SEPARATOR}${originalText}`
}
