import './global.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StudioApp } from './studio-app.container'
import { StudioUpdateBanner } from '../features/updates'

const container = document.getElementById('root')
if (!container) throw new Error('Backpack Studio: no #root to mount into')

createRoot(container).render(
  <StrictMode>
    <StudioUpdateBanner />
    <StudioApp />
  </StrictMode>,
)
