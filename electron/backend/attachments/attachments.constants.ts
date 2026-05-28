export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const MAX_TEXT_BYTES = 1 * 1024 * 1024
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024

// Sentinel session id used by the composer when no real session exists yet
// (see `src/features/composer/composer.container.tsx` DRAFT_KEY_NEW).
// Attachments created with this id live under `{rootDir}/__new__/` until the
// session is created, at which point `rebindToSession` moves them into the
// real session directory. Must match the renderer sentinel.
export const DRAFT_SESSION_ID = '__new__'

export const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'application/json': '.json',
  'text/x-typescript': '.ts',
  'text/javascript': '.js',
  'text/x-python': '.py',
  'text/x-ruby': '.rb',
  'text/x-go': '.go',
  'text/x-rust': '.rs',
  'text/x-java': '.java',
  'text/x-c': '.c',
  'text/x-c++': '.cpp',
  'application/x-sh': '.sh',
  'text/yaml': '.yml',
  'text/toml': '.toml',
  'text/xml': '.xml',
  'text/html': '.html',
  'text/css': '.css',
  'text/x-sql': '.sql',
}
