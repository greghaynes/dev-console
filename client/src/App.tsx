import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DemoPage from './pages/DemoPage'
import DemoBanner from './components/DemoBanner'
import WireframesIndex from './pages/wireframes/WireframesIndex'
import VariantA from './pages/wireframes/VariantA'
import VariantB from './pages/wireframes/VariantB'
import VariantC from './pages/wireframes/VariantC'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      {DEMO_MODE && <DemoBanner />}
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/wireframes" element={<WireframesIndex />} />
        <Route path="/wireframes/variant-a" element={<VariantA />} />
        <Route path="/wireframes/variant-b" element={<VariantB />} />
        <Route path="/wireframes/variant-c" element={<VariantC />} />
      </Routes>
    </BrowserRouter>
  )
}
