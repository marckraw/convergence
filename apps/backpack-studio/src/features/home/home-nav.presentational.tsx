import { Button, sidebarIcon } from '../../shared/ui'
import { INERT_CONTROL_TITLE } from './home.model'
import type { HomeNavProps } from './home.types'

export function HomeNav({
  identity,
  connection,
  conversations,
  selectedId,
  onNew,
  onSelect,
}: HomeNavProps): React.JSX.Element {
  const connected = connection.status === 'connected'
  return (
    <nav className="studio-nav" aria-label="Conversations">
      <div className="studio-nav-header">
        <div className="studio-nav-wordmark">
          <p>backpack</p>
          <p>studio</p>
        </div>
        <button
          className="studio-sidebar-toggle"
          type="button"
          title={INERT_CONTROL_TITLE}
          aria-label="Toggle sidebar"
          aria-disabled="true"
        >
          <img src={sidebarIcon} width={20} height={20} alt="" />
        </button>
      </div>
      <Button variant="filled" size="regular" onClick={onNew}>
        + New conversation
      </Button>
      <button
        className="studio-nav-item studio-inbox"
        type="button"
        title={INERT_CONTROL_TITLE}
        aria-disabled="true"
      >
        <span>Inbox</span>
        <span>
          {
            conversations.filter(
              (conversation) => conversation.status !== 'running',
            ).length
          }
        </span>
      </button>
      <button
        className="studio-nav-item"
        type="button"
        title={INERT_CONTROL_TITLE}
        aria-disabled="true"
      >
        All conversations
      </button>
      <button
        className="studio-nav-item studio-small"
        type="button"
        title={INERT_CONTROL_TITLE}
        aria-disabled="true"
      >
        Search conversations
      </button>
      <button
        className="studio-nav-item"
        type="button"
        title={INERT_CONTROL_TITLE}
        aria-disabled="true"
      >
        Library
      </button>
      <p className="studio-nav-caption">RECENT</p>
      {conversations.map((conversation) => (
        <button
          className="studio-nav-recent"
          key={conversation.id}
          type="button"
          aria-current={selectedId === conversation.id ? 'page' : undefined}
          onClick={() => onSelect(conversation.id)}
        >
          <span>{conversation.title}</span>{' '}
          <span>
            {conversation.status === 'running'
              ? 'Working'
              : conversation.status === 'idle'
                ? 'Done'
                : 'Refused'}
          </span>
        </button>
      ))}
      <div className="studio-nav-space" />
      <button
        className="studio-remote"
        type="button"
        title={INERT_CONTROL_TITLE}
        aria-disabled="true"
      >
        <span className="studio-nav-caption">REMOTE ASSISTANT</span>
        <span>{connection.endpointName} ⌄</span>
        <span
          role="status"
          className={`studio-nav-caption ${connected ? 'studio-connection-connected' : ''}`}
        >
          {connected ? '● Connected' : '○ Not connected'}
        </span>
      </button>
      <button
        className="studio-nav-item studio-small"
        type="button"
        title={INERT_CONTROL_TITLE}
        aria-disabled="true"
      >
        Help from GCS
      </button>
      <button
        className="studio-account"
        type="button"
        title={INERT_CONTROL_TITLE}
        aria-disabled="true"
      >
        <span className="studio-avatar">{identity.initials}</span>
        <span className="studio-account-text">
          <span>{identity.name}</span>
          <span className="studio-nav-caption">Account ⌄</span>
        </span>
      </button>
    </nav>
  )
}
