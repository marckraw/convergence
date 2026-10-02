import { Code2, MessageSquareText, Satellite } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn, NavTab, NavTabs, tooltipAttributes } from '@convergence/ui'
import type { AppSurface } from '@/shared/types/app-surface.types'

interface SurfaceSwitcherProps {
  activeSurface: AppSurface
  /** Mission Control is on screen: then it, not Code or Chat, is the current place. */
  missionControlActive: boolean
  onSelectSurface: (surface: AppSurface) => void
  /** Absent when this window has no Mission Control. */
  onShowMissionControl?: () => void
  /**
   * `row`: the expanded sidebar's header, tooltips below. `rail`: the
   * collapsed rail, stacked, tooltips to the right.
   */
  placement: 'row' | 'rail'
}

type Place = {
  key: string
  label: string
  icon: ReactNode
  current: boolean
  onSelect: () => void
}

/**
 * Code, Chat and Mission Control: the shell's places, drawn once for the
 * header and the rail (NAV-3). They are NavTabs, so the one on screen says
 * aria-current="page" and is the raised chip (R7), and only one of them ever
 * is: Mission Control on screen is the current place, not the surface
 * beneath it.
 */
export function SurfaceSwitcher({
  activeSurface,
  missionControlActive,
  onSelectSurface,
  onShowMissionControl,
  placement,
}: SurfaceSwitcherProps) {
  const places: Place[] = [
    {
      key: 'code',
      label: 'Show code surface',
      icon: <Code2 aria-hidden />,
      current: !missionControlActive && activeSurface === 'code',
      onSelect: () => onSelectSurface('code'),
    },
    {
      key: 'chat',
      label: 'Show chat surface',
      icon: <MessageSquareText aria-hidden />,
      current: !missionControlActive && activeSurface === 'chat',
      onSelect: () => onSelectSurface('chat'),
    },
  ]
  if (onShowMissionControl) {
    places.push({
      key: 'mission-control',
      label: 'Show Mission Control',
      icon: <Satellite aria-hidden />,
      current: missionControlActive,
      onSelect: onShowMissionControl,
    })
  }
  const rail = placement === 'rail'
  return (
    <NavTabs
      aria-label="Surfaces"
      size={rail ? 'md' : 'sm'}
      className={cn(rail && 'flex-col')}
    >
      {places.map((place) => (
        <NavTab
          key={place.key}
          render={<button type="button" />}
          current={place.current}
          aria-label={place.label}
          onClick={place.onSelect}
          // Square, for an icon alone.
          className={rail ? 'w-control-md px-0' : 'w-control-sm px-0'}
          {...tooltipAttributes(place.label, {
            side: rail ? 'right' : 'bottom',
          })}
        >
          {place.icon}
        </NavTab>
      ))}
    </NavTabs>
  )
}
