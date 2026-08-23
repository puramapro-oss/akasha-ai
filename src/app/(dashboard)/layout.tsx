import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import BottomTabBar from '@/components/layout/BottomTabBar'
import SpiritualLayer from '@/components/shared/SpiritualLayer'
import LegalReconsentGate from '@/components/shared/LegalReconsentGate'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <Sidebar />
      <div className="lg:pl-64">
        <Topbar />
        <main className="mx-auto min-h-[calc(100vh-4rem)] w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pb-10 lg:pt-8">
          {children}
        </main>
      </div>
      <BottomTabBar />
      <SpiritualLayer />
      <LegalReconsentGate />
    </div>
  )
}
