import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

async function main() {
  if (import.meta.env.VITE_DEMO_MODE === 'true') {
    const { startWorker } = await import('./mocks/browser')
    await startWorker()
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

main()
