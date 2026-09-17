/** Whether the wave column is open or collapsed to its rail (R4). */
export type WavePanelMode = 'open' | 'rail'

/**
 * Reads a stored panel mode. Storage outlives code: anything this build does
 * not know reads as `open`, so the column is never lost behind a bad value.
 */
export function parseWavePanelMode(raw: string | null): WavePanelMode {
  return raw === 'rail' ? 'rail' : 'open'
}

export function serializeWavePanelMode(mode: WavePanelMode): string {
  return mode
}

/**
 * Whether the docked column steps aside (lap 2, B): while Mission Control
 * shows its own Waves tab, the column would be the same board twice -- two
 * `Waves` landmarks announcing one outage.
 */
export function isWaveColumnHidden(input: {
  missionControlActive: boolean
  missionControlMode: string | null
}): boolean {
  return input.missionControlActive && input.missionControlMode === 'waves'
}
