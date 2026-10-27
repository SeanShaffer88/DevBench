import React, { Suspense, lazy } from 'react';
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

const WorkbenchShell: React.FC = () => {
  const { activeModule, statusToast } = useWorkbench();

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
    <div className="wb-shell">
      <TopBar />
      <div className="wb-body">
        <Sidebar />
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
