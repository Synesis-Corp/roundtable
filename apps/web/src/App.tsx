import { Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { storage } from './lib/storage';
import Layout from './components/Layout';
import ChatPage from './pages/ChatPage';

const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));

/**
 * Gate for the authenticated app. Without a token there is nothing functional
 * to show (no conversations, no providers), so we send the user to /login
 * instead of rendering an empty chat shell and a sidebar full of dead options.
 */
function RequireAuth() {
  const token = storage.get('token');
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/**
 * Inverse of RequireAuth: an already-authenticated user has no business on the
 * login/register screens, so bounce them back into the app instead of letting
 * them re-authenticate (or get confused by a form they don't need).
 */
function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const token = storage.get('token');
  if (token) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * Forces ChatPage to remount whenever the conversationId in the URL changes.
 *
 * Without this `key`, React Router DOM reuses the same ChatPage instance
 * across `/c/A` → `/c/B` navigations (both routes map to the same component).
 * The local state — including `useSSE.streaming` and the active AbortController
 * — therefore persists across conversations. Concretely: if a user starts a
 * stream in chat A that hangs on a network error, then navigates to chat B
 * (accepting the "response in progress" confirmation), the leftover
 * `streaming=true` state from chat A makes chat B render a phantom
 * "Respondiendo…" indicator on its last assistant message. The remount
 * guarantees a clean slate per conversation.
 */
function ChatPageRoute() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  return <ChatPage key={conversationId ?? 'new'} />;
}

/** Full-height shell for the standalone auth pages (no chat sidebar). */
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--bg-app)' }}>
      {children}
    </div>
  );
}

/** Lightweight fallback for lazy-loaded routes. Keeps the app shell visible
 *  (sidebar / topbar) so navigation feels stable while a chunk loads. */
function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-4)',
        fontSize: 13,
      }}
    >
      {t('shell.loading')}
    </div>
  );
}

function App() {
  return (
    <Routes>
      {/* Public auth routes — rendered without the chat layout. A logged-in
          user is redirected to the app instead of seeing the auth forms.
          The auth pages are lazy-loaded so the Google SDK only downloads
          when a user actually needs to sign in. */}
      <Route
        path="/login"
        element={
          <RedirectIfAuth>
            <AuthShell>
              <Suspense fallback={<RouteFallback />}>
                <LoginPage />
              </Suspense>
            </AuthShell>
          </RedirectIfAuth>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuth>
            <AuthShell>
              <Suspense fallback={<RouteFallback />}>
                <RegisterPage />
              </Suspense>
            </AuthShell>
          </RedirectIfAuth>
        }
      />

      {/* Authenticated app — Settings (and its Usage tab with recharts) is
          lazy-loaded so the dashboard's ~200KB of charting code doesn't
          ship with the initial chat bundle. */}
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Layout />}>
          <Route index element={<ChatPageRoute />} />
          <Route path="c/:conversationId" element={<ChatPageRoute />} />
          <Route
            path="settings"
            element={
              <Suspense fallback={<RouteFallback />}>
                <SettingsPage />
              </Suspense>
            }
          />
          {/* Legacy deep-link → the Usage tab now lives inside Settings */}
          <Route
            path="settings/usage"
            element={
              <Suspense fallback={<RouteFallback />}>
                <SettingsPage />
              </Suspense>
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
