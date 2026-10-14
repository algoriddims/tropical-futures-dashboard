import { Routes, Route } from 'react-router'
import Home from './pages/Home'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {/* single-screen app: any other path (a bookmarked or hosted sub-path) shows the terminal */}
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
