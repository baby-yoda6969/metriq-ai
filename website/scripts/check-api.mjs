import assert from 'node:assert/strict';

// Run against a local development server. No AI calls or external credentials.
const origin = process.env.WEBSITE_TEST_ORIGIN || 'http://localhost:5174';
async function request(path, body) {
  return fetch(`${origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
}
const health = await (await request('/api/health')).json();
assert.equal(health.service, 'metriq-website', 'The website must not proxy to the mobile backend');
assert.equal(health.ok, true);
for (const path of ['/api/analyze', '/api/identify-object', '/api/verify-correction', '/api/regulasync/extract', '/api/rules']) {
  const res = await request(path, {});
  assert.equal(res.status, 400, `${path} should reject missing input`);
  assert.ok((await res.json()).error, `${path} should return a structured error`);
}
const { code } = await (await request('/api/handoff/create', {})).json();
assert.ok(code);
assert.equal((await (await request(`/api/handoff/${code}`)).json()).valid, true);
const posted = await request(`/api/handoff/${code}/scan`, { match: 'integration-check' });
assert.equal(posted.status, 200);
// Verify replay over SSE for the race where a phone submits before a listener joins.
const stream = await request(`/api/handoff/${code}/stream`);
assert.match(stream.headers.get('content-type'), /text\/event-stream/);
const reader = stream.body.getReader();
let received = '';
try {
  while (!received.includes('integration-check')) {
    const { value, done } = await reader.read();
    if (done) break;
    received += new TextDecoder().decode(value);
  }
  assert.match(received, /event: scan/);
  assert.match(received, /integration-check/);
} finally { await reader.cancel(); }
assert.equal((await (await request('/api/handoff/invalid-session')).json()).valid, false);
console.log('Website API contracts passed: health, validation, handoff, and SSE replay.');
