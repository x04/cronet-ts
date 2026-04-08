/**
 * bench.mjs — Benchmark cronet-fetch vs Node.js native fetch
 *
 * Spins up a local HTTP server and compares performance across three scenarios:
 *   1. Sequential requests
 *   2. Concurrent requests (Promise.all)
 *   3. Throughput (max requests in a fixed time window)
 *
 * Usage:  node bench.mjs
 */

import http from "node:http";
import { performance } from "node:perf_hooks";
import { fetch as cronetFetch, initEngine } from "./packages/cronet-fetch/dist/index.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const SEQUENTIAL_N = 100;
const CONCURRENT_N = 100;
const THROUGHPUT_SECONDS = 5;
const WARMUP_REQUESTS = 10; // per implementation, before timing

// ---------------------------------------------------------------------------
// Local HTTP server
// ---------------------------------------------------------------------------
const RESPONSE_BODY = JSON.stringify({ ok: true });

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(RESPONSE_BODY),
      });
      res.end(RESPONSE_BODY);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(n, decimals = 2) {
  return n.toFixed(decimals);
}

/** Consume the response body so the connection can be reused. */
async function drain(resp) {
  // cronet-fetch returns a CronetResponse, native returns a Response —
  // both expose .text() or .arrayBuffer()
  await resp.text();
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/**
 * Sequential: fire N requests one after another.
 */
async function benchSequential(fetchFn, url, n) {
  const start = performance.now();
  for (let i = 0; i < n; i++) {
    const resp = await fetchFn(url);
    await drain(resp);
  }
  const elapsed = performance.now() - start;
  return { elapsed, count: n };
}

/**
 * Concurrent: fire N requests simultaneously via Promise.all.
 */
async function benchConcurrent(fetchFn, url, n) {
  const start = performance.now();
  const promises = [];
  for (let i = 0; i < n; i++) {
    promises.push(fetchFn(url).then(drain));
  }
  await Promise.all(promises);
  const elapsed = performance.now() - start;
  return { elapsed, count: n };
}

/**
 * Throughput: fire as many sequential requests as possible within `seconds`.
 */
async function benchThroughput(fetchFn, url, seconds) {
  const deadline = performance.now() + seconds * 1000;
  let count = 0;
  const start = performance.now();
  while (performance.now() < deadline) {
    const resp = await fetchFn(url);
    await drain(resp);
    count++;
  }
  const elapsed = performance.now() - start;
  return { elapsed, count };
}

// ---------------------------------------------------------------------------
// Warmup
// ---------------------------------------------------------------------------
async function warmup(fetchFn, url, n) {
  for (let i = 0; i < n; i++) {
    const resp = await fetchFn(url);
    await drain(resp);
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
function printHeader() {
  const cols = [
    pad("Scenario", 24),
    pad("Implementation", 16),
    pad("Requests", 10),
    pad("Total (ms)", 12),
    pad("Req/s", 10),
    pad("Avg lat (ms)", 14),
  ];
  console.log(cols.join(""));
  console.log("-".repeat(86));
}

function printRow(scenario, impl, { elapsed, count }) {
  const rps = (count / (elapsed / 1000));
  const avgLat = elapsed / count;
  const cols = [
    pad(scenario, 24),
    pad(impl, 16),
    pad(String(count), 10),
    pad(fmt(elapsed, 1), 12),
    pad(fmt(rps, 1), 10),
    pad(fmt(avgLat, 3), 14),
  ];
  console.log(cols.join(""));
}

function pad(s, len) {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // Start local server
  const { server, url } = await startServer();
  console.log(`Local server listening at ${url}\n`);

  // Initialize cronet engine
  console.log("Initializing Cronet engine...");
  initEngine({
    enableHttp2: true,
    enableQuic: false,
    userAgent: "CronetBench/1.0",
  });
  console.log("Cronet engine ready.\n");

  // Aliases
  const nativeFetch = globalThis.fetch;

  // Warmup both implementations
  console.log(`Warming up (${WARMUP_REQUESTS} requests each)...`);
  await warmup(cronetFetch, url, WARMUP_REQUESTS);
  await warmup(nativeFetch, url, WARMUP_REQUESTS);
  console.log("Warmup complete.\n");

  // Results accumulator for summary
  const results = [];

  printHeader();

  // --- Sequential ---
  const seqCronet = await benchSequential(cronetFetch, url, SEQUENTIAL_N);
  printRow("Sequential", "cronet-fetch", seqCronet);
  results.push({ scenario: "Sequential", impl: "cronet-fetch", ...seqCronet });

  const seqNative = await benchSequential(nativeFetch, url, SEQUENTIAL_N);
  printRow("Sequential", "native fetch", seqNative);
  results.push({ scenario: "Sequential", impl: "native fetch", ...seqNative });

  // --- Concurrent ---
  const conCronet = await benchConcurrent(cronetFetch, url, CONCURRENT_N);
  printRow("Concurrent", "cronet-fetch", conCronet);
  results.push({ scenario: "Concurrent", impl: "cronet-fetch", ...conCronet });

  const conNative = await benchConcurrent(nativeFetch, url, CONCURRENT_N);
  printRow("Concurrent", "native fetch", conNative);
  results.push({ scenario: "Concurrent", impl: "native fetch", ...conNative });

  // --- Throughput ---
  console.log(`\n(Throughput test: ${THROUGHPUT_SECONDS}s each — please wait...)\n`);
  printHeader();

  const tpCronet = await benchThroughput(cronetFetch, url, THROUGHPUT_SECONDS);
  printRow(`Throughput (${THROUGHPUT_SECONDS}s)`, "cronet-fetch", tpCronet);
  results.push({ scenario: "Throughput", impl: "cronet-fetch", ...tpCronet });

  const tpNative = await benchThroughput(nativeFetch, url, THROUGHPUT_SECONDS);
  printRow(`Throughput (${THROUGHPUT_SECONDS}s)`, "native fetch", tpNative);
  results.push({ scenario: "Throughput", impl: "native fetch", ...tpNative });

  // --- Summary ---
  console.log("\n" + "=".repeat(86));
  console.log("SUMMARY");
  console.log("=".repeat(86));

  for (const scenario of ["Sequential", "Concurrent", "Throughput"]) {
    const cronet = results.find((r) => r.scenario === scenario && r.impl === "cronet-fetch");
    const native = results.find((r) => r.scenario === scenario && r.impl === "native fetch");
    const cronetRps = cronet.count / (cronet.elapsed / 1000);
    const nativeRps = native.count / (native.elapsed / 1000);
    const ratio = cronetRps / nativeRps;
    const faster = ratio > 1 ? "cronet-fetch" : "native fetch";
    const factor = ratio > 1 ? ratio : 1 / ratio;
    console.log(
      `  ${pad(scenario, 14)} ${faster} is ${fmt(factor, 2)}x faster  ` +
        `(cronet: ${fmt(cronetRps, 1)} req/s, native: ${fmt(nativeRps, 1)} req/s)`
    );
  }

  console.log();

  // Shut down
  server.close();
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
