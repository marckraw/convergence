import type { FC } from 'react'
import { ChevronDown, Copy, ExternalLink } from 'lucide-react'
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from '@convergence/ui'
import {
  CHATGPT_LINK_ACTION_LABEL,
  type ChatGptLinkAction,
} from './chatgpt-app-sign-in.pure'

interface ChatGptLinkMenuProps {
  label: string
  onChoose: (action: ChatGptLinkAction) => void
}

/**
 * A ChatGPT button that asks where the link goes (MAR-3486): the default
 * browser, or the clipboard for a browser profile signed in to ChatGPT as
 * this account.
 */
export const ChatGptLinkMenu: FC<ChatGptLinkMenuProps> = ({
  label,
  onChoose,
}) => (
  <Menu>
    <MenuTrigger
      render={
        <Button type="button" variant="secondary">
          {label}
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </Button>
      }
    />
    <MenuContent align="end">
      <MenuItem onClick={() => onChoose('open')}>
        <ExternalLink className="size-3.5" aria-hidden="true" />
        {CHATGPT_LINK_ACTION_LABEL.open}
      </MenuItem>
      <MenuItem onClick={() => onChoose('copy')}>
        <Copy className="size-3.5" aria-hidden="true" />
        {CHATGPT_LINK_ACTION_LABEL.copy}
      </MenuItem>
    </MenuContent>
  </Menu>
)
