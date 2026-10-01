#!/usr/bin/env node
// Finds class strings copied more often than the config allows (why, and how:
// repeated-classes.pure.mjs). Everything it knows comes from its config, repeated-classes.json
// beside it unless --config names another: copy the two files and the config into another project
// and it works there.
//
//   node scripts/guards/repeated-classes.mjs                    this checkout
//   node scripts/guards/repeated-classes.mjs --root <dir>       another tree (the canaries use this)
//   node scripts/guards/repeated-classes.mjs --config <file>    another config
//
// The config: { files, exclude, classFiles, attributes, functions, minUtilities, maxOccurrences,
// allowlist: [{ classes, reason }] }. Globs are relative to the root.
//
// Exits 0 when all is well, 1 with one line per problem, 2 when it can't check.
import { globSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  configProblems,
  repeatedClasses,
  repeatedClassProblems,
} from './repeated-classes.pure.mjs'

const { values } = parseArgs({
  options: {
    root: { type: 'string', default: '.' },
    config: {
      type: 'string',
      default: fileURLToPath(
        new URL('./repeated-classes.json', import.meta.url),
      ),
    },
  },
})

const fail = (message) => {
  console.error(`repeated-classes: ${message}`)
  process.exit(2)
}

const root = resolve(values.root)
let config
try {
  config = JSON.parse(readFileSync(resolve(values.config), 'utf8'))
} catch (error) {
  fail(`can't read the config ${values.config}: ${error.message}`)
}
const problemsWithConfig = configProblems(config)
if (problemsWithConfig.length > 0)
  fail(`${values.config}: ${problemsWithConfig.join('; ')}`)

const exclude = ['**/node_modules/**', ...(config.exclude ?? [])]
const paths = globSync(config.files, { cwd: root, exclude }).toSorted()
if (paths.length === 0)
  fail(`the config's files match nothing in ${root}: check its globs`)
const classFiles = new Set(
  globSync(config.classFiles ?? [], { cwd: root, exclude }),
)

const sources = paths.map((path) => ({
  path,
  text: readFileSync(resolve(root, path), 'utf8'),
  wholeFile: classFiles.has(path),
}))
const problems = repeatedClassProblems(
  repeatedClasses({ sources, config }),
  config,
)
for (const problem of problems) console.error(problem)
if (problems.length > 0) {
  console.error(
    `The third copy of a class string is a part or a shared constant. Keep one on purpose by adding it to the allowlist in ${relative(process.cwd(), resolve(values.config))}, with a reason.`,
  )
}
process.exit(problems.length > 0 ? 1 : 0)
