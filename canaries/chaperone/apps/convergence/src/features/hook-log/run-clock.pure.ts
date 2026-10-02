// canary: use-timestamp
// Times written by hand four ways, each one use-timestamp reports: an
// Intl.DateTimeFormat, a toLocaleDateString, a Date's own toLocaleString, and
// a toLocaleString whose options name a date's parts. A number's
// toLocaleString (the last line) is a count, not a time, and is left alone.
const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit' })

export const runDay = (at: Date): string =>
  at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export const runMoment = (at: string): string => new Date(at).toLocaleString()

export const runMonth = (at: Date): string =>
  at.toLocaleString('en-GB', {
    month: 'short',
  })

export const runHour = (at: Date): string => clock.format(at)

export const runCount = (count: number): string => count.toLocaleString('en-US')
