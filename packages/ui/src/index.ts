/**
 * `@convergence/ui`: the design system's public API (MAR-3610).
 *
 * Apps import from `@convergence/ui` and never from a file inside it; the
 * package's `exports` map has no door for anything else. Every name is
 * re-exported one by one, never with `export *`, so this file is the whole
 * list of what the package promises.
 */
export {
  Badge,
  type BadgeHue,
  type BadgeProps,
  type BadgeShape,
} from './components/badge/badge'
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
  Card,
  CardAction,
  type CardActionProps,
  type CardPadding,
  type CardProps,
  type CardSurface,
} from './components/card/card'
export { Chip, type ChipProps } from './components/chip/chip'
export {
  Code,
  CodeBlock,
  type CodeBlockHeight,
  type CodeBlockProps,
  type CodeProps,
} from './components/code-block/code-block'
export {
  CopyButton,
  type CopyButtonProps,
} from './components/copy-button/copy-button'
export {
  DescriptionItem,
  type DescriptionItemProps,
  DescriptionList,
  type DescriptionListDensity,
  type DescriptionListLayout,
  type DescriptionListProps,
} from './components/description-list/description-list'
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
export { Divider, type DividerProps } from './components/divider/divider'
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
  EmptyState,
  type EmptyStateLayout,
  type EmptyStateProps,
  type EmptyStateSize,
  type EmptyStateVariant,
} from './components/empty-state/empty-state'
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
  ListRow,
  type ListRowDensity,
  type ListRowProps,
} from './components/list-row/list-row'
export { MetaLine, type MetaLineProps } from './components/meta-line/meta-line'
export {
  Meter,
  type MeterProps,
  type MeterSize,
  type MeterThresholds,
} from './components/meter/meter'
export { Notice, type NoticeProps } from './components/notice/notice'
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
export {
  ResizeHandle,
  type ResizeHandleProps,
} from './components/resize-handle/resize-handle'
export {
  DragRegion,
  type DragRegionProps,
  ScreenHeader,
  type ScreenHeaderProps,
} from './components/screen-header/screen-header'
export { SearchableSelect } from './components/searchable-select/searchable-select.container'
export type {
  SearchableSelectAction,
  SearchableSelectItem,
  SearchableSelectProps,
} from './components/searchable-select/searchable-select.presentational'
export {
  SectionHeader,
  type SectionHeaderProps,
} from './components/section-header/section-header'
export {
  SectionLabel,
  type SectionLabelProps,
  sectionLabel,
} from './components/section-label/section-label'
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
  SettingsSection,
  type SettingsSectionProps,
} from './components/settings-section/settings-section'
export {
  PanelHeader,
  type PanelHeaderProps,
  SidePanel,
  SidePanelBody,
  type SidePanelBodyProps,
  type SidePanelProps,
  type SidePanelWidth,
} from './components/side-panel/side-panel'
export {
  StatusDot,
  type StatusDotProps,
  type StatusDotSize,
} from './components/status-dot/status-dot'
export {
  StatusPill,
  type StatusPillProps,
} from './components/status-pill/status-pill'
export { TextLink, type TextLinkProps } from './components/text-link/text-link'
export {
  Timestamp,
  type TimestampProps,
} from './components/timestamp/timestamp'
export {
  formatTimestamp,
  fullDateLabel,
  type TimestampFormat,
  type TimestampOptions,
} from './components/timestamp/timestamp.pure'
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
export { TONES, type Tone } from './lib/tone.styles'
export { useAppliedTheme } from './lib/use-applied-theme'
export { durationsMs, easings } from './motion/tokens'
export { layoutPx } from './styles/layout.tokens'
export { terminalTokens } from './styles/terminal.tokens'
export {
  Collapsible,
  CollapsiblePanel,
  type CollapsiblePanelProps,
  type CollapsibleProps,
  CollapsibleTrigger,
  type CollapsibleTriggerProps,
} from './motion/collapsible/collapsible'
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
