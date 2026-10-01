/**
 * `@convergence/ui`: the design system's public API (MAR-3610).
 *
 * Apps import from `@convergence/ui` and never from a file inside it; the
 * package's `exports` map has no door for anything else. Every name is
 * re-exported one by one, never with `export *`, so this file is the whole
 * list of what the package promises.
 */
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  buttonVariants,
} from './components/button/button'
export { Checkbox, type CheckboxProps } from './components/checkbox/checkbox'
export {
  ChoiceCard,
  type ChoiceCardProps,
} from './components/choice-card/choice-card'
export {
  ChoiceField,
  type ChoiceFieldProps,
} from './components/choice-field/choice-field'
export {
  CopyButton,
  type CopyButtonProps,
} from './components/copy-button/copy-button'
export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './components/dialog/dialog'
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/dropdown-menu/dropdown-menu'
export {
  Field,
  FieldDescription,
  type FieldDescriptionProps,
  FieldError,
  type FieldErrorProps,
  FieldLabel,
  type FieldLabelProps,
  type FieldLabelVariant,
  type FieldProps,
} from './components/field/field'
export {
  Fieldset,
  FieldsetLegend,
  type FieldsetLegendProps,
  type FieldsetProps,
} from './components/fieldset/fieldset'
export {
  FormError,
  type FormErrorProps,
} from './components/form-error/form-error'
export {
  IconButton,
  type IconButtonProps,
} from './components/icon-button/icon-button'
export {
  Input,
  type InputProps,
  type InputType,
} from './components/input/input'
export { Kbd, type KbdProps } from './components/kbd/kbd'
export {
  NavTab,
  type NavTabProps,
  NavTabs,
  type NavTabsProps,
} from './components/nav-tabs/nav-tabs'
export {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './components/popover/popover'
export {
  RadioGroup,
  RadioGroupItem,
  type RadioGroupItemProps,
  type RadioGroupProps,
} from './components/radio-group/radio-group'
export {
  SearchField,
  type SearchFieldProps,
} from './components/search-field/search-field'
export { SearchableSelect } from './components/searchable-select/searchable-select.container'
export type {
  SearchableSelectAction,
  SearchableSelectItem,
  SearchableSelectProps,
} from './components/searchable-select/searchable-select.presentational'
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './components/select/select'
export {
  SegmentedControl,
  SegmentedControlItem,
  type SegmentedControlItemProps,
  type SegmentedControlProps,
} from './components/segmented-control/segmented-control'
export type { SegmentedSize } from './components/segmented-control/segmented-control.styles'
export { Switch, type SwitchProps } from './components/switch/switch'
export { SwitchRow } from './components/switch/switch-row'
export {
  Tabs,
  TabsList,
  type TabsListProps,
  TabsPanel,
  type TabsPanelProps,
  type TabsProps,
  TabsTab,
  type TabsTabProps,
  type TabsVariant,
} from './components/tabs/tabs'
export { Textarea, type TextareaProps } from './components/textarea/textarea'
export {
  ThemeScope,
  type ThemeScopeProps,
} from './components/theme-scope/theme-scope'
export {
  Toggle,
  type ToggleProps,
  type ToggleVariant,
} from './components/toggle/toggle'
export {
  Tooltip,
  type TooltipOptions,
  type TooltipProps,
  TooltipProvider,
  type TooltipProviderProps,
  type TooltipSide,
  tooltipAttributes,
} from './components/tooltip/tooltip'
export {
  TooltipCard,
  type TooltipCardProps,
} from './components/tooltip/tooltip-card'
export { tooltipSurface } from './components/tooltip/tooltip.styles'
export { cn } from './lib/cn.pure'
export type { ControlSize } from './lib/control-frame.styles'
export {
  focusRing,
  focusRingField,
  focusRingInset,
  focusRingWithin,
} from './lib/focus-ring.styles'
export { DRAG_REGION_STYLE, NO_DRAG_STYLE } from './lib/no-drag.styles'
export {
  applyTheme,
  readAppliedTheme,
  resolveTheme,
  type AppliedTheme,
  type ThemeChoice,
} from './lib/theme'
export { useAppliedTheme } from './lib/use-applied-theme'
export { durationsMs, easings } from './motion/tokens'
export { layoutPx } from './styles/layout.tokens'
export { terminalTokens } from './styles/terminal.tokens'
export {
  advanceDelayedLoading,
  type DelayedLoading,
  type DelayedLoadingTiming,
  idleLoading,
  isLoadingVisible,
  LOADING_DELAY_MS,
  LOADING_MIN_VISIBLE_MS,
  nextLoadingChange,
} from './motion/delayed-loading/delayed-loading.pure'
export { useDelayedLoading } from './motion/delayed-loading/useDelayedLoading'
export { popupMotion } from './motion/popup.styles'
export { press } from './motion/press/press.styles'
export { usePrefersReducedMotion } from './motion/reduced-motion'
export {
  Spinner,
  type SpinnerProps,
  type SpinnerSize,
} from './motion/spinner/spinner'
export { UiProvider, type UiProviderProps } from './ui-provider'
