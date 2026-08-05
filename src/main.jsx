import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initTheme } from './lib/theme'
import { initReduceMotion } from './lib/motion'
import { initTextSize } from './lib/textSize'

initTheme()
initReduceMotion()
initTextSize()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
