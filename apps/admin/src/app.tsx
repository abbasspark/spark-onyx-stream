// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Compass } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router';
import { Toaster } from 'sonner';
import { ApiError } from './api/client';
import { titlesApi } from './api/endpoints';
import { SessionProvider, useSession } from './auth/session';
import { AppShell } from './components/app-shell';
import { ConfirmProvider } from './components/confirm';
import { Button } from './components/ui/button';
import { EmptyState, ErrorNote, Spinner } from './components/ui/display';
import { TooltipProvider } from './components/ui/overlay';
import { titlePath } from './lib/catalog';
import { LiveProvider } from './live/live';
import { AccountPage } from './pages/account-page';
import { AnalyticsPage } from './pages/analytics-page';
import { QualityPage } from './pages/quality-page';
import { NotificationsPage } from './pages/notifications-page';
import { LayoutPage } from './pages/layout-page';
import { EmailPage } from './pages/email-page';
import { ChannelsPage } from './pages/channels-page';
import { DeliveryPage } from './pages/delivery-page';
import { EdgesPage } from './pages/edges-page';
import { GuidePage } from './pages/guide-page';
import { RecordingsPage } from './pages/recordings-page';
import { BackupsPage } from './pages/backups-page';
import { DiagnosticsPage } from './pages/diagnostics-page';
import { P2pPage } from './pages/p2p-page';
import { CouponsPage } from './pages/coupons-page';
import { PrepaidCodesPage } from './pages/prepaid-codes-page';
import { PackagesPage } from './pages/packages-page';
import { PlansPage } from './pages/plans-page';
import { RevenuePage } from './pages/revenue-page';
import { AdminsPage } from './pages/admins-page';
import { ApiReferencePage } from './pages/api-reference-page';
import { AppsPage } from './pages/apps-page';
import { BrandingPage } from './pages/branding-page';
import { WebhookPage } from './pages/webhook-page';
import { WebhooksPage } from './pages/webhooks-page';
import { RolesPage } from './pages/roles-page';
import { TranslationsPage } from './pages/translations-page';
import { ApiKeysPage } from './pages/api-keys-page';
import { AssetsPage } from './pages/assets-page';
import { AuditPage } from './pages/audit-page';
import { CategoriesPage } from './pages/categories-page';
import { DashboardPage } from './pages/dashboard-page';
import { EncodingProfilesPage } from './pages/encoding-profiles-page';
import { JobsPage } from './pages/jobs-page';
import { LoginPage } from './pages/login-page';
import { TwoFactorRequiredScreen } from './components/two-factor';
import { StoragePage } from './pages/storage-page';
import { TitleEditorPage } from './pages/title-editor-page';
import { MoviesPage, SeriesPage } from './pages/titles-page';
import { CollectionEditorPage, CollectionsPage } from './pages/collections-page';
import { GenresPage } from './pages/genres-page';
import { ImportsPage } from './pages/imports-page';
import { PeoplePage } from './pages/people-page';
import { ViewersPage } from './pages/viewers-page';
import { ThemeProvider, useTheme } from './theme/theme';
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

/** /titles became /movies and /series. Saved links keep working, with their filters. */
function OldTitlesAddress() {
  const { search } = useLocation();
  const section = new URLSearchParams(search).get('type') === 'SERIES' ? '/series' : '/movies';
  return <Navigate replace to={`${section}${search}`} />;
}

/** A saved link to one title is sent on to the section the title belongs to. */
function OldTitleAddress() {
  const { id = '' } = useParams();
  const title = useQuery({
    queryKey: ['titles', 'detail', id],
    queryFn: ({ signal }) => titlesApi.get(id, signal),
  });
  if (title.data) {
    return <Navigate replace to={titlePath(title.data)} />;
  }
  return title.isPending ? <Spinner label="Loading" /> : <ErrorNote error={title.error} />;
}

function Pages() {
  const { state } = useSession();

  if (state.status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Signing in" />
      </div>
    );
  }
  if (state.status === 'signedOut') {
    return <LoginPage />;
  }
  // The API opens nothing else to this admin yet: neither does the panel.
  if (state.me.twoFactorSetupRequired) {
    return <TwoFactorRequiredScreen />;
  }

  return (
    <LiveProvider>
      <UploadsProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="quality" element={<QualityPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route
              path="assets/:id"
              element={
                <Suspense fallback={<Spinner label="Loading" />}>
                  <AssetDetailPage />
                </Suspense>
              }
            />
            <Route path="movies" element={<MoviesPage />} />
            <Route path="movies/:id" element={<TitleEditorPage />} />
            <Route path="series" element={<SeriesPage />} />
            <Route path="series/:id" element={<TitleEditorPage />} />
            <Route path="layout/:page" element={<LayoutPage />} />
            <Route path="layout" element={<Navigate to="/layout/home" replace />} />
            {/* The address from before other pages could be arranged. */}
            <Route path="home-page" element={<Navigate to="/layout/home" replace />} />
            <Route path="collections" element={<CollectionsPage />} />
            <Route path="collections/:id" element={<CollectionEditorPage />} />
            <Route path="people" element={<PeoplePage />} />
            <Route path="genres" element={<GenresPage />} />
            <Route path="imports" element={<ImportsPage />} />
            {/* Addresses from before movies and series had sections of their own. */}
            <Route path="titles" element={<OldTitlesAddress />} />
            <Route path="titles/:id" element={<OldTitleAddress />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="viewers" element={<ViewersPage />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="encoding-profiles" element={<EncodingProfilesPage />} />
            <Route path="storage" element={<StoragePage />} />
            <Route path="plans" element={<PlansPage />} />
            <Route path="packages" element={<PackagesPage />} />
            <Route path="coupons" element={<CouponsPage />} />
            <Route path="prepaid-codes" element={<PrepaidCodesPage />} />
            <Route path="channels" element={<ChannelsPage />} />
            <Route path="guide" element={<GuidePage />} />
            <Route path="recordings" element={<RecordingsPage />} />
            <Route path="delivery" element={<DeliveryPage />} />
            <Route path="edges" element={<EdgesPage />} />
            <Route path="p2p" element={<P2pPage />} />
            <Route path="revenue" element={<RevenuePage />} />
            <Route path="email" element={<EmailPage />} />
            <Route path="backups" element={<BackupsPage />} />
            <Route path="diagnostics" element={<DiagnosticsPage />} />
            <Route path="admins" element={<AdminsPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="branding" element={<BrandingPage />} />
            <Route path="api-reference" element={<ApiReferencePage />} />
            <Route path="apps" element={<AppsPage />} />
            <Route path="webhooks" element={<WebhooksPage />} />
            <Route path="webhooks/:id" element={<WebhookPage />} />
            <Route path="translations" element={<TranslationsPage />} />
            <Route path="api-keys" element={<ApiKeysPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route
              path="*"
              element={
                <EmptyState
                  icon={Compass}
                  title="Page not found"
                  action={
                    <Button asChild>
                      <Link to="/">Go to the dashboard</Link>
                    </Button>
                  }
                >
                  This address does not exist.
                </EmptyState>
              }
            />
          </Route>
        </Routes>
      </UploadsProvider>
    </LiveProvider>
  );
}

/** Message popups, in the colors of the current theme. */
function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="top-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'font-sans !rounded-lg !border !border-border !bg-popover !text-popover-foreground !shadow-lg',
          description: '!text-muted-foreground',
        },
      }}
    />
  );
}

/** The path the panel is served under, without the slash at the end. Empty at the root. */
const ROUTER_BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={250}>
          <BrowserRouter basename={ROUTER_BASE}>
            <SessionProvider>
              <ConfirmProvider>
                <Pages />
              </ConfirmProvider>
            </SessionProvider>
          </BrowserRouter>
          <ThemedToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
