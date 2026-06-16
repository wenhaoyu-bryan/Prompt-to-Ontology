import { Refine, Authenticated } from '@refinedev/core';
import { notificationProvider } from '@refinedev/antd';
import routerBindings, { CatchAllNavigate } from '@refinedev/react-router-v6';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { App as AntdApp } from 'antd';

import '@refinedev/antd/dist/reset.css';

import ThemeProvider from './providers/ThemeProvider';
import authProvider from './providers/authProvider';
import dataProvider from './providers/dataProvider';

import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/login';
import DashboardPage from './pages/dashboard';
import ObjectsPage from './pages/objects';
import GraphPage from './pages/graph';
import SchemaPage from './pages/schema';
import AgentPage from './pages/agent';
import ReviewQueuePage from './pages/review';
import SettingsPage from './pages/settings';
import PipelinePage from './pages/pipeline';
import GraphGovernancePage from './pages/graphGovernance';
import RuleStudioPage from './pages/ruleStudio';
import AgentTracePage from './pages/agentTrace';

import './i18n';

function ProtectedLayout() {
  return (
    <Authenticated v3LegacyAuthProviderCompatible={false} fallback={<CatchAllNavigate to="/login" />}>
      <AppLayout />
    </Authenticated>
  );
}

function AppInner() {
  return (
    <Refine
      dataProvider={dataProvider}
      authProvider={authProvider}
      routerProvider={routerBindings}
      notificationProvider={notificationProvider}
      resources={[
        { name: 'dashboard', list: '/dashboard', meta: { label: 'Dashboard' } },
        { name: 'objects',   list: '/objects',   meta: { label: 'Objects' } },
        { name: 'graph',     list: '/graph',     meta: { label: 'Graph' } },
        { name: 'schema',    list: '/schema',    meta: { label: 'Schema' } },
        { name: 'agent',     list: '/agent',     meta: { label: 'Agent' } },
        { name: 'review',    list: '/review',    meta: { label: 'Review Queue' } },
        { name: 'settings',  list: '/settings',  meta: { label: 'Settings' } },
      ]}
      options={{
        syncWithLocation: true,
        warnWhenUnsavedChanges: false,
        projectId: 'pto-demo',
      }}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/objects" element={<ObjectsPage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/schema" element={<SchemaPage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/review" element={<ReviewQueuePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/graph-governance" element={<GraphGovernancePage />} />
          <Route path="/rule-studio" element={<RuleStudioPage />} />
          <Route path="/agent-traces" element={<AgentTracePage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Refine>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AntdApp>
          <AppInner />
        </AntdApp>
      </BrowserRouter>
    </ThemeProvider>
  );
}
