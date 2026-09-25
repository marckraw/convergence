import promptText from './block-sentence.prompt.txt?raw'

/**
 * CV2b's prompt, verbatim (A3). Bundled into main as text by Vite's `?raw`
 * so the packaged app carries the same bytes the spike measured; the spike
 * reads the same file from disk.
 */
export const BLOCK_SENTENCE_PROMPT: string = promptText
