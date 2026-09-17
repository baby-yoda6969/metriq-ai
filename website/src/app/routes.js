export const ROLE_ROUTES = {
  inspector: { title: 'Inspector', home: 'scan', views: ['scan', 'history'] },
  supervisor: { title: 'Supervisor', home: 'dashboard', views: ['dashboard', 'history'] },
  ruleadmin: { title: 'Rule Admin', home: 'ruleadmin', views: ['ruleadmin'] },
};
export function workspacePath(role, view = ROLE_ROUTES[role]?.home) {
  return `/app/${role}/${view}`;
}
export function isWorkspaceRoute(role, view) {
  return !!ROLE_ROUTES[role]?.views.includes(view);
}
export function safeReturnPath(path, role) {
  if (typeof path !== 'string') return workspacePath(role);
  const [pathname] = path.split('?');
  const segments = pathname.split('/');
  return segments.length === 4 && segments[1] === 'app' && segments[2] === role && isWorkspaceRoute(role, segments[3]) ? path : workspacePath(role);
}
