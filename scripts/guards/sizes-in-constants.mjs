#!/usr/bin/env node
// Finds a size handed to a part through a name: a constant, an object's member, a function that
// returns classes (why, and how: sizes-in-constants.pure.mjs). Everything it knows comes from its
// config, sizes-in-constants.json beside it unless --config names another.
//
//   node scripts/guards/sizes-in-constants.mjs                    this checkout
//   node scripts/guards/sizes-in-constants.mjs --root <dir>       another tree (the canaries use this)
//   node scripts/guards/sizes-in-constants.mjs --config <file>    another config
//
// The config: { files, exclude, aliases, parts: [{ tags, attributes, pattern, linkPattern?,
// inPlace?, why }], allowlist: [{ path, name, utilities, reason }] }. Globs and paths are relative
// to the root.
//
// Exits 0 when all is well, 1 with one line per problem, 2 when it can't check.
import { globSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  configProblems,
  resolverFor,
  sizeProblems,
  sizesInConstants,
} from './sizes-in-constants.pure.mjs'

const { values } = parseArgs({
  options: {
    root: { type: 'string', default: '.' },
    config: {
      type: 'string',
      default: fileURLToPath(
        new URL('./sizes-in-constants.json', import.meta.url),
      ),
    },
  },
})

const fail = (message) => {
  console.error(`sizes-in-constants: ${message}`)
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

const sources = paths.map((path) => ({
  path,
  text: readFileSync(resolve(root, path), 'utf8'),
}))
const problems = sizeProblems(
  sizesInConstants({
    sources,
    config,
    resolve: resolverFor(paths, config.aliases),
  }),
)
for (const problem of problems) console.error(problem)
if (problems.length > 0) {
  console.error(
    `A size is a prop, never a className (R3), and a name that hands one on is a className too: take the part's size (Button xs to xl; Notice and Badge size; a field's size and density="compact"), or make the row the part it is (ListRow, Card with CardAction, StatusPillButton). Keep one on purpose in ${relative(process.cwd(), resolve(values.config))}'s allowlist, with a reason.`,
  )
}
process.exit(problems.length > 0 ? 1 : 0)
