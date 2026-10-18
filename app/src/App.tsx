import type { CSSProperties } from 'react';
import { StudioProvider, useStudio } from './state/StudioContext';
import { TopBar } from './components/TopBar';
import { ToolRail } from './components/ToolRail';
import { Stage } from './components/Stage';
import { Timeline } from './components/Timeline';
import { LeftPanel } from './components/left-panel/LeftPanel';
import { CommandPalette } from './components/CommandPalette';
import { ExportDialog } from './components/ExportDialog';
import { TemplatesDialog } from './components/TemplatesDialog';
import { ArtboardsDialog } from './components/ArtboardsDialog';
import { LocalModelsDialog } from './components/LocalModelsDialog';
import { ReferenceVideoDialog } from './components/ReferenceVideoDialog';
import { McpServerDialog } from './components/McpServerDialog';
import { CommandInterpreterDialog } from './components/CommandInterpreterDialog';
import { AiGenerateDialog } from './components/AiGenerateDialog';
import { HomeScreen } from './components/HomeScreen';
import { ISLAND_THEME } from './theme/theme';
import './App.css';

function StudioShell() {
  const { state, dir } = useStudio();

  const rootStyle: CSSProperties = {
    ...(ISLAND_THEME.vars as CSSProperties),
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100vh',
    minWidth: 880,
    background: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: 'var(--font)',
    fontSize: 13,
    lineHeight: 1.4,
    overflow: 'hidden',
  };

  return (
    <div dir={dir} lang={state.lang} style={rootStyle}>
      <TopBar />

      {state.screen === 'editor' && (
        <div data-screen-label="Editor" style={{ flex: 1, minHeight: 0, display: 'flex', gap: 'var(--gap)', padding: 'var(--pad)' }}>
          <ToolRail />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
            <Stage />
            <Timeline />
          </div>
          <LeftPanel />
        </div>
      )}

      {state.screen === 'home' && <HomeScreen />}

      <CommandPalette />
      <ExportDialog />
      <TemplatesDialog />
      <ArtboardsDialog />
      <LocalModelsDialog />
      <ReferenceVideoDialog />
      <McpServerDialog />
      <CommandInterpreterDialog />
      <AiGenerateDialog />
    </div>
  );
}

export default function App() {
  return (
    <StudioProvider>
      <StudioShell />
    </StudioProvider>
  );
}
