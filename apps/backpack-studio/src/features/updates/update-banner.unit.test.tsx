import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { UpdateBanner } from './update-banner.presentational'

afterEach(cleanup)
it('downloaded banner restarts on request — mutation: hide downloaded state or detach restart', () => {
  const install = vi.fn()
  render(
    <UpdateBanner
      state={{ status: 'downloaded', version: '0.2.0' }}
      onInstall={install}
      onDownload={vi.fn()}
      onCheck={vi.fn()}
    />,
  )
  expect(screen.getByRole('status').textContent).toContain('0.2.0 is ready')
  fireEvent.click(screen.getByRole('button', { name: 'Restart to update' }))
  expect(install).toHaveBeenCalledOnce()
})
it('available banner downloads on request — mutation: detach download', () => {
  const download = vi.fn()
  render(
    <UpdateBanner
      state={{ status: 'available', version: '0.2.0' }}
      onInstall={vi.fn()}
      onDownload={download}
      onCheck={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Download update' }))
  expect(download).toHaveBeenCalledOnce()
})
it('error banner offers retry — mutation: detach retry', () => {
  const check = vi.fn()
  render(
    <UpdateBanner
      state={{ status: 'error' }}
      onInstall={vi.fn()}
      onDownload={vi.fn()}
      onCheck={check}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
  expect(check).toHaveBeenCalledOnce()
})
