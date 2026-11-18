import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './i18n'
import './index.css'

// No Safari do iPhone, o :active (botão que cresce, linha que acende) só funciona com um ouvinte de toque.
document.addEventListener('touchstart', () => {}, { passive: true })

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root não encontrado em index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
