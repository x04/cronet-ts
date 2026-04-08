// Test per-request proxy support
import { fetch, initEngine } from './packages/cronet-fetch/dist/index.js';

initEngine({ enableHttp2: true, enableQuic: false });

// Test 1: Normal request (no proxy) should work
console.log('--- Test 1: Direct request (no proxy) ---');
try {
  const res = await fetch('http://httpbin.org/get');
  const json = await res.json();
  console.log('Status:', res.status, '| Origin:', json.origin);
  console.log('PASS');
} catch (err) {
  console.error('FAIL:', err.message);
}

// Test 2: Request with bad proxy should fail with proxy error
console.log('\n--- Test 2: Request through bad proxy ---');
try {
  const res = await fetch('http://httpbin.org/get', {
    proxy: 'http://127.0.0.1:19999',
  });
  console.log('FAIL: should have thrown');
} catch (err) {
  if (err.message.includes('PROXY')) {
    console.log('Got expected proxy error:', err.message);
    console.log('PASS');
  } else {
    console.error('FAIL: unexpected error:', err.message);
  }
}

// Test 3: Next request without proxy should still work (engine not poisoned)
console.log('\n--- Test 3: Direct request after proxy failure ---');
try {
  const res = await fetch('http://httpbin.org/get');
  const json = await res.json();
  console.log('Status:', res.status, '| Origin:', json.origin);
  console.log('PASS');
} catch (err) {
  console.error('FAIL:', err.message);
}

console.log('\nAll per-request proxy tests complete.');
