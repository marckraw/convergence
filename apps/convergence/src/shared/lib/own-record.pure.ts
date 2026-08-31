/**
 * The value a record holds under a key *of its own*, or undefined.
 *
 * A plain `record[key]` walks the prototype chain, so a key of `'toString'` or
 * `'constructor'` -- and a key is rarely this code's own invention; it is an
 * id off the wire, a session field, an attention state -- resolves to an
 * inherited *function*. Truthy, so every `if (found)` beyond it takes the wrong
 * branch, and typed as the record's value type, so nothing downstream has any
 * reason to doubt it.
 *
 * A helper rather than a guard written at each site, because this is the third
 * time the class has appeared here: MAR-2590's `labelMap` reaching React as a
 * function, `EFFORT_LABELS` in the provider descriptors, and the catalog store
 * keyed by execution host id (MAR-2682). One form, and the wrong one stops
 * being convenient.
 */
export function ownRecordValue<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined
}
