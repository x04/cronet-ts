/**
 * Implements the WHATWG Fetch API fetch() function.
 * https://fetch.spec.whatwg.org/#fetch-method
 *
 * Uses Chromium's Cronet networking stack via the native addon.
 */

import { createRequire } from "node:module";
import type {
  NapiRequestConfig,
  NapiResponse,
} from "./native-types.js";
import { CronetRequest, type CronetRequestInit } from "./request.js";
import { CronetResponse } from "./response.js";

// The native addon — loaded at runtime via createRequire for ESM compat
const require = createRequire(import.meta.url);

type NativeModule = {
  executeRequest: (config: NapiRequestConfig) => Promise<NapiResponse>;
  executeStreamingRequest: (
    config: NapiRequestConfig,
    onChunk: (chunk: Buffer | null, error: Error | null) => void
  ) => Promise<NapiResponse>;
  initEngine: (config?: Record<string, unknown>) => void;
};

let native: NativeModule | null = null;
let nativeLoadFailed = false;

/** True when Cronet native addon is available; false when using globalThis.fetch fallback. */
export let usingCronet = false;

function getNative(): NativeModule | null {
  if (native) return native;
  if (nativeLoadFailed) return null;
  try {
    native = require("cronet-node");
    usingCronet = true;
    return native;
  } catch {
    nativeLoadFailed = true;
    return null;
  }
}

// Eagerly attempt load so `usingCronet` is set before first call
getNative();

if (!usingCronet && !process.env.CRONET_FETCH_SILENT) {
  console.warn(
    "[cronet-fetch] Native Cronet bindings not available for this platform; falling back to globalThis.fetch. " +
    "Set CRONET_FETCH_SILENT=1 to suppress this warning."
  );
}

export interface CronetEngineInit {
  userAgent?: string;
  enableQuic?: boolean;
  enableHttp2?: boolean;
  enableBrotli?: boolean;
  cacheMode?: string;
  cacheMaxSize?: number;
  proxyUrl?: string;
}

export interface CronetFetchInit extends CronetRequestInit {
  /** Per-request proxy URL, e.g. "http://proxy:8080" or "https://proxy:8443" */
  proxy?: string;
}

/**
 * Initialize the Cronet engine with custom configuration.
 * Must be called before the first fetch() if you need proxy support
 * or other engine-level settings.
 * No-op when falling back to native fetch on unsupported platforms.
 */
export function initEngine(config?: CronetEngineInit): void {
  const n = getNative();
  if (n) {
    n.initEngine(config as Record<string, unknown> | undefined);
  }
}

/**
 * The fetch() function — drop-in replacement for the global fetch,
 * backed by Chromium's Cronet networking stack.
 */
export async function fetch(
  input: RequestInfo | URL,
  init?: CronetFetchInit
): Promise<CronetResponse | globalThis.Response> {
  const n = getNative();
  if (!n) {
    // Fallback to native fetch on unsupported platforms
    return globalThis.fetch(input as any, init as any);
  }

  const request = new CronetRequest(input, init);

  // Handle abort signal
  if (request.signal.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  // Convert to native request config
  const headers = request.headers._toPairs().map(([name, value]) => [
    name,
    value,
  ]);

  let bodyBuffer: Buffer | undefined;
  if (request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    bodyBuffer = Buffer.from(combined);
  } else if ((request as any)._bodyBytes) {
    bodyBuffer = Buffer.from((request as any)._bodyBytes);
  }

  const nativeConfig: NapiRequestConfig = {
    url: request.url,
    method: request.method,
    headers,
    body: bodyBuffer,
    followRedirects: request.redirect === "follow",
    maxRedirects: 20,
    disableCache: request.cache === "no-store" || request.cache === "reload",
    proxyUrl: init?.proxy,
  };

  // Set up abort handling
  let abortHandler: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    abortHandler = () => {
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    if (request.signal.aborted) {
      abortHandler();
    } else {
      request.signal.addEventListener("abort", abortHandler, { once: true });
    }
  });

  try {
    const nativeResponse = await Promise.race([
      n.executeRequest(nativeConfig),
      abortPromise,
    ]);

    // Handle redirect=error
    if (request.redirect === "error" && nativeResponse.redirected) {
      throw new TypeError("Redirect was not allowed");
    }

    // Handle redirect=manual — return opaque redirect response
    if (request.redirect === "manual" && nativeResponse.redirected) {
      return CronetResponse._fromNative({
        url: nativeResponse.url,
        status: nativeResponse.status,
        statusText: nativeResponse.statusText,
        headers: nativeResponse.headers,
        body: new Uint8Array(nativeResponse.body),
        redirected: true,
        type: "opaqueredirect",
      });
    }

    return CronetResponse._fromNative({
      url: nativeResponse.url,
      status: nativeResponse.status,
      statusText: nativeResponse.statusText,
      headers: nativeResponse.headers,
      body: new Uint8Array(nativeResponse.body),
      redirected: nativeResponse.redirected,
    });
  } finally {
    if (abortHandler) {
      request.signal.removeEventListener("abort", abortHandler);
    }
  }
}

/**
 * Streaming fetch — returns a Response whose body is a ReadableStream
 * that yields chunks as they arrive from the network.
 */
export async function fetchStreaming(
  input: RequestInfo | URL,
  init?: CronetFetchInit
): Promise<CronetResponse | globalThis.Response> {
  const n = getNative();
  if (!n) {
    return globalThis.fetch(input as any, init as any);
  }

  const request = new CronetRequest(input, init);

  if (request.signal.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const headers = request.headers._toPairs().map(([name, value]) => [
    name,
    value,
  ]);

  let bodyBuffer: Buffer | undefined;
  if ((request as any)._bodyBytes) {
    bodyBuffer = Buffer.from((request as any)._bodyBytes);
  }

  const nativeConfig: NapiRequestConfig = {
    url: request.url,
    method: request.method,
    headers,
    body: bodyBuffer,
    followRedirects: request.redirect === "follow",
    maxRedirects: 20,
    disableCache: request.cache === "no-store" || request.cache === "reload",
    proxyUrl: init?.proxy,
  };

  // Create a ReadableStream that receives chunks from the native layer
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  const bodyStream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
    cancel() {
      // TODO: cancel the native request
    },
  });

  const onChunk = (chunk: Buffer | null, error: Error | null) => {
    if (error) {
      streamController.error(error);
    } else if (chunk === null) {
      streamController.close();
    } else {
      streamController.enqueue(new Uint8Array(chunk));
    }
  };

  const nativeResponse = await n.executeStreamingRequest(
    nativeConfig,
    onChunk
  );

  return CronetResponse._fromNativeStreaming({
    url: nativeResponse.url,
    status: nativeResponse.status,
    statusText: nativeResponse.statusText,
    headers: nativeResponse.headers,
    bodyStream,
    redirected: nativeResponse.redirected,
  });
}
