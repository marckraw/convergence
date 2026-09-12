import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { preProcessFile } from 'typescript'
import { expect, it } from 'vitest'
import { WALK_TEST_TIMEOUT_MS } from '../../../test/walk-budget'

/**
 * AJV is a devDependency: the crew recipe's schema is validated in tests, and
 * the shipped reader validates by hand. An `import 'ajv'` that reached
 * production source would type-check, pass every other test, and then fail at
 * runtime in a packaged build where the package is not installed.
 *
 * This lived in `crew-config.pure.test.ts` until MAR-2989. It never was a
 * crew-config test — it is a repository-wide dependency guard that happened to
 * be filed beside the schema it protects, and being the one tree-walk inside a
 * 77-test module suite made it the test that lost the race whenever the box was
 * busy. It walks, so it spends the named walk budget; it is the only thing in
 * this file, so what timed out is never in doubt.
 */
it(
  'keeps AJV imports out of production source (mutation: add runtime ajv import)',
  { timeout: WALK_TEST_TIMEOUT_MS },
  () => {
    const workspace = fileURLToPath(new URL('../../../', import.meta.url))
    const imports = ['electron', 'src'].flatMap((directory) => {
      const root = join(workspace, directory)
      return readdirSync(root, { recursive: true })
        .map(String)
        .filter(
          (file) =>
            /\.[cm]?[jt]sx?$/.test(file) &&
            !/\.(test|spec)\.|(^|[/\\])__tests__[/\\]/.test(file),
        )
        .flatMap((file) => {
          const path = join(root, file)
          return preProcessFile(readFileSync(path, 'utf8'), true, true)
            .importedFiles.filter(
              ({ fileName }) =>
                fileName === 'ajv' || fileName.startsWith('ajv/'),
            )
            .map(({ fileName }) => `${relative(workspace, path)}: ${fileName}`)
        })
    })
    expect(imports.sort()).toEqual([])
  },
)
