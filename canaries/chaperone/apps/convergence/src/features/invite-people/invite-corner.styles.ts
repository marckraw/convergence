// canary: no-magic-values
// A control that moves beside a column once its container is wide enough, at a container size
// typed in place, as the Actions button's row was before CONV-29 (DS8): a container query's size is
// a --container-* of the theme's, worn as @min-actions-beside:, never @min-[56rem]:.
export const inviteCorner =
  'relative mt-2 @min-[56rem]:absolute @min-[56rem]:right-4 @max-[40rem]:hidden'
