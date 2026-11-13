import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { MobileHeader, MobileTabBar } from './mobile-nav';
import { PageFallback } from '@/components/ui/skeleton';

export default function AppShell() {
  return (
    <div className="app-canvas min-h-dvh">
      <Sidebar />
      <MobileHeader />
      <main className="lg:pl-[252px]">
        <div className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <MobileTabBar />
    </div>
  );
}
