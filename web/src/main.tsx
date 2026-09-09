import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Self-hosted (SIL OFL), latin subset only, four weights -- no Google Fonts / external request.
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import './theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
