#!/usr/bin/env node
/*
 Simple smoke tests for critical endpoints.
 Requires: server running on PORT (default 3000) or will start temporarily.
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

async function run() {
  let server;
  const mustStart = process.env.SMOKE_START === '1';
  try {
    if (mustStart) {
      server = spawn('node', ['server.js'], { env: { ...process.env, PORT }, stdio: 'inherit' });
      // Wait for server to be healthy instead of fixed sleep
      const deadline = Date.now() + 15000; // up to 15s
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

    // Health
    const health = await request('/health');
    if (health.status !== 200) throw new Error('Health check failed');

    // Rankings
    const rankings = await request('/api/rankings');
    if (rankings.status !== 200) throw new Error('Rankings failed');

    // Cities and vote flow
    const uuid = '00000000-0000-4000-8000-000000000000';
    const cities = await request('/api/cities?userId=' + uuid);
    if (cities.status !== 200) throw new Error('Cities failed');
    const list = JSON.parse(cities.body).cities;
    if (!Array.isArray(list) || list.length === 0) throw new Error('Cities list empty');
    const cityId = list[0].cityId;

    const voteBody = JSON.stringify({ userId: uuid, cityId, voteType: 'dont_know' });
    const voted = await request('/api/vote', 'POST', voteBody, { 'Content-Type': 'application/json' });
    if (![200, 409].includes(voted.status)) throw new Error('Vote failed');

    console.log('Smoke tests: OK');
    process.exit(0);
  } catch (e) {
    console.error('Smoke tests failed:', e.message || e);
    process.exit(1);
  } finally {
    if (server) server.kill('SIGINT');
  }
}

run();


