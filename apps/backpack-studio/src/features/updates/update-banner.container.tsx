import { useEffect, useState } from 'react'
import { getUpdatesBridge } from '../../shared/api'
import type { UpdateState } from '../../../shared/updates.types'
import { UpdateBanner } from './update-banner.presentational'

export function StudioUpdateBanner() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const bridge = getUpdatesBridge()
  useEffect(() => {
    if (!bridge) return
    let active = true
    let receivedEvent = false
    const unsubscribe = bridge.subscribe((next) => {
      receivedEvent = true
      if (active) setState(next)
    })
    void bridge
      .getState()
      .then((next) => {
        if (active && !receivedEvent) setState(next)
      })
      .catch(() => {
        if (active) setState({ status: 'error' })
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [bridge])
  const invoke = (action: (() => Promise<void>) | undefined) => {
    void action?.().catch(() => setState({ status: 'error' }))
  }
  return (
    <UpdateBanner
      state={state}
      onDownload={() => invoke(bridge?.download)}
      onInstall={() => invoke(bridge?.install)}
      onCheck={() => invoke(bridge?.check)}
    />
  )
}
