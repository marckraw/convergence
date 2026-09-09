import { expect, it } from 'vitest'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

it('R8 L6 taskId stays out of both provider write types — mutation expose either write key turns red', () => {
  const program = ts.createProgram({
    rootNames: [
      fileURLToPath(
        new URL('./harness-evidence.write-types.fixture.ts', import.meta.url),
      ),
    ],
    options: {
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      types: [],
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  })
  expect(
    ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
      code: diagnostic.code,
      text: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    })),
  ).toEqual([])
})
