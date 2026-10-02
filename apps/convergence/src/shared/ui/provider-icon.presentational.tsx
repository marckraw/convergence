import { cn, Tooltip } from '@convergence/ui'
import { resolveProviderIcon, type ProviderBrand } from './provider-icon.pure'
import anthropic from './provider-logos/anthropic.svg'
import openai from './provider-logos/openai.svg'
import pi from './provider-logos/pi.svg'
import cursor from './provider-logos/cursor.svg'
import google from './provider-logos/google.svg'
import openrouter from './provider-logos/openrouter.svg'

const LOGOS: Record<ProviderBrand, string> = {
  anthropic,
  openai,
  pi,
  cursor,
  google,
  openrouter,
}

interface ProviderIconProps {
  providerId?: string | null
  vendorLabel?: string | null
  name?: string | null
  className?: string
  /**
   * What its tooltip says: the provider's name unless told otherwise; empty
   * when an enclosing control already supplies a tooltip.
   */
  title?: string
}

export function ProviderIcon({
  providerId,
  vendorLabel,
  name,
  className,
  title,
}: ProviderIconProps) {
  const { brand, initials, label } = resolveProviderIcon(
    providerId,
    vendorLabel,
    name,
  )
  return (
    <Tooltip label={title ?? label}>
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-4 shrink-0 items-center justify-center text-ink',
          className,
        )}
      >
        {brand ? (
          <span
            className="size-full bg-current"
            style={{
              maskImage: `url("${LOGOS[brand]}")`,
              maskSize: brand === 'pi' ? '170%' : 'contain',
              maskPosition: 'center',
              maskRepeat: 'no-repeat',
            }}
          />
        ) : (
          <span className="text-3xs font-semibold leading-none">
            {initials}
          </span>
        )}
      </span>
    </Tooltip>
  )
}
