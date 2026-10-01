/**
 * How an error reads (MAR-3616 DS3c), under a field (FieldError) or over a
 * whole form (FormError): the danger ink at 12 px, today's most common error
 * line (`text-xs text-destructive`), on the ink role so it clears 4.5:1. One
 * line of it is 16 px tall (`min-h-4`), the room a FieldError keeps.
 */
export const errorText = 'text-xs text-danger-ink transition-opacity'
