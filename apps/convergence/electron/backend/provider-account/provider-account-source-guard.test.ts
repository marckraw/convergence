import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { expect, it } from 'vitest'

const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url))

/**
 * Comments must be free to name the forbidden call — explaining why
 * `app.getPath('userData')` is banned is the point of the docstrings. Strip
 * them so the guard below judges code only.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

/**
 * Moved out of `provider-account.pure.test.ts` by MAR-2989: this test reads the
 * module directory rather than calling the pure module, and a `.pure.test.ts`
 * file is the test of a `.pure.ts` module — every one of them in this
 * repository sits beside the module it names. Keeping a directory read in
 * there made the suffix mean two things at once. It enumerates one module
 * folder, not a source tree, so its cost does not grow with the repository and
 * it keeps the default budget.
 */
it('never consults app.getPath or Electron to build account paths', () => {
  // The dev-vs-packaged hash split is the trap ADR 0007 documents:
  // `convergence` and `Convergence` are one folder on a case-insensitive
  // disk but two different keychain slots, so a userData-derived path would
  // hide dev-enrolled accounts from the installed build. Guard the whole
  // module directory, not just today's file.
  const sourceFiles = readdirSync(MODULE_DIR).filter(
    (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
  )

  expect(sourceFiles.length).toBeGreaterThan(0)

  for (const file of sourceFiles) {
    const source = stripComments(readFileSync(join(MODULE_DIR, file), 'utf8'))

    // An `.ipc.ts` file exists to import `ipcMain`; that is the boundary, not
    // a path derivation. The two checks that actually protect the keychain
    // slot still apply to every file, this one included.
    if (!file.endsWith('.ipc.ts')) {
      expect(source, `${file} must not import electron`).not.toMatch(
        /from\s+['"]electron['"]/,
      )
    }

    expect(source, `${file} must not call app.getPath`).not.toMatch(
      /getPath\s*\(/,
    )
    expect(source, `${file} must not reference userData`).not.toMatch(
      /userData/,
    )
  }
})
