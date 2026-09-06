export { useMissionControlView } from './use-mission-control-view'
export type { MissionControlViewState } from './use-mission-control-view'
export {
  DEFAULT_MISSION_CONTROL_VIEW,
  MISSION_CONTROL_VIEW_MODES,
  parseMissionControlView,
  readStoredViewMode,
  serializeMissionControlView,
} from './mission-control-view.pure'
export type {
  MissionControlViewMode,
  StoredMissionControlView,
} from './mission-control-view.pure'
export {
  NO_CREW_GROUP_KEY,
  formatCrewMemberCount,
  groupSessionCardsByCrew,
  sessionCrewGroupKey,
} from './session-crew-groups.pure'
export type { SessionCrewGroup } from './session-crew-groups.pure'
export { useMissionControlCards } from './use-mission-control-cards'
export type {
  MissionControlCards,
  MissionControlCardsInput,
} from './use-mission-control-cards'
export { SessionCardView } from './session-card.presentational'
export { SessionCrewPicker } from './session-crew-picker.container'
export { SessionCrewChips } from './session-crew-chips.presentational'
export { CrewDecorationPicker } from './crew-decoration-picker.presentational'
export { CrewHeaderMenu } from './crew-header-menu.container'
export {
  DEFAULT_CREW_ROUND_CAP,
  DEFAULT_CREW_STALL_MINUTES,
  batonConditionToken,
  batonNameRefusal,
  formatCrewLoopDefault,
} from './crew-loop.pure'

// The Canvas as a workspace (R10, R13): the toolbar, the three right-hand
// panels, and the pure rules behind them. Together these are the Canvas home
// for every capability the retired Crews view had.
export { CanvasToolbar } from './canvas-toolbar.presentational'
export {
  ConnectionInspector,
  GLOBAL_PROJECT_OPTION_ID,
  SPAWN_RECIPIENT_OPTION_ID,
} from './connection-inspector.presentational'
export { CrewSettingsPanel } from './crew-settings-panel.presentational'
export {
  AddConversationsPanel,
  ANY_PROJECT_OPTION_ID,
} from './add-conversations-panel.presentational'
export type { AddableConversation } from './add-conversations-panel.presentational'
export {
  CONVERSATION_RESET_COMMAND,
  EMPTY_SPAWN_SPEC,
  beforeDeliveryOptions,
  changeDraftRecipient,
  connectionDraftIsDirty,
  connectionDraftProblem,
  customOpenerNote,
  draftFromRelay,
  newConnectionDraft,
  openerForDraft,
  relayInputFromDraft,
} from './connection-draft.pure'
export type {
  BeforeDeliveryMode,
  BeforeDeliveryOption,
  ConnectionCondition,
  ConnectionDraft,
  ConnectionRecipient,
  ConnectionSpawnSpec,
} from './connection-draft.pure'
export {
  CONNECT_MODE_OFF,
  cancelConnectMode,
  connectModeHint,
  pickConnectCard,
  toggleConnectMode,
} from './connect-mode.pure'
export type { ConnectModeResult, ConnectModeState } from './connect-mode.pure'

// Routing (R11): where a wire leaves, where it arrives, and how it gets there.
export {
  ROUTE_CLEARANCE,
  ROUTE_GRID,
  ROUTE_STUB,
  chooseRouteSides,
  rectCenter,
  routeAround,
  routeEntersRect,
  routeLabelPoint,
  routePath,
  segmentHitsRect,
  sidePoint,
  simplify,
} from './canvas-route.pure'
export type { RoutePoint, RouteRect, RouteSide } from './canvas-route.pure'

// History under the canvas (R3, R12): the words, the panel, the event panel.
export { HistoryPanel } from './history-panel.presentational'
export {
  HISTORY_TONE_BORDER,
  HISTORY_TONE_TEXT,
  HistoryEventRowView,
} from './history-event-row.presentational'
export { HistoryFact } from './history-fact.presentational'
export {
  HistoryEventInspector,
  RUN_LAP_DELIVERY_GLOSSARY,
} from './history-event-inspector.presentational'
export type { RecordedEventFacts } from './history-event-inspector.presentational'
export {
  HISTORY_FILTERS,
  appendRunPage,
  buildHailEventRow,
  buildHopEventRow,
  buildRunEvents,
  buildRunHighlight,
  buildRunRow,
  filterRuns,
  formatEventTime,
  formatRunStatusLine,
  formatRunSummary,
  formatRunTime,
  historyOutcomeTone,
  historyOutcomeWord,
  historyPanelState,
  runStartingStation,
  runTone,
} from './run-history.pure'
export type {
  HistoryEventRow,
  HistoryFilter,
  HistoryLapGroup,
  HistoryPanelState,
  HistoryRunRow,
  HistoryTone,
} from './run-history.pure'
export { RelayHopTrail } from './relay-hop-trail.container'
export { RelayHopRow } from './relay-hop-row.presentational'
export {
  PULSE_ALARM_COLOR,
  WIRE_PULSE_MS,
  buildWirePulses,
  collectNewHops,
  pulseWireColor,
  pulseWireWidth,
} from './canvas-pulse.pure'
export type { WirePulse } from './canvas-pulse.pure'
export {
  ALARMING_RELAY_OUTCOMES,
  buildRelayHopLine,
  buildSessionWireHint,
  countAlarmingHops,
  formatAlarmSummary,
  formatHopCount,
  formatHopTime,
  formatRelayHopOutcome,
  isAlarmingHop,
  relayHopTone,
} from './relay-hop.pure'
export type {
  RelayHopLine,
  RelayHopTone,
  SessionWireHint,
} from './relay-hop.pure'
export {
  EMPTY_RELAY_DRAFT,
  EMPTY_SPAWN_DRAFT,
  MISSING_SESSION_LABEL,
  relayConditionMarker,
  buildRelayEndpointOptions,
  buildRelaySentence,
  formatArmedLabel,
  formatRelayCount,
  isSavableRelayDraft,
  relayDraftProblem,
} from './relay-sentence.pure'
export type {
  RelayDraft,
  RelayEndpointLabel,
  RelayEndpointOption,
  RelaySentence,
  RelaySpawnDraft,
} from './relay-sentence.pure'
export {
  CREW_ACCENT_COLORS,
  CREW_EMOJI_CHOICES,
  CREW_SEARCH_THRESHOLD,
  crewsHoldingSession,
  filterCrewsByQuery,
  formatCrewTriggerLabel,
  isValidCrewName,
} from './session-crew-picker.pure'
export type { CrewAccentChoice } from './session-crew-picker.pure'
export { buildSessionCards } from './mission-control-cards.pure'
export { SessionStateChips } from './session-state-chips.presentational'
export { SessionFacetPicker } from './session-facet-picker.container'
export {
  EMPTY_SESSION_CARD_FILTER,
  GLOBAL_SESSION_PROJECT_KEY,
  filterSessionCards,
  filterSessionCardsExcept,
  getSessionCardProjectKey,
  isEmptySessionCardFilter,
  matchesSessionCardQuery,
  toggleFilterId,
  toggleSessionCardState,
} from './session-card-filter.pure'
export type {
  SessionCardFilter,
  SessionCardFilterDimension,
} from './session-card-filter.pure'
export {
  buildCrewFacets,
  buildProjectFacets,
  buildProviderFacets,
  filterFacetOptions,
  formatFacetSummary,
} from './session-card-facets.pure'
export type {
  SessionCardCrewFacetOption,
  SessionCardFacetOption,
} from './session-card-facets.pure'
export {
  SESSION_CARD_ORDER_PRESETS,
  formatSessionCardOrderPreset,
  orderSessionCards,
} from './session-card-order.pure'
export type { SessionCardOrderPreset } from './session-card-order.pure'
export {
  SESSION_CARD_STATES,
  classifySessionCardState,
  countSessionCardStates,
  formatSessionCardState,
} from './session-card-state.pure'
export type {
  SessionCardState,
  SessionCardStateCounts,
} from './session-card-state.pure'
export { formatSessionCardActivity } from './session-card-activity.pure'
export { CARD_ATTENTION_STYLES, STATUS_DOT_STYLES } from './session-card.styles'
export {
  CANVAS_CHAIR_NODE_HEIGHT,
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  CANVAS_SPAWN_NODE_HEIGHT,
  ARMED_WIRE_FALLBACK_COLOR,
  CHAIR_NODE_EMOJI,
  CHAIR_NODE_LABEL,
  DISARMED_WIRE_COLOR,
  EMPTY_CANVAS_MESSAGE,
  SAFETY_EDGE_LABEL,
  TERMINAL_EDGE_LABEL,
  assignFlowColumns,
  buildCanvasGraph,
  chairNodeId,
  crewLocalPosition,
  formatSpawnNodeSpec,
  resolveWireColor,
  spawnNodeId,
} from './canvas-graph.pure'
export type {
  CanvasChairNode,
  CanvasCrewCluster,
  CanvasEdge,
  CanvasEdgeKind,
  CanvasGraph,
  CanvasSessionNode,
  CanvasSpawnNode,
} from './canvas-graph.pure'
export type { SessionCard } from './mission-control.types'
