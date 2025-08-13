#!/usr/bin/env node
/*
  Telegram validation tests: ensure invalid initData is rejected with 403.
*/
const http = require('http');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3010;

function request(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(body) : null;
    const req = http.request({ hostname: 'localhost', port: PORT, path, method, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: buf }));
    });
    req.on('error', reject);
    if (data) req.end(data); else req.end();
  });
}

async function main() {
  let server;
  const mustStart = process.env.SMOKE_START === '1';
  try {
    if (mustStart) {
      server = spawn('node', ['server.js'], { env: { ...process.env, PORT }, stdio: 'inherit' });
      const deadline = Date.now() + 15000;
      let healthy = false;
      while (Date.now() < deadline) {
        try {
          const h = await request('/health');
          if (h.status === 200) { healthy = true; break; }
        } catch (_) {}
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!healthy) throw new Error('Server did not become healthy in time');
    }

    // Missing initData should be 400 (bad request)
    const bad1 = await request('/api/register-telegram', 'POST', JSON.stringify({}), { 'Content-Type': 'application/json' });
    if (bad1.status !== 400) throw new Error('register-telegram without initData should be 400');

    // If BOT_TOKEN is provided, invalid signatures must be 403.
    // If BOT_TOKEN is missing, server returns 500 (config error) and we skip signature checks.
    const hasBotToken = !!process.env.BOT_TOKEN;
    if (hasBotToken) {
      // Malformed initData should be 403
      const bad2 = await request('/api/register-telegram', 'POST', JSON.stringify({ initData: 'query_id=123' }), { 'Content-Type': 'application/json' });
      if (bad2.status !== 403) throw new Error('register-telegram with malformed initData should be 403');

      // get-user-by-telegram also rejects invalid
      const bad3 = await request('/api/get-user-by-telegram', 'POST', JSON.stringify({ initData: 'user=foo' }), { 'Content-Type': 'application/json' });
      if (bad3.status !== 403) throw new Error('get-user-by-telegram invalid initData should be 403');
    } else {
      console.log('BOT_TOKEN not set; skipping invalid-signature assertions');
    }

    console.log('Telegram tests: OK');
    process.exit(0);
  } catch (e) {
    console.error('Telegram tests failed:', e.message || e);
    process.exit(1);
  } finally {
    if (server) server.kill('SIGINT');
  }
}

main();


