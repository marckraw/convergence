import type { UpdateState } from '../../../shared/updates.types'

interface Props {
  state: UpdateState
  onDownload(): void
  onInstall(): void
  onCheck(): void
}

export function UpdateBanner({ state, onDownload, onInstall, onCheck }: Props) {
  if (state.status === 'idle' || state.status === 'checking') return null
  return (
    <aside className="studio-update-banner" aria-label="Studio update">
      <span role="status">
        {state.status === 'available' &&
          `Backpack Studio ${state.version} is available.`}
        {state.status === 'downloading' && 'Downloading the Studio update…'}
        {state.status === 'downloaded' &&
          `Backpack Studio ${state.version} is ready.`}
        {state.status === 'error' &&
          'Studio could not check for or download an update.'}
      </span>
      {state.status === 'available' && (
        <button type="button" onClick={onDownload}>
          Download update
        </button>
      )}
      {state.status === 'downloaded' && (
        <button type="button" onClick={onInstall}>
          Restart to update
        </button>
      )}
      {state.status === 'error' && (
        <button type="button" onClick={onCheck}>
          Check again
        </button>
      )}
    </aside>
  )
}
