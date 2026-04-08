// End-to-end test of the full Fetch API backed by Chromium's Cronet
import { fetch, Headers, Request, Response } from './packages/cronet-fetch/dist/index.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name} — ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

console.log('=== Cronet Fetch API E2E Tests ===\n');

// Test 1: Simple GET
await test('HTTP GET returns 200', async () => {
  const res = await fetch('http://httpbin.org/get');
  assert(res.ok, `Expected ok, got status ${res.status}`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const json = await res.json();
  assert(json.url === 'http://httpbin.org/get');
});

// Test 2: HTTPS GET
await test('HTTPS GET returns 200', async () => {
  const res = await fetch('https://httpbin.org/get');
  assert(res.ok);
  assert(res.status === 200);
  const json = await res.json();
  assert(json.url === 'https://httpbin.org/get');
});

// Test 3: Response headers
await test('Response headers are accessible', async () => {
  const res = await fetch('http://httpbin.org/response-headers?X-Test=hello');
  assert(res.headers instanceof Headers);
  assert(res.headers.get('content-type') !== null);
});

// Test 4: POST with JSON body
await test('POST with JSON body', async () => {
  const res = await fetch('http://httpbin.org/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foo: 'bar' }),
  });
  assert(res.ok);
  const json = await res.json();
  assert(json.data === '{"foo":"bar"}', `Expected body echo, got: ${json.data}`);
});

// Test 5: Request class
await test('Request class works', async () => {
  const req = new Request('http://httpbin.org/get', {
    headers: { 'X-Custom': 'test' },
  });
  assert(req.method === 'GET');
  assert(req.headers.get('x-custom') === 'test');
  const res = await fetch(req);
  assert(res.ok);
});

// Test 6: Redirect following
await test('Redirects are followed by default', async () => {
  const res = await fetch('http://httpbin.org/redirect/2');
  assert(res.ok);
  assert(res.redirected === true, 'Expected redirected=true');
});

// Test 7: Response.text()
await test('Response.text() works', async () => {
  const res = await fetch('http://httpbin.org/html');
  const text = await res.text();
  assert(text.includes('Moby-Dick') || text.includes('<!DOCTYPE') || text.length > 100,
    `Expected HTML content, got ${text.length} chars`);
});

// Test 8: Response.arrayBuffer()
await test('Response.arrayBuffer() works', async () => {
  const res = await fetch('http://httpbin.org/bytes/128');
  const buf = await res.arrayBuffer();
  assert(buf.byteLength === 128, `Expected 128 bytes, got ${buf.byteLength}`);
});

// Test 9: Custom headers sent
await test('Custom headers are sent', async () => {
  const res = await fetch('http://httpbin.org/headers', {
    headers: { 'X-My-Header': 'hello-world' },
  });
  const json = await res.json();
  assert(json.headers['X-My-Header'] === 'hello-world',
    `Header not echoed: ${JSON.stringify(json.headers)}`);
});

// Test 10: Status codes
await test('Non-200 status codes work', async () => {
  const res = await fetch('http://httpbin.org/status/404');
  assert(res.status === 404, `Expected 404, got ${res.status}`);
  assert(!res.ok);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
