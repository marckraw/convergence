/** Regular OS metadata files do not represent conversation content. */
export function isAccountHistoryOsJunk(name: string): boolean {
  return name === '.DS_Store' || name === 'Thumbs.db' || name === '.localized'
}
