// Test proxy support
// Usage: DYLD_LIBRARY_PATH=$PWD/chromium/src/out/Release node test_proxy.mjs [proxy_url]
//
// To test with a real proxy:
//   DYLD_LIBRARY_PATH=$PWD/chromium/src/out/Release node test_proxy.mjs http://your-proxy:8080

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const native = require('./packages/cronet-node/cronet-node.darwin-arm64.node');

const proxyUrl = process.argv[2];

if (!proxyUrl) {
  console.log('Usage: node test_proxy.mjs <proxy_url>');
  console.log('Example: node test_proxy.mjs http://127.0.0.1:8080');
  console.log('\nTo verify proxy support is wired, starting without proxy...');
}

native.initEngine({
  enableHttp2: true,
  enableQuic: false,
  ...(proxyUrl ? { proxyUrl } : {}),
});
console.log('Engine initialized' + (proxyUrl ? ` with proxy: ${proxyUrl}` : ''));

try {
  const resp = await native.executeRequest({
    url: 'http://httpbin.org/get',
    method: 'GET',
    disableCache: true,
  });
  console.log('Status:', resp.status);
  const body = JSON.parse(new TextDecoder().decode(resp.body));
  console.log('Origin IP:', body.origin);
  console.log('Request succeeded through', proxyUrl ? 'proxy' : 'direct connection');
} catch (err) {
  if (proxyUrl) {
    console.error('Request through proxy failed:', err.message);
    console.error('(This is expected if the proxy is not running)');
  } else {
    console.error('Error:', err.message);
  }
}
