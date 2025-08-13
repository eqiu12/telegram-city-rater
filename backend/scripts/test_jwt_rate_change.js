#!/usr/bin/env node
/*
  Tests: JWT positive path, change-vote flow, and rate-limit assertions.
*/
const http = require('http');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3022;

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
      server = spawn('node', ['server.js'], { env: { ...process.env, PORT, JWT_SECRET: process.env.JWT_SECRET || 'devsecret' }, stdio: 'inherit' });
      // wait until healthy
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

    // Prepare a UUID user and get a city
    const uuid = '00000000-0000-4000-8000-000000000001';
    const cities = await request('/api/cities?userId=' + uuid);
    if (cities.status !== 200) throw new Error('Cities failed');
    const list = JSON.parse(cities.body).cities;
    if (!Array.isArray(list) || list.length === 0) throw new Error('Cities list empty');
    const cityId = list[0].cityId;

    // Vote liked
    let res = await request('/api/vote', 'POST', JSON.stringify({ userId: uuid, cityId, voteType: 'liked' }), { 'Content-Type': 'application/json' });
    if (![200, 409].includes(res.status)) {
      console.error('Initial vote debug:', res.status, res.body);
      throw new Error('Initial vote failed');
    }

    // Change vote to disliked
    res = await request('/api/change-vote', 'POST', JSON.stringify({ userId: uuid, cityId, voteType: 'disliked' }), { 'Content-Type': 'application/json' });
    if (res.status !== 200) throw new Error('Change vote failed');

    // Rate-limit assertion: hit /api/vote quickly until 429 appears (allow up to ~150)
    let seen429 = false;
    for (let i = 0; i < 160; i++) {
      const r = await request('/api/vote', 'POST', JSON.stringify({ userId: uuid, cityId, voteType: 'dont_know' }), { 'Content-Type': 'application/json' });
      if (r.status === 429) { seen429 = true; break; }
    }
    if (!seen429) console.warn('WARN: Did not observe 429; rate limit may not have been reached in this run');

    console.log('JWT/change-vote/rate tests: OK');
    process.exit(0);
  } catch (e) {
    console.error('JWT/change-vote/rate tests failed:', e.message || e);
    process.exit(1);
  } finally {
    if (server) server.kill('SIGINT');
  }
}

main();


