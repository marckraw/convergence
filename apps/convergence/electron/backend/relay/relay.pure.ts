import type {
  RelayAction,
  RelayHopOutcome,
  RelaySpawnSpec,
  RelayTrigger,
} from './relay.types'

/** Ledger previews are a glance, not a transcript. */
export const RELAY_PAYLOAD_PREVIEW_LENGTH = 500

/**
 * How many hops one flow run may fire before the guard trips.
 *
 * Loops are legal and wanted -- A -> B -> A is our own review loop -- so the
 * guard is a budget rather than a ban. Twenty is generous enough that no
 * honest loop reaches it and small enough that a runaway costs pocket change.
 */
export const MAX_AUTOMATIC_HOPS_PER_FLOW_RUN = 20

/** Outcomes that actually consumed a provider turn, and so consume budget. */
const BUDGETED_OUTCOMES: readonly RelayHopOutcome[] = [
  'delivered',
  'queued',
  'spawned',
]

/**
 * Takes a plain string because it reads stored rows, which may carry an
 * outcome word from another build. An unrecognised word charges nothing: the
 * budget exists to stop live loops, and a row this build cannot read is not
 * evidence that a provider turn was spent.
 */
export function isBudgetedOutcome(outcome: string): boolean {
  return (BUDGETED_OUTCOMES as readonly string[]).includes(outcome)
}

export function normalizeRelayTrigger(value: string): RelayTrigger {
  if (value !== 'settled') {
    throw new Error(`Unknown relay trigger: ${value}`)
  }
  return value
}

export function normalizeRelayAction(value: string): RelayAction {
  if (value !== 'hail' && value !== 'spawn') {
    throw new Error(`Unknown relay action: ${value}`)
  }
  return value
}

const MAX_SPAWN_NAME_LENGTH = 120

/**
 * Validates the session a spawn relay will open. Provider is required because
 * "start a session" with no provider is not a wire, it is a wish.
 */
export function normalizeRelaySpawnSpec(
  // Partial because this is the IPC boundary's normalizer: it already trims and
  // defaults every field, so claiming to receive a complete spec was a lie the
  // callers had to keep up with.
  spec: Partial<RelaySpawnSpec> | null | undefined,
): RelaySpawnSpec {
  if (!spec) {
    throw new Error('A spawn relay needs a session spec')
  }

  const providerId = spec.providerId?.trim() ?? ''
  if (!providerId) {
    throw new Error('A spawn relay needs a provider')
  }

  const projectId = spec.projectId?.trim() ? spec.projectId.trim() : null
  const name = spec.name?.trim() ? spec.name.trim() : DEFAULT_SPAWN_NAME
  if (name.length > MAX_SPAWN_NAME_LENGTH) {
    throw new Error(
      `Spawned session name cannot be longer than ${MAX_SPAWN_NAME_LENGTH} characters`,
    )
  }

  return {
    projectId,
    providerId,
    model: spec.model?.trim() ? spec.model.trim() : null,
    effort: spec.effort?.trim() ? spec.effort.trim() : null,
    name,
    // Not validated against the enrolled accounts here: a wire may name an
    // account that is later removed, and refusing to LOAD such a relay would
    // hide the wire the user needs to see in order to fix it. The engine
    // resolves at firing time and falls back honestly.
    providerAccountId: spec.providerAccountId?.trim()
      ? spec.providerAccountId.trim()
      : null,
  }
}

/** What a spawned session is called when the wire did not name one. */
export const DEFAULT_SPAWN_NAME = 'Relayed session'

/**
 * Long enough for a real briefing, short enough that nobody pastes a document
 * onto a wire and wonders why every hop costs a fortune.
 */
export const MAX_RELAY_INSTRUCTION_LENGTH = 4000

/**
 * The standing instruction a wire prepends to everything it carries.
 *
 * Blank is not a value: an empty box means "carry the message as it is", which
 * is the behaviour every wire had before instructions existed, so it stores as
 * null rather than as an empty string nobody would notice compiling into the
 * payload.
 */
export function normalizeRelayInstruction(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null

  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > MAX_RELAY_INSTRUCTION_LENGTH) {
    throw new Error(
      `Relay instructions cannot be longer than ${MAX_RELAY_INSTRUCTION_LENGTH} characters`,
    )
  }
  return trimmed
}

/**
 * What the wire actually sends: the standing instruction, then the finished
 * message it was written about.
 *
 * The blank line between them is load-bearing, not cosmetic (the MAR-2280
 * law). Markdown's lazy continuation would otherwise glue the instruction's
 * last line onto the message's first, and an instruction that ends inside a
 * quote or a list would swallow the message into it -- the receiving model
 * would read one blurred block instead of "here is your brief, here is the
 * thing it is about".
 *
 * No instruction means the payload is returned untouched, byte for byte. A
 * wire nobody briefed must carry exactly what it always carried -- which is
 * also why the round marker rides inside the brief rather than on its own: a
 * bare wire stays byte-identical to what it was before rounds existed.
 *
 * The round is its own block for the same MAR-2280 reason the brief is: an
 * instruction that ends inside a list or a quote would otherwise swallow
 * `round 3` into itself, and the receiving station would never see it.
 */
export function compileRelayPayload(
  instruction: string | null,
  message: string,
  round?: number | null,
): string {
  const brief = instruction?.trim() ?? ''
  if (brief.length === 0) return message
  const stamp =
    round === undefined || round === null ? '' : `round ${round}\n\n`
  return `${brief}\n\n${stamp}${message}`
}

/**
 * An opener is one message, not a document: it is a command or a one-line
 * re-brief, and anything longer is the standing instruction wearing the wrong
 * hat.
 */
export const MAX_RELAY_OPENER_LENGTH = 500

/**
 * The first message a wire sends, ahead of everything it carries (F9).
 *
 * Blank stores as null exactly like the instruction does: an empty box means
 * "just deliver the payload", which is what every wire did before openers
 * existed, and an empty string would be a first send of nothing.
 *
 * Deliberately not validated as a slash command. The opener is plain text and
 * its meaning belongs to whoever receives it -- `/clear` is Claude's word, and
 * on another provider the same box may hold a sentence.
 */
export function normalizeRelayOpener(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null

  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > MAX_RELAY_OPENER_LENGTH) {
    throw new Error(
      `A relay opener cannot be longer than ${MAX_RELAY_OPENER_LENGTH} characters`,
    )
  }
  return trimmed
}

export function normalizeRelaySessionId(value: string, label: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`Relay ${label} cannot be empty`)
  }
  return trimmed
}

export function normalizeRelayCrewId(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error('Relay crew cannot be empty')
  }
  return trimmed
}

/**
 * Validates a wire before it is stored. A relay pointing at its own source
 * would fire itself forever with no second agent involved, which is a typo
 * rather than a loop -- real loops run through at least two sessions.
 */
export function assertRelayEndpoints(
  sourceSessionId: string,
  targetSessionId: string | null,
  action: RelayAction,
): void {
  if (action === 'hail' && !targetSessionId) {
    throw new Error('A hail relay needs a target session')
  }
  // A spawn opens its own far end every time it fires, so a stored target
  // would be a second, contradictory answer to "where does this go".
  if (action === 'spawn' && targetSessionId) {
    throw new Error('A spawn relay cannot also have a target session')
  }
  if (targetSessionId && targetSessionId === sourceSessionId) {
    throw new Error('A relay cannot hail the session it listens to')
  }
}

/**
 * One readable line, capped. Whitespace collapses because a preview sits in a
 * dense trail, and nothing empty is a preview -- it reads as null.
 */
function collapse(text: string | null, limit: number): string | null {
  if (text === null) return null
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length === 0) return null
  return collapsed.length > limit
    ? `${collapsed.slice(0, limit - 1)}…`
    : collapsed
}

/**
 * The ledger's glance at what was carried.
 */
export function buildPayloadPreview(text: string | null): string | null {
  return collapse(text, RELAY_PAYLOAD_PREVIEW_LENGTH)
}

/**
 * How much of the opener the ledger shows before the payload gets its turn.
 * Short on purpose: both beats must stay visible in one glance, so a long
 * opener may not push the payload out of the preview entirely.
 */
export const RELAY_OPENER_PREVIEW_LENGTH = 120

/**
 * The ledger's glance at a firing that sent two messages.
 *
 * No silent sends: a hop that wiped its target before delivering must say so
 * in the one row it writes, or the user reads "delivered" and never learns
 * that a `/clear` went first. A wire with no opener previews exactly what it
 * always did.
 */
export function buildRelayHopPreview(
  opener: string | null,
  payload: string,
): string | null {
  const payloadPreview = buildPayloadPreview(payload)
  const openerPreview = collapse(opener, RELAY_OPENER_PREVIEW_LENGTH)
  if (openerPreview === null) return payloadPreview

  const sentence =
    payloadPreview === null
      ? `First send: ${openerPreview}`
      : `First send: ${openerPreview} · then: ${payloadPreview}`
  return collapse(sentence, RELAY_PAYLOAD_PREVIEW_LENGTH)
}

/**
 * Whether a firing is allowed to spend another hop on this flow run.
 */
export function hasFlowRunBudget(spentHops: number): boolean {
  return spentHops < MAX_AUTOMATIC_HOPS_PER_FLOW_RUN
}

/**
 * The sentence the ledger shows when the guard trips. It names the number so
 * the disarm never looks arbitrary.
 */
export function flowRunBudgetMessage(spentHops: number): string {
  return `This flow run already fired ${spentHops} hops, hitting the ${MAX_AUTOMATIC_HOPS_PER_FLOW_RUN}-hop budget. The relay was disarmed to stop the loop.`
}

/**
 * The sentence the ledger shows when a human sent the turn quiet (F10).
 *
 * Says both halves out loud, because a grey row with no explanation reads as a
 * fault: the wire did not fire, AND it is not switched off -- the very next
 * ordinary message will carry as usual.
 */
export const MUTED_MESSAGE =
  'This message was sent quiet, so the wire did not fire. It is still armed for the next one.'

/**
 * The sentence the ledger shows when the loop law ends a chain.
 *
 * Deliberately not phrased as a problem: A -> B -> A finishing after two hops
 * is the wire behaving, and the row exists so the user can see the chain stop
 * rather than wonder whether anything happened.
 */
export const ALREADY_FIRED_MESSAGE =
  'This wire already fired in this run; a wire fires once per run.'

/**
 * The word a station writes to say where its work goes next.
 *
 * Declared, never inferred. Routing by reading intent out of prose is a text
 * proxy for a question only the author can answer, so the finishing station
 * states its route on a line of its own and the relay does one string compare.
 */
export const BATON_KEYWORD = 'baton'

/** The one baton no wire may claim: it is Marcin's chair, and always terminal. */
export const TERMINAL_BATON = 'marcin'

/**
 * The sentence the ledger shows when the reserved terminal held a wire.
 *
 * "Always terminal" has to outrank routing, not merely conditions: an
 * unconditional wire answers every message, so a build where the terminal only
 * beat conditioned wires would deliver the one route guaranteed to reach a
 * human onward and leave the chair dark.
 */
export const TERMINAL_BATON_MESSAGE = `This message handed the work to the chair (BATON: ${TERMINAL_BATON}), which is reserved and no wire may carry, so this one held.`

/**
 * A condition is a line, not a paragraph. Long enough for `BATON: <name>` with
 * room to spare, short enough that nobody pastes a sentence into a switch.
 */
export const MAX_RELAY_CONDITION_TOKEN_LENGTH = 120

/**
 * The last line of a message that actually says something.
 *
 * Trailing blank lines are how a model ends a paragraph, not a retraction of
 * the line above them, so they are stepped over rather than read as "nothing
 * was declared".
 */
function lastNonEmptyLine(message: string): string | null {
  const lines = message.split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim()
    if (line.length > 0) return line
  }
  return null
}

/**
 * The marks a formatter wraps a line in: emphasis and code.
 *
 * Only these three. A mastermind whose every reply is markdown bolds its
 * closing line by reflex, and for a whole day (MAR-2815) `**BATON: horse**`
 * read as "nothing" while the wire sat waiting for the same words unbolded.
 */
const BATON_WRAPPER_MARKS = new Set(['*', '_', '`'])

/**
 * Whether a name wears one of those marks on either end.
 *
 * The door a baton name is typed at asks this (`normalizeCrewBatonName`),
 * because nothing downstream can tell `_horse_` the formatting from `_horse_`
 * the name: the peeler below would address that member as `horse` and hand
 * the work to somebody else. Refusing the name once, where it is stored, is
 * what makes the peel unambiguous everywhere it is read. A mark in the MIDDLE
 * (`my_horse`) is spelling, and is never touched.
 */
export function hasEdgeFormattingMark(name: string): boolean {
  if (name.length === 0) return false
  return (
    BATON_WRAPPER_MARKS.has(name[0]) ||
    BATON_WRAPPER_MARKS.has(name[name.length - 1])
  )
}

/**
 * The text with a SYMMETRIC wrapper of emphasis or code marks peeled off.
 *
 * One mark at a time from both ends, and only while the two ends agree, so
 * `**x**`, `` `x` ``, `_x_` and `***x***` all reduce to `x` while a lopsided
 * `**x*` gives up its one matching pair and stays the odd `*x` -- a wrapper
 * only ever comes off in pairs, which is what keeps this peeling formatting
 * rather than parsing markdown.
 */
function stripSymmetricWrapper(text: string): string {
  let start = 0
  let end = text.length
  // Two characters minimum: a lone `*` is its own first AND last character,
  // and stripping it from both ends would be reading one mark twice.
  while (end - start >= 2) {
    const mark = text[start]
    if (!BATON_WRAPPER_MARKS.has(mark)) break
    if (text[end - 1] !== mark) break
    start += 1
    end -= 1
  }
  return text.slice(start, end)
}

/**
 * One line, in the one spelling everything here compares.
 *
 * Case folds and internal whitespace collapses because both are invisible: a
 * station that wrote `BATON:  Horse` declared the same route as one that wrote
 * `baton: horse`, and a loop that stalled on a double space would be a loop
 * nobody could debug. A symmetric wrapper of `*`, `_` or backticks comes off
 * for the same reason: it is the formatter's decoration around a whole
 * declaration, not part of what was declared. Normalising cannot make two
 * DIFFERENT declarations equal -- it is applied identically to both sides of
 * every comparison -- so this stays a string compare, not prose parsing.
 */
function normalizeBatonLine(line: string): string {
  return stripSymmetricWrapper(line.trim())
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * What a normalized line declared: nothing, a name, or the keyword alone.
 *
 * Three cases rather than a name-or-null, because the third is a question the
 * wire door has to ask on its own: `BATON:` with nothing after it declared
 * nobody, which is a different refusal from a line that never mentioned a
 * baton at all, and only a reading that keeps them apart can say so.
 */
export type BatonDeclaration =
  | { kind: 'none' }
  | { kind: 'named'; name: string }
  | { kind: 'nameless' }

/**
 * The ONE place a declaration is decoded, so the reader below and the wire
 * compare further down can never disagree about what a line handed on.
 *
 * Anchored at the start of the line on purpose: a sentence that mentions the
 * word in passing has not routed anything, and a relay that thought otherwise
 * would be sniffing prose.
 *
 * The wrapper comes off the NAME by the same rule it comes off the line --
 * one rule, applied twice: a symmetric pair on both ends of the token is the
 * formatter's decoration, exactly as it is around the whole line, so
 * `BATON: **horse**` hands on to `horse`. Reading that as "nothing declared"
 * is what it must never be: an emitted baton that evaporates is a silent
 * drop, and the unrouted hail exists precisely so no hand-off can vanish.
 * A lopsided `BATON: **horse*` keeps the mark it could not pair (`*horse`),
 * which no crew member may be named (`hasEdgeFormattingMark` guards the
 * door), so it answers to nobody and hails as unrouted -- loud, never
 * nothing. Marks in the MIDDLE of a name (`my_horse`) are untouched: they are
 * spelling.
 *
 * A name of NOTHING BUT marks (`BATON: **`) peels away to the empty string,
 * and the peel was the only thing that could have been a name -- but the line
 * still attempted a hand-off, so what was written stands unpeeled. It routes
 * nowhere for exactly the reason `*horse` does not, and so it is loud.
 * Calling it "no declaration" would be the silent drop through the other
 * door: nothing to route AND nothing to hail about.
 */
function readBatonDeclaration(normalizedLine: string): BatonDeclaration {
  const prefix = `${BATON_KEYWORD}:`
  if (!normalizedLine.startsWith(prefix)) return { kind: 'none' }
  const written = normalizedLine.slice(prefix.length).trim()
  if (written.length === 0) return { kind: 'nameless' }
  const peeled = stripSymmetricWrapper(written).trim()
  return { kind: 'named', name: peeled.length > 0 ? peeled : written }
}

/** The name a normalized line declares, or null when it declares none. */
function declaredBatonName(normalizedLine: string): string | null {
  const declaration = readBatonDeclaration(normalizedLine)
  return declaration.kind === 'named' ? declaration.name : null
}

/**
 * One line in the one spelling every compare uses.
 *
 * A line that declares a baton canonicalises to `baton: <name>` with the
 * declaration's own wrapper peeled off; anything else is simply its
 * normalized self, because a wire's condition need not be a baton at all
 * (`DONE` is a legal token). Both sides of every compare come through here,
 * which is what keeps this a string compare: the same words always canonicalise
 * the same way, and two DIFFERENT declarations still cannot meet.
 */
function canonicalBatonLine(line: string): string {
  const normalized = normalizeBatonLine(line)
  const name = declaredBatonName(normalized)
  return name === null ? normalized : `${BATON_KEYWORD}: ${name}`
}

/** The baton a line declares, or null when the line is not a declaration. */
function readBatonFromLine(line: string | null): string | null {
  if (line === null) return null
  return declaredBatonName(normalizeBatonLine(line))
}

/**
 * What a finished message's last non-empty line declared.
 *
 * The engine asks this rather than only "which name", because the two
 * silences mean different things: a message that ends in prose handed nothing
 * on, while `BATON:` with nobody after it ATTEMPTED a hand-off and named
 * nobody -- and an attempt nothing answered has to reach a human, exactly as
 * `BATON: **` does. Reading them as one silence is what let the bare keyword
 * vanish with no row and no hail.
 */
export function readEmittedDeclaration(message: string): BatonDeclaration {
  const line = lastNonEmptyLine(message)
  if (line === null) return { kind: 'none' }
  return readBatonDeclaration(normalizeBatonLine(line))
}

/**
 * The baton a finished message hands on, read from its last non-empty line.
 *
 * Used for two different questions, and only these two: which name a settle
 * handed on -- recorded on every hop row -- and whether it is the reserved
 * terminal. Whether a hand-off was ATTEMPTED at all is `readEmittedDeclaration`
 * above, over the same decoding. Wire matching does not go through here,
 * because a wire's condition need not be a baton at all.
 */
export function readEmittedBaton(message: string): string | null {
  const declaration = readEmittedDeclaration(message)
  return declaration.kind === 'named' ? declaration.name : null
}

/** The convention a wire's condition field is pre-filled with. */
export function batonConditionToken(batonName: string): string {
  return `${BATON_KEYWORD.toUpperCase()}: ${batonName.trim()}`
}

/**
 * Whether this wire's condition is satisfied by the message that just
 * finished.
 *
 * One string compare against the last non-empty line, and nothing else -- the
 * two sides canonicalised by the same rule, so the formatter cannot put a wire
 * out of reach of the line that meant it. A wire with no token is
 * unconditional -- exactly what every wire drawn before conditions existed
 * was, and still is.
 */
export function relayConditionMatches(
  conditionToken: string | null,
  message: string,
): boolean {
  if (conditionToken === null) return true
  const line = lastNonEmptyLine(message)
  if (line === null) return false
  const canonicalLine = canonicalBatonLine(line)
  const canonicalToken = canonicalBatonLine(conditionToken)
  // A side made of nothing but marks (`**`, `____`) peels away to the empty
  // string, and two empties are not an agreement about anything: they are two
  // things that said nothing. Without this, a wire whose token was `**` fired
  // on every message ending in `__`.
  if (canonicalLine.length === 0 || canonicalToken.length === 0) return false
  return canonicalLine === canonicalToken
}

/**
 * A character a person could have meant: a letter or a number, in any script.
 *
 * Everything else a condition might be made of -- emphasis, code marks,
 * punctuation -- is decoration around a name rather than a name.
 */
const NAMEABLE_CHARACTER = /[\p{L}\p{N}]/u

/**
 * Whether a text contains anything a person could have meant as a name.
 *
 * Asked at BOTH doors -- the wire's condition here and the crew member's baton
 * name (`normalizeCrewBatonName`) -- because the two are one question: a
 * member named `🐎` is a member no condition may ever wait on, so a door that
 * accepts the name while the other refuses the condition stores a station
 * nobody can be wired to.
 */
export function hasNameableCharacter(text: string): boolean {
  return NAMEABLE_CHARACTER.test(text)
}

/**
 * Validates the condition a wire fires on.
 *
 * Blank stores as null, the shape every optional relay text uses: an empty box
 * means "fire whenever the source finishes", which is what a wire without a
 * condition has always done.
 *
 * The terminal baton is refused rather than accepted and ignored. `BATON:
 * marcin` is the one route guaranteed to reach a human, and a wire that
 * claimed it would quietly turn Marcin's chair into just another station.
 */
export function normalizeRelayConditionToken(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null

  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.includes('\n')) {
    throw new Error('A relay condition is one line, not a paragraph')
  }
  if (trimmed.length > MAX_RELAY_CONDITION_TOKEN_LENGTH) {
    throw new Error(
      `A relay condition cannot be longer than ${MAX_RELAY_CONDITION_TOKEN_LENGTH} characters`,
    )
  }
  // A condition is a promise that some future line will match it, and two
  // shapes can never keep it. Refused here rather than stored, so no wire is
  // left waiting on something no message can say -- and a blank box is
  // already spoken for, meaning "fire whenever the source finishes".
  const normalized = normalizeBatonLine(trimmed)
  const declaration = readBatonDeclaration(normalized)
  if (declaration.kind === 'nameless') {
    throw new Error('A relay condition that says BATON: must name somebody')
  }
  // Asked of the declared NAME when there is one, and of the whole token
  // otherwise, because `DONE` is a legal condition that names no baton at
  // all. The old guard asked only whether the token peeled away to nothing,
  // which is why its sentence overpromised: a LONE mark has no pair to peel,
  // so `*` and a bare backtick stored happily under a sentence saying they
  // could not, and `BATON: **` waits on a name no member may carry.
  const waitedOn = declaration.kind === 'named' ? declaration.name : normalized
  if (!hasNameableCharacter(waitedOn)) {
    throw new Error(
      'A relay condition must wait on a letter or a number, not only formatting marks',
    )
  }
  if (readBatonFromLine(trimmed) === TERMINAL_BATON) {
    throw new Error(
      `BATON: ${TERMINAL_BATON} is reserved — it always parks the loop and hails Marcin, so no wire may claim it`,
    )
  }
  return trimmed
}

/**
 * How many hops one crew's loop may spend before the round guard trips.
 *
 * Twelve because our own runs historically close in two to eleven rounds, so a
 * loop that reaches the cap is one nobody is watching rather than one that is
 * merely thorough.
 */
export const DEFAULT_CREW_ROUND_CAP = 12

/**
 * The cap this crew actually uses.
 *
 * A stored cap that could not have been meant -- zero, negative, fractional,
 * or a number an older build never wrote -- falls back to the default rather
 * than disabling the guard. A budget that a bad row can switch off is not a
 * budget.
 */
export function resolveRoundCap(storedCap: number | null | undefined): number {
  if (typeof storedCap !== 'number') return DEFAULT_CREW_ROUND_CAP
  if (!Number.isInteger(storedCap) || storedCap < 1) {
    return DEFAULT_CREW_ROUND_CAP
  }
  return storedCap
}

/** Which round a hop about to be spent belongs to: the first one is round 1. */
export function roundNumber(spentHops: number): number {
  return spentHops + 1
}

/** Whether this loop may spend another round. */
export function hasRoundBudget(spentHops: number, cap: number): boolean {
  return spentHops < cap
}

/**
 * The sentence the ledger shows when the round guard trips. It names the cap
 * so the refusal never looks arbitrary, and says the wire is still armed --
 * unlike the hop budget, a long loop is a loop that needs a human, not a
 * runaway that needs switching off.
 */
export function roundBudgetMessage(cap: number): string {
  return `This loop reached its ${cap}-round cap without reaching a terminal, so the wire held and Marcin was hailed. It is still armed for the next run.`
}

/**
 * How much of the refused line the ledger quotes back. Long enough to show a
 * declaration and its formatting, short enough to stay one readable sentence.
 */
const MAX_QUOTED_BATON_LINE_LENGTH = 80

/**
 * The sentence the ledger shows when a wire's baton condition did not match.
 *
 * The refusal is the wire working exactly as drawn -- default-closed is the
 * point of a condition -- so it reads grey and says which baton it was waiting
 * for.
 *
 * It quotes the RAW last line rather than only the baton it read, because
 * "handed on nothing" is true and useless: for a whole day (MAR-2815) every
 * hop said it while the line right there read `**BATON: horse**`, and nobody
 * could see the mismatch the trail was describing. Takes the whole message and
 * derives both halves here, so the quoted line and the baton beside it can
 * never come from two different readings of it.
 */
export function batonMismatchMessage(
  conditionToken: string,
  message: string,
): string {
  const line = lastNonEmptyLine(message)
  if (line === null) {
    return `This wire waits for "${conditionToken}"; the message said nothing on any line, so it held.`
  }
  const emittedBaton = readBatonFromLine(line)
  const seen = emittedBaton
    ? `handed on "${emittedBaton}"`
    : 'handed on nothing'
  // By character, not by UTF-16 code unit: slicing an emoji in half left a
  // lone surrogate in the row a person reads, which renders as a broken box.
  const characters = Array.from(line)
  const quoted =
    characters.length > MAX_QUOTED_BATON_LINE_LENGTH
      ? `${characters.slice(0, MAX_QUOTED_BATON_LINE_LENGTH - 1).join('')}…`
      : line
  return `This wire waits for "${conditionToken}"; the message's last line was "${quoted}", which ${seen}, so it held.`
}
