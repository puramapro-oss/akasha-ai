import { createRoot } from 'react-dom/client'
import ChatPage from '../../../src/app/(dashboard)/dashboard/chat/page'
import CyclesPage from '../../../src/app/(dashboard)/dashboard/cycles/page'
import ToolsPage from '../../../src/app/(dashboard)/dashboard/tools/page'
import { useLocation } from './navigation'

function Harness() {
  const location = useLocation()
  if (location.startsWith('/dashboard/cycles')) return <CyclesPage />
  return location.startsWith('/dashboard/tools') ? <ToolsPage /> : <ChatPage />
}
createRoot(document.getElementById('root')!).render(<Harness />)
