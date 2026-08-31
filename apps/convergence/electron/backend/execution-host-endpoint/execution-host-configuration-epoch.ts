/**
 * What an Endpoint's daemon is understood to be, as a number the renderer can
 * compare (MAR-2689 rounds 6 and 8).
 *
 * The renderer cannot tell one credential from another and must not learn how:
 * a token never crosses the preload boundary, so the catalog source it keys
 * every cached answer by was `${id}\0${baseUrl}` and blind to a rotation. A
 * daemon answering under token A could therefore land, be shown, be recorded
 * and be sent, under token B's still-equal source — the provenance
 * `daemonConfigurationFingerprint` includes the token precisely to prevent.
 *
 * An epoch closes that without revealing anything. It is an integer, and the
 * only thing recoverable from it is how many times this Endpoint's machine
 * stopped being the one it was: not the token, not its length, not whether one
 * exists. What the renderer needs is exactly that much — "the machine behind
 * this id is not the one you asked" — so every answer keyed by the old epoch
 * goes out of force at the read.
 *
 * One ledger, two inputs, one carrier. An answer derived from a daemon depends
 * on *identity* and on *capability*, and the epoch moves when either stops
 * being what it was: a base URL or token change (`configuration`), or a machine
 * upgraded at the same address that no longer advertises what it did
 * (`capabilities`, MAR-2689 round 8). Two counters would have been two facts
 * for the renderer to hold from two different moments; one counter with two
 * inputs cannot disagree with itself. Each input is compared against its own
 * last value, so a change in one is not read as a change in the other by the
 * mere fact that the two fingerprints differ.
 *
 * Every input is a fingerprint somebody actually resolved or heard. Bumping it
 * from the settings write instead would be a second encoding of "what is in
 * force" — and the two would agree only until one of them changed, which in
 * this codebase is a rule that drifts.
 */
export class ExecutionHostConfigurationEpochs {
  /**
   * The last value observed for each of an Endpoint's inputs, and the epoch
   * they have opened between them.
   *
   * The values are kept because the epoch is a *change* count, not a call
   * count: every wire call resolves a connection and every listing lands a
   * handshake, so an epoch that moved on each observation would invalidate
   * every catalog on every turn.
   */
  private readonly observed = new Map<
    string,
    { inputs: Map<ExecutionHostConfigurationInput, string>; epoch: number }
  >()

  /**
   * Records what one of an Endpoint's inputs was just observed to be, moving
   * its epoch when that is not what the same input was last observed to be.
   *
   * The first observation of an input opens nothing: nothing has changed yet,
   * and an endpoint nobody has dialled reads 0 too, so neither a first resolve
   * nor a first listing throws away the catalog it just fetched.
   */
  observe(
    endpointId: string,
    input: ExecutionHostConfigurationInput,
    value: string,
  ): void {
    const known = this.observed.get(endpointId)
    if (!known) {
      this.observed.set(endpointId, {
        inputs: new Map([[input, value]]),
        epoch: 0,
      })
      return
    }
    const last = known.inputs.get(input)
    known.inputs.set(input, value)
    if (last === undefined || last === value) return
    known.epoch += 1
  }

  /** The epoch in force for one Endpoint; 0 for one never observed. */
  epochFor(endpointId: string): number {
    return this.observed.get(endpointId)?.epoch ?? 0
  }
}

/**
 * The facts an Endpoint's epoch counts changes in.
 *
 * Named rather than positional so that adding a third input is a compile-time
 * decision about what an answer depends on, and so the two that exist cannot be
 * compared against each other: they are different fingerprints of different
 * things, and one ledger keyed by endpoint alone would read every alternation
 * between them as a change.
 */
export type ExecutionHostConfigurationInput = 'configuration' | 'capabilities'
