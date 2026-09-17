import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { WebsiteRouter } from './Router.jsx';
import { SessionProvider } from './SessionContext.jsx';
import { ThemeProvider } from '../lib/ThemeContext.jsx';
import { isWorkspaceRoute, safeReturnPath, workspacePath } from './routes.js';
import { paginate } from '../lib/pagination.js';

describe('website route contracts', () => {
  it('restricts each role to its workspace sections', () => {
    expect(isWorkspaceRoute('inspector', 'scan')).toBe(true);
    expect(isWorkspaceRoute('supervisor', 'dashboard')).toBe(true);
    expect(isWorkspaceRoute('ruleadmin', 'ruleadmin')).toBe(true);
    expect(isWorkspaceRoute('inspector', 'ruleadmin')).toBe(false);
    expect(isWorkspaceRoute('unknown', 'history')).toBe(false);
  });
  it('only returns to a local section for the signed-in role', () => {
    expect(safeReturnPath('/app/inspector/history?page=2', 'inspector')).toBe('/app/inspector/history?page=2');
    for (const path of ['https://example.com', '//example.com', '/app/supervisor/history', '/app/inspector/nope', '/app/inspector/history/extra', null]) {
      expect(safeReturnPath(path, 'inspector')).toBe(workspacePath('inspector'));
    }
  });
  for (const [path, heading] of [['/', 'Know what'], ['/features', 'From label to case report.'], ['/use-cases', 'A workspace for every role.'], ['/sign-in', 'Choose your workspace.'], ['/sign-in/inspector', 'Inspector sign-in'], ['/missing-page', 'Page not found.']]) {
    it(`renders the public shell and correct page at ${path}`, () => {
      const html = renderToString(<MemoryRouter initialEntries={[path]}><ThemeProvider><SessionProvider><WebsiteRouter /></SessionProvider></ThemeProvider></MemoryRouter>);
      expect(html.replace(/<!--.*?-->/g, '')).toContain(heading);
      expect(html).toContain('aria-label="Main navigation"');
      expect(html).toContain('href="/features"');
      expect(html).not.toContain('field-landscape');
    });
  }
});
describe('case pagination', () => {
  const items = Array.from({length: 26}, (_, id) => id);
  it('slices pages and clamps out of range requests after filtering', () => {
    expect(paginate(items, 2, 10).items).toEqual(items.slice(10, 20));
    expect(paginate(items, 999, 10)).toMatchObject({page: 3, pages: 3, from: 21, to: 26});
    expect(paginate(items.slice(0, 2), 3, 10)).toMatchObject({page: 1, from: 1, to: 2});
  });
  it('handles malformed query parameters and an empty repository', () => {
    expect(paginate(items, 'NaN', -5)).toMatchObject({page: 1, size: 10});
    expect(paginate(items, -3, 25)).toMatchObject({page: 1, size: 25, pages: 2});
    expect(paginate([], 5, 10)).toMatchObject({page: 1, pages: 1, from: 0, to: 0, items: []});
  });
});
