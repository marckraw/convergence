import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/shared/lib/cn.pure'

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 2, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-xl border border-border/80 bg-popover/95 px-3 py-2 text-xs text-popover-foreground shadow-xl backdrop-blur-xl motion-safe:data-[side=bottom]:animate-slide-in-top motion-safe:data-[side=left]:animate-slide-in-right motion-safe:data-[side=right]:animate-slide-in-left motion-safe:data-[side=top]:animate-slide-in-bottom',
        'animate-pop-in motion-safe:data-[state=closed]:animate-pop-out motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
