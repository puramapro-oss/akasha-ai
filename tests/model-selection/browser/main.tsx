import { createRoot } from 'react-dom/client'
import ChatPage from '../../../src/app/(dashboard)/dashboard/chat/page'
import ToolsPage from '../../../src/app/(dashboard)/dashboard/tools/page'
import { useLocation } from './navigation'

function Harness() {
  const location = useLocation()
  return location.startsWith('/dashboard/tools') ? <ToolsPage /> : <ChatPage />
}
createRoot(document.getElementById('root')!).render(<Harness />)
