/**
 * One Project that already lives on a daemon (MAR-2689).
 *
 * The daemon's own vocabulary, not Convergence's: a Project there is a
 * long-lived directory on that machine (`{ id, name, workingDirectory }`,
 * `projects.v1`), and a session started "in" one runs in that directory with
 * whatever repositories and memory already sit there. Convergence's local
 * `Project` is a different concept that happens to share a word, which is why
 * everything on this side of the wire says *remote* project.
 *
 * `origin` is the git remote of `workingDirectory`, as the daemon reports it.
 * It is the join key that lets the strip preselect the Project that holds the
 * same repository the local project does — and it is optional because the
 * daemon does not send it yet (the ask is on MAR-2688). A machine that does
 * not send it lists its Projects with `origin: null` and simply preselects
 * nothing; the feature lights up when the field lands.
 */
export interface RemoteProject {
  id: string
  name: string
  workingDirectory: string
  origin: string | null
}

/**
 * What one machine's Projects turned out to be, as one value (MAR-2689).
 *
 * Three outcomes of one question, discriminated, rather than a listing kept in
 * one field and a failure kept in another. Two fields are two facts to
 * reconcile at every read, and a reader that reconciles them can be handed a
 * pair that never happened -- an older failure beside a newer listing, or a
 * listing from a machine whose handshake has since stopped offering Projects.
 * Three rounds of review on this seam each added a guard to one more exit; one
 * value is what makes a fourth exit unrepresentable. The second of those pairs
 * is a question of *when* rather than of shape, and one value cannot answer it
 * alone: the host keeps this one with the capability it was read under, so an
 * outcome stops being obtainable the moment the machine changes what it says
 * about Projects (`ProjectsProvenance`).
 *
 * - `unsupported` -- this machine answered and does not advertise
 *   `projects.v1`. It has no Projects, and that is a listing, not a failure.
 * - `listed` -- it answered with its Projects, possibly none.
 * - `failed` -- it could not be asked, answered with something that is not a
 *   listing, or answered under a handshake it has since replaced. Nothing is
 *   known about its Projects, and nothing may be refused in its name.
 */
export type RemoteProjectsOutcome =
  | { kind: 'unsupported' }
  | { kind: 'listed'; projects: RemoteProject[] }
  | { kind: 'failed'; reason: string }

/**
 * Every Project one machine offers, carrying which machine that is
 * (MAR-2689).
 *
 * Shaped after `ProviderCatalog` on purpose, and for the same reason: a list of
 * Projects is only true of the machine it was read from, so a catalog that did
 * not say which machine that was is one the renderer could hand to a session
 * bound for another — the lie this era exists to stop (MAR-2619).
 *
 * Three facts that look alike as an empty list and are not:
 *
 * - `supported: false` — this machine does not advertise `projects.v1`. It has
 *   no Projects, and that is a listing, not a failure.
 * - `supported: true` with no projects — the machine answered and has none.
 * - `unreachableReason` — its Projects could not be read.
 */
export interface RemoteProjectCatalog {
  /** `'local'`, or the Endpoint id this catalog was read from. */
  executionHostId: string
  /**
   * Whether this machine advertises `projects.v1`.
   *
   * False is a positive claim — the machine answered and offers no Projects.
   * A machine whose Projects could not be read leaves it true and says why in
   * `unreachableReason`: a failure disproves no capability, and reporting one
   * as `supported: false` would state an absence the daemon never claimed.
   */
  supported: boolean
  projects: RemoteProject[]
  /**
   * Why this machine's Projects could not be read, or null when it listed
   * them.
   *
   * Two ways to fail and one field, because they lead to the same reading and
   * the reason says which: the machine could not be asked at all, or it was
   * asked and answered with something that is not a listing. What must never
   * happen is either one arriving as an empty listing — a machine that could
   * not answer has not said it has no Projects (MAR-2689).
   */
  unreachableReason: string | null
}
