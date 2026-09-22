import { afterEach, expect, it } from 'vitest';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sharedReports } from './sharedReports.js';
const servers = [], directories = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(s => new Promise(resolve => s.close(resolve))));
  await Promise.all(directories.splice(0).map(d => rm(d, { recursive: true, force: true })));
});
async function start(directory) {
  const app = express(); app.use(express.json()); app.use('/api/reports', sharedReports(directory));
  const server = app.listen(0, '127.0.0.1'); servers.push(server);
  await new Promise(resolve => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
it('persists immutable, unguessable report links across server instances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reports-')); directories.push(directory);
  const origin = await start(directory);
  const scan = { id: 'case-1', brand: 'Test', status: 'compliant', fields: [{ name: 'MRP', value: '10', status: 'compliant' }] };
  const create = body => fetch(origin + '/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const first = await create(scan); expect(first.status).toBe(201);
  const { path } = await first.json(); expect(path).toMatch(/^\/reports\/[a-f0-9]{64}$/);
  expect((await (await create(scan)).json()).path).toBe(path);
  const second = await start(directory);
  const response = await fetch(second + '/api' + path);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual(scan);
  expect((await (await create({ ...scan, brand: 'Changed' })).json()).path).not.toBe(path);
  expect(await (await fetch(second + '/api' + path)).json()).toEqual(scan);
  expect((await create({})).status).toBe(400);
  expect((await fetch(second + '/api/reports/invalid')).status).toBe(404);
  expect((await fetch(second + '/api/reports/' + '0'.repeat(64))).status).toBe(404);
});
