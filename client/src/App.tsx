import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DemoPage from './pages/DemoPage'
import DemoBanner from './components/DemoBanner'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      {DEMO_MODE && <DemoBanner />}
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/demo" element={<DemoPage />} />
      </Routes>
    </BrowserRouter>
  )
}
