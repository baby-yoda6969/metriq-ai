import { Router } from 'express';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, createHmac } from 'node:crypto';
import { join } from 'node:path';

// App Service persists /home across deployments/restarts. Keep snapshots outside wwwroot.
export function sharedReports(directory) {
  const router = Router();
  let secretPromise;
  async function secret() {
    return secretPromise ??= (async () => {
      await mkdir(directory, { recursive: true });
      const file = join(directory, '.link-secret');
      try { await writeFile(file, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      return readFile(file);
    })().catch(error => { secretPromise = undefined; throw error; });
  }
  router.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
    next();
  });
  router.post('/', async (req, res) => {
    const scan = req.body;
    if (!scan || typeof scan.id !== 'string' || !scan.id || typeof scan.brand !== 'string'
      || !['compliant', 'non_compliant', 'retake_needed'].includes(scan.status)
      || !Array.isArray(scan.fields) || scan.fields.length > 50
      || scan.fields.some(f => !f || typeof f.name !== 'string' || !['compliant', 'non_compliant', 'missing'].includes(f.status))) {
      return res.status(400).json({ error: 'A complete inspection report is required.' });
    }
    const json = JSON.stringify(scan);
    if (Buffer.byteLength(json) > 12 * 1024 * 1024) return res.status(413).json({ error: 'Report exceeds the 12 MB sharing limit.' });
    try {
      const token = createHmac('sha256', await secret()).update(json).digest('hex');
      try { await writeFile(join(directory, `${token}.json`), json, { flag: 'wx', mode: 0o600 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      return res.status(201).json({ path: `/reports/${token}` });
    } catch { return res.status(503).json({ error: 'Could not save the report link. Please retry.' }); }
  });
  router.get('/:token', async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.token)) return res.status(404).json({ error: 'Report not found.' });
    try { return res.json(JSON.parse(await readFile(join(directory, `${req.params.token}.json`), 'utf8'))); }
    catch (error) { return res.status(error.code === 'ENOENT' ? 404 : 503).json({ error: error.code === 'ENOENT' ? 'Report not found.' : 'Report temporarily unavailable.' }); }
  });
  return router;
}
