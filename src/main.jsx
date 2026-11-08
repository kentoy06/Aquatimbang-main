import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Fonts are bundled with the site (no Google Fonts request needed).
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/playfair-display/800.css'
import App from './App.jsx'
import { ConfirmHost } from './components/ConfirmDialog.jsx'
import { installSessionGuard } from './api/session.js'

// Return to the login page whenever the server ends the session.
installSessionGuard()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <ConfirmHost />
  </StrictMode>,
)