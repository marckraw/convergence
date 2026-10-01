import { act, fireEvent, screen, within } from '@testing-library/react'

/**
 * Answers the app's confirmation (MAR-3616, R5): the ConfirmDialog that
 * `useConfirm()` opens, found as the alertdialog it is, and its button named
 * `label` pressed ("Delete session", or "Cancel"). Needs the app's
 * `UiProvider` (which hosts the confirmations) above what is rendered.
 */
export async function answerConfirm(label: string | RegExp): Promise<void> {
  const question = await screen.findByRole('alertdialog')
  await act(async () => {
    fireEvent.click(within(question).getByRole('button', { name: label }))
  })
}
