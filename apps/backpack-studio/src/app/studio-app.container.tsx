import { useEffect, useState } from 'react'
import { HelloScreen } from '../features/daemon-handshake'
import { SignInContainer } from '../features/sign-in'
import { FirstRequest } from '../features/first-request'
import { Home } from '../features/home'
import { readConnection } from '../shared/api'
import type { StudioIdentity } from '../shared/ui'

export function StudioApp(): React.JSX.Element {
  const [identity, setIdentity] = useState<StudioIdentity | null>(null)
  const [home, setHome] = useState(false)
  const [developer, setDeveloper] = useState(false)
  const [connection, setConnection] = useState(() => readConnection())

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key.toLowerCase() === 'd' &&
        !event.repeat
      ) {
        event.preventDefault()
        setDeveloper((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (developer)
    return (
      <div className="studio-developer">
        <p>Design build · captured daemon fixture · Ctrl+Shift+D to return</p>
        <label>
          <input
            type="checkbox"
            checked={connection.status === 'unreachable'}
            onChange={(event) =>
              setConnection(readConnection(event.target.checked))
            }
          />{' '}
          Simulate an unreachable daemon
        </label>
        <HelloScreen />
      </div>
    )
  if (!identity) return <SignInContainer onSignedIn={setIdentity} />
  if (!home)
    return (
      <FirstRequest
        identity={identity}
        connection={connection}
        onSkip={() => setHome(true)}
      />
    )
  return <Home identity={identity} connection={connection} />
}
