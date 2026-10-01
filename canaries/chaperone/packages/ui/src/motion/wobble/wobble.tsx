// canary: ui-components-have-stories
// A motion primitive with no wobble.stories.tsx beside it: nobody sees it move, or checks that it
// stands still under reduced motion.
export function Wobble({ children }: { children: string }) {
  return <span className="inline-block motion-safe:animate-pop-in">{children}</span>
}
