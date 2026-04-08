import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const native = require('./packages/cronet-node/cronet-node.darwin-arm64.node');

native.initEngine({
  enableHttp2: true,
  enableQuic: false,
  userAgent: 'CronetFetch/1.0',
});
console.log('Engine initialized');

// Test 1: HTTP GET
console.log('\n--- Test 1: HTTP GET ---');
try {
  const resp = await native.executeRequest({
    url: 'http://httpbin.org/get',
    method: 'GET',
    disableCache: true,
  });
  console.log('Status:', resp.status);
  const body = new TextDecoder().decode(resp.body);
  console.log('Body length:', body.length);
  console.log('PASS');
} catch (err) {
  console.error('FAIL:', err.message);
}

// Test 2: HTTPS GET
console.log('\n--- Test 2: HTTPS GET ---');
try {
  const resp = await native.executeRequest({
    url: 'https://httpbin.org/get',
    method: 'GET',
    disableCache: true,
  });
  console.log('Status:', resp.status);
  console.log('Protocol:', resp.protocol);
  console.log('PASS');
} catch (err) {
  console.error('FAIL:', err.message);
}

// Test 3: POST with body
console.log('\n--- Test 3: POST with body ---');
try {
  const body = Buffer.from(JSON.stringify({ hello: 'world' }));
  const resp = await native.executeRequest({
    url: 'http://httpbin.org/post',
    method: 'POST',
    headers: [['Content-Type', 'application/json']],
    body,
    disableCache: true,
  });
  console.log('Status:', resp.status);
  const text = new TextDecoder().decode(resp.body);
  const parsed = JSON.parse(text);
  console.log('Echo data:', parsed.data);
  console.log('PASS');
} catch (err) {
  console.error('FAIL:', err.message);
}

// Test 4: HTTPS with redirect
console.log('\n--- Test 4: HTTPS redirect ---');
try {
  const resp = await native.executeRequest({
    url: 'https://httpbin.org/redirect/2',
    method: 'GET',
    disableCache: true,
  });
  console.log('Status:', resp.status);
  console.log('Redirected:', resp.redirected);
  console.log('PASS');
} catch (err) {
  console.error('FAIL:', err.message);
}

console.log('\nAll tests complete.');
