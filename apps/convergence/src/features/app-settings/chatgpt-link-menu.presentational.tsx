import type { FC } from 'react'
import { ChevronDown, Copy, ExternalLink } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="outline" size="sm" className="min-h-10">
        {label}
        <ChevronDown className="ml-1.5 size-3.5" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onSelect={() => onChoose('open')}>
        <ExternalLink className="mr-2 size-3.5" aria-hidden="true" />
        {CHATGPT_LINK_ACTION_LABEL.open}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onChoose('copy')}>
        <Copy className="mr-2 size-3.5" aria-hidden="true" />
        {CHATGPT_LINK_ACTION_LABEL.copy}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)
