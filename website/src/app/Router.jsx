import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PublicLayout } from '../layouts/PublicLayout.jsx';
import { Landing } from '../screens/Landing.jsx';
import { RolePicker } from '../screens/RolePicker.jsx';
import { Login } from '../screens/Login.jsx';
import { Features } from '../screens/Features.jsx';
import { UseCases } from '../screens/UseCases.jsx';
import { NotFound } from '../screens/NotFound.jsx';
import { ROLE_ROUTES, workspacePath, isWorkspaceRoute, safeReturnPath } from './routes.js';
import { useSession } from './SessionContext.jsx';
const SharedReport = lazy(() => import('../screens/SharedReport.jsx'));
const Workspace = lazy(() => import('../App.jsx'));
function RolesRoute() {
  const navigate = useNavigate();
  return <RolePicker onSelect={role => navigate(`/sign-in/${role}`)} />;
}
function LoginRoute() {
  const { role } = useParams();
  const { signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  if (!ROLE_ROUTES[role]) return <Navigate to="/sign-in" replace />;
  return <Login key={role} role={role} onBack={() => navigate('/sign-in')} onLogin={session => {
    signIn(session);
    navigate(safeReturnPath(location.state?.from, role), { replace: true });
  }} />;
}
function WorkspaceRoute() {
  const { role, view } = useParams();
  const { session } = useSession();
  const location = useLocation();
  if (!ROLE_ROUTES[role]) return <Navigate to="/sign-in" replace />;
  if (!view || !isWorkspaceRoute(role, view)) return <Navigate to={workspacePath(role)} replace />;
  if (session?.role !== role) return <Navigate to={`/sign-in/${role}`} state={{ from: location.pathname + location.search }} replace />;
  return <Suspense fallback={<div className="route-loading" role="status">Loading workspace…</div>}><Workspace /></Suspense>;
}
function RouteMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const labels = { '/': 'Platform', '/features': 'Features', '/use-cases': 'Use cases', '/sign-in': 'Choose workspace' };
    const section = pathname.split('/').filter(Boolean).at(-1);
    document.title = `${labels[pathname] || (section ? section[0].toUpperCase() + section.slice(1) : 'Page')} · Metriq`;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}
export function WebsiteRouter() {
  return <><RouteMetadata /><Routes>
    <Route element={<PublicLayout />}>
      <Route index element={<Landing />} />
      <Route path="features" element={<Features />} />
      <Route path="use-cases" element={<UseCases />} />
      <Route path="sign-in" element={<RolesRoute />} />
      <Route path="sign-in/:role" element={<LoginRoute />} />
      <Route path="*" element={<NotFound />} />
    </Route>
    <Route path="reports/:token" element={<Suspense fallback={<div className="route-loading">Loading report…</div>}><SharedReport /></Suspense>} />
    <Route path="app/:role/:view?" element={<WorkspaceRoute />} />
  </Routes></>;
}
