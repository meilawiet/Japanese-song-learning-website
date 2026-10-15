import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './desktop.css'
import './desktopThemes.css'
import './singAlongPlayer.css'
if (window.utaDesktop) document.documentElement.classList.add('uta-desktop')
import { loadAiSettingsFromDevice } from './lib/aiSettings'

function renderApp() { createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

}
if (window.utaDesktop) loadAiSettingsFromDevice().catch(() => {}).finally(renderApp)
else renderApp()
