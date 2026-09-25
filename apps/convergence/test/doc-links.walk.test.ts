import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { WALK_TEST_TIMEOUT_MS } from './walk-budget'

/**
 * The June spec purge (`7ef9e546`, 2026-06-01) deleted every file under
 * `docs/specs/`, and eleven references in four tracked docs kept naming them
 * for four months — `AGENTS.md` among them, so every agent in every lane was
 * told to read files that were not there (MAR-3178).
 *
 * Nothing caught it because nothing was looking. This walk looks: it reads the
 * agent-facing paper and asserts that every repo `.md` path those docs name
 * still exists. A doc may point at a deleted spec through history
 * (`git show 7ef9e546^:docs/specs/project-spec.md`) — that is a command, not a
 * path, and it is not checked — but it may not name the bare path as if it
 * were still there.
 */
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..')

/** The agent-facing paper: the two root charters plus the whole `docs/` tree. */
const ROOT_DOCS = ['AGENTS.md', 'DESIGN.md']

/**
 * Local by design and gitignored (`.gitignore:25-26`), so they are named in the
 * docs but never present in a checkout. Exempt by name rather than by rule: the
 * point of the walk is that every other name has to be real.
 */
const GITIGNORED_BY_DESIGN = new Set(['FABLE.md', 'HANDOFF.md'])

/**
 * A bare repo path and nothing else. Excludes whitespace, `:` and `^`, which is
 * what keeps a `git show <sha>^:<path>` history pointer out of the candidates.
 */
const BARE_REPO_PATH = /^[A-Za-z0-9._@/{},+-]+\.md$/

const BACKTICK_SPAN = /`([^`\n]+)`/g
const MARKDOWN_LINK = /\]\(([^)\s]+)\)/g

function walk(directory: string, files: string[]): void {
  if (!existsSync(directory)) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) walk(path, files)
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path)
  }
}

/** `a/{b,c}/d.md` names two files; check both rather than skip the line. */
function expandBraces(candidate: string): string[] {
  const group = /\{([^{}]*)\}/.exec(candidate)
  if (!group) return [candidate]
  return group[1]
    .split(',')
    .flatMap((option) =>
      expandBraces(
        candidate.slice(0, group.index) +
          option +
          candidate.slice(group.index + group[0].length),
      ),
    )
}

/**
 * The first segment has to name something at the repo root, because docs also
 * backtick path *fragments* — `AGENTS.md` writes
 * `convergence-design-promote/SKILL.md` under a sentence that supplies the
 * `.agents/skills/` prefix. A fragment is not a claim that the path resolves.
 */
function isRepoRooted(candidate: string): boolean {
  return existsSync(resolve(REPO_ROOT, candidate.split('/')[0]))
}

function referencesIn(doc: string): string[] {
  const source = readFileSync(doc, 'utf8')
  const references: string[] = []

  for (const [, span] of source.matchAll(BACKTICK_SPAN)) {
    if (!BARE_REPO_PATH.test(span)) continue
    for (const candidate of expandBraces(span)) {
      if (isRepoRooted(candidate))
        references.push(resolve(REPO_ROOT, candidate))
    }
  }

  for (const [, target] of source.matchAll(MARKDOWN_LINK)) {
    const path = target.split('#')[0]
    if (!path.endsWith('.md') || /^[a-z]+:/.test(path)) continue
    // A link resolves from the folder of the doc that carries it.
    references.push(resolve(dirname(doc), path))
  }

  return references
}

it(
  'names no repo markdown file that does not exist',
  { timeout: WALK_TEST_TIMEOUT_MS },
  () => {
    const docs = ROOT_DOCS.map((name) => resolve(REPO_ROOT, name))
    walk(resolve(REPO_ROOT, 'docs'), docs)

    // A walk rooted at the wrong folder reads nothing and passes; prove it
    // reached the charter that carried the dead references.
    expect(docs).toContain(resolve(REPO_ROOT, 'AGENTS.md'))
    expect(docs).toContain(resolve(REPO_ROOT, 'docs/agents/domain.md'))

    const referenced = docs.flatMap(referencesIn)

    // And prove the extractor pulled paths out of them, for the same reason:
    // a regex that matches nothing also reports nothing missing.
    expect(referenced).toContain(
      resolve(REPO_ROOT, 'docs/architecture/quick-reference.md'),
    )

    const missing = [...new Set(referenced)]
      .filter((path) => !GITIGNORED_BY_DESIGN.has(relative(REPO_ROOT, path)))
      .filter((path) => !existsSync(path) || !statSync(path).isFile())
      .map((path) => relative(REPO_ROOT, path))
      .sort()

    expect(missing).toEqual([])
  },
)
