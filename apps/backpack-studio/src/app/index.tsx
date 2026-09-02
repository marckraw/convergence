import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StudioShell } from '../widgets/studio-shell'

const container = document.getElementById('root')
if (!container) throw new Error('Backpack Studio: no #root to mount into')

createRoot(container).render(
  <StrictMode>
    <StudioShell />
  </StrictMode>,
)
