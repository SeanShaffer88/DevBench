import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BottomDock } from './components/BottomDock';
import { CommandPalette } from './components/CommandPalette';
import { ConsentModal } from './components/ConsentModal';
import { ShortcutModal } from './components/ShortcutModal';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { WorkbenchProvider, useWorkbench } from './context/WorkbenchContext';
import HomeModule from './modules/HomeModule';

// Lazy-loaded optional workbench modules — not loaded at startup until visited!
const ProjectsModule = lazy(() => import('./modules/ProjectsModule'));
const CodeModule = lazy(() => import('./modules/CodeModule'));
const BuildRunModule = lazy(() => import('./modules/BuildRunModule'));
const TestModule = lazy(() => import('./modules/TestModule'));
const DebugModule = lazy(() => import('./modules/DebugModule'));
const GitModule = lazy(() => import('./modules/GitModule'));
const PackagesModule = lazy(() => import('./modules/PackagesModule'));
const ApiDataModule = lazy(() => import('./modules/ApiDataModule'));
const WindowsModule = lazy(() => import('./modules/WindowsModule'));
const SecurityModule = lazy(() => import('./modules/SecurityModule'));
const TeamModule = lazy(() => import('./modules/TeamModule'));
const SettingsModule = lazy(() => import('./modules/SettingsModule'));

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

const WorkbenchShell: React.FC = () => {
  const { activeModule, statusToast, settings, dockOpen } = useWorkbench();

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved =
      typeof localStorage !== 'undefined'
        ? Number(localStorage.getItem('devbench.sidebarWidth'))
        : NaN;
    return Number.isFinite(saved) && saved >= 170 && saved <= 380 ? saved : 215;
  });

  const [dockHeight, setDockHeight] = useState<number>(() => {
    const saved =
      typeof localStorage !== 'undefined'
        ? Number(localStorage.getItem('devbench.dockHeight'))
        : NaN;
    return Number.isFinite(saved) && saved >= 140 && saved <= 480 ? saved : 215;
  });

  const [draggingAxis, setDraggingAxis] = useState<'sidebar' | 'dock' | null>(null);

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('devbench.sidebarWidth', String(sidebarWidth));
    }
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('devbench.dockHeight', String(dockHeight));
    }
  }, [dockHeight]);

  useEffect(() => {
    if (!draggingAxis) return;
    const onMove = (e: MouseEvent) => {
      if (draggingAxis === 'sidebar') {
        setSidebarWidth(clamp(e.clientX, 170, 380));
      } else {
        setDockHeight(clamp(window.innerHeight - e.clientY, 140, 480));
      }
    };
    const onUp = () => setDraggingAxis(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingAxis]);

  const renderModule = () => {
    switch (activeModule) {
      case 'home':
        return <HomeModule />;
      case 'projects':
        return <ProjectsModule />;
      case 'code':
        return <CodeModule />;
      case 'build-run':
        return <BuildRunModule />;
      case 'test':
        return <TestModule />;
      case 'debug':
        return <DebugModule />;
      case 'git':
        return <GitModule />;
      case 'packages':
        return <PackagesModule />;
      case 'apis-data':
        return <ApiDataModule />;
      case 'windows':
        return <WindowsModule />;
      case 'security':
        return <SecurityModule />;
      case 'team':
        return <TeamModule />;
      case 'settings':
        return <SettingsModule />;
      default:
        return <HomeModule />;
    }
  };

  return (
    <div
      className="wb-shell"
      style={
        {
          '--sidebar-width': `${sidebarWidth}px`,
          '--dock-height': `${dockHeight}px`,
        } as React.CSSProperties
      }
    >
      <TopBar />
      <div className="wb-body">
        <Sidebar />
        {!settings.sidebarCollapsed && (
          <div
            role="separator"
            aria-label="Resize Module Sidebar"
            aria-orientation="vertical"
            aria-valuemin={170}
            aria-valuemax={380}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            className={`wb-splitter-vertical ${draggingAxis === 'sidebar' ? 'dragging' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setDraggingAxis('sidebar');
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setSidebarWidth((w) => clamp(w - 15, 170, 380));
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                setSidebarWidth((w) => clamp(w + 15, 170, 380));
              }
            }}
          />
        )}
        <div className="wb-center">
          <main className="wb-main" role="main" aria-label="Active Module Workspace">
            <Suspense
              fallback={
                <div className="card muted" style={{ padding: 24 }}>
                  Loading module bundle on demand...
                </div>
              }
            >
              {renderModule()}
            </Suspense>
          </main>
          <div
            role="separator"
            aria-label="Resize Bottom Output Dock"
            aria-orientation="horizontal"
            aria-valuemin={140}
            aria-valuemax={480}
            aria-valuenow={dockHeight}
            tabIndex={dockOpen ? 0 : -1}
            style={dockOpen ? undefined : { display: 'none' }}
            className={`wb-splitter-horizontal ${draggingAxis === 'dock' ? 'dragging' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setDraggingAxis('dock');
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setDockHeight((h) => clamp(h + 20, 140, 480));
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setDockHeight((h) => clamp(h - 20, 140, 480));
              }
            }}
          />
          <BottomDock />
        </div>
      </div>

      <CommandPalette />
      <ConsentModal />
      <ShortcutModal />

      {/* Screen-reader live region & toast banner */}
      <div aria-live="polite" role="status">
        {statusToast && (
          <div
            style={{
              position: 'fixed',
              bottom: 18,
              right: 20,
              zIndex: 1100,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--accent)',
              padding: '8px 14px',
              borderRadius: 8,
              boxShadow: 'var(--shadow-modal)',
              fontSize: '0.86rem',
            }}
          >
            {statusToast}
          </div>
        )}
      </div>
    </div>
  );
};

export const App: React.FC = () => (
  <WorkbenchProvider>
    <WorkbenchShell />
  </WorkbenchProvider>
);

export default App;
