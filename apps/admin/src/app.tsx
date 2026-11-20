// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ApiError } from './api/client';
import { SessionProvider, useSession } from './auth/session';
import { Layout } from './components/layout';
import { EmptyState, Spinner } from './components/ui';
import { AssetsPage } from './pages/assets-page';
import { JobsPage } from './pages/jobs-page';
import { LoginPage } from './pages/login-page';
import { UploadsProvider } from './uploads/uploads';

// The asset page brings the video player with it, so it is loaded only when opened.
const AssetDetailPage = lazy(() =>
  import('./pages/asset-detail-page').then((module) => ({ default: module.AssetDetailPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      // Asking again does not help when the server refused the request.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

function Pages() {
  const { state } = useSession();

  if (state.status === 'loading') {
    return (
      <div className="login">
        <Spinner label="Signing in" />
      </div>
    );
  }
  if (state.status === 'signedOut') {
    return <LoginPage />;
  }

  return (
    <UploadsProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/assets" replace />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route
            path="assets/:id"
            element={
              <Suspense fallback={<Spinner label="Loading" />}>
                <AssetDetailPage />
              </Suspense>
            }
          />
          <Route path="jobs" element={<JobsPage />} />
          <Route
            path="*"
            element={<EmptyState title="Page not found">This address does not exist.</EmptyState>}
          />
        </Route>
      </Routes>
    </UploadsProvider>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <Pages />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
