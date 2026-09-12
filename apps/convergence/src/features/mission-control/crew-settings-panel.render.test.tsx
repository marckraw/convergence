import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CrewSettingsPanel } from './crew-settings-panel.presentational'
import {
  DEFAULT_CREW_ROUND_CAP,
  DEFAULT_CREW_STALL_MINUTES,
  MIN_FLOW_RUN_HOP_CEILING,
} from './crew-loop.pure'

/**
 * The crew settings panel, rendered (the MAR-2280 law).
 *
 * A sentence that exists in a pure function and never reaches the screen is a
 * sentence the user does not have, and the pure tests beside it cannot tell
 * the difference. This is the half that can.
 */
function renderPanel(deliveryLimit: number | null) {
  const noop = vi.fn()
  render(
    <CrewSettingsPanel
      emoji={null}
      accentColor={null}
      onEmojiChange={noop}
      onAccentColorChange={noop}
      memberCount={2}
      includePositions={false}
      exporting={false}
      confirmingDelete={false}
      onIncludePositionsChange={noop}
      onExport={noop}
      onRequestDelete={noop}
      onCancelDelete={noop}
      onConfirmDelete={noop}
      updateError={null}
      savedName="Review loop"
      crewName="Review loop"
      members={[]}
      resolveName={() => null}
      deliveryLimit={deliveryLimit}
      attentionMinutes={null}
      defaultDeliveryLimit={DEFAULT_CREW_ROUND_CAP}
      defaultAttentionMinutes={DEFAULT_CREW_STALL_MINUTES}
      busy={false}
      running={false}
      batonNameProblem={null}
      batonNameDrafts={{}}
      onCrewNameChange={noop}
      onBatonNameEdit={noop}
      onBatonNameCommit={noop}
      onDeliveryLimitChange={noop}
      onAttentionMinutesChange={noop}
      onAddConversation={noop}
      onRemoveMember={noop}
      onClose={noop}
    />,
  )
}

describe('the delivery limit note about the run hard ceiling (R3, MAR-2966)', () => {
  it('tells a crew that raised its limit that the limit itself is the ceiling', () => {
    // Mutation that reds it: drop the note from the panel -- the box goes back
    // to saying a number whose consequence is written down nowhere.
    renderPanel(60)

    expect(
      screen.getByText(
        "This is also the run's hard ceiling. Inside this crew the limit hails and the wire stays armed; a run that crosses into another crew is disarmed past it.",
      ),
    ).toBeInTheDocument()
  })

  it('tells a crew on the default the number that actually disarms', () => {
    // An empty box means the default, and the default is under the floor: the
    // honest sentence names twenty rather than implying twelve switches a wire
    // off. Mutation that reds it: render R3's sentence unconditionally.
    renderPanel(null)

    expect(
      screen.getByText(
        `The run's hard ceiling is ${MIN_FLOW_RUN_HOP_CEILING}. Inside this crew the limit hails and the wire stays armed; a run that crosses into another crew is disarmed past ${MIN_FLOW_RUN_HOP_CEILING}.`,
      ),
    ).toBeInTheDocument()
  })
})
