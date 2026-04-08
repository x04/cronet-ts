/**
 * cronet-fetch — Fetch API implementation powered by Chromium's Cronet.
 *
 * Drop-in compatible with the WHATWG Fetch standard:
 * - fetch(input, init?) → Promise<Response>
 * - Request, Response, Headers classes
 * - ReadableStream body support
 * - AbortController/AbortSignal
 * - Redirect modes (follow, error, manual)
 * - Cache modes
 *
 * Backed by HTTP/2, HTTP/3 (QUIC), and Brotli via Chromium's networking stack.
 * Falls back to globalThis.fetch on unsupported platforms.
 */

export { fetch, fetchStreaming, initEngine, usingCronet, type CronetFetchInit, type CronetEngineInit } from "./fetch.js";
export { CronetRequest, type CronetRequestInit } from "./request.js";
export { CronetResponse } from "./response.js";
export { CronetHeaders } from "./headers.js";
export type { BodyInit } from "./body.js";
export type {
  RequestMode,
  RequestCredentials,
  RequestCache,
  RequestRedirect,
  ReferrerPolicy,
} from "./request.js";
export type { ResponseType } from "./response.js";

// Re-export with standard names for drop-in use
import { usingCronet } from "./fetch.js";
import { CronetRequest } from "./request.js";
import { CronetResponse } from "./response.js";
import { CronetHeaders } from "./headers.js";

export const Request = usingCronet ? CronetRequest : globalThis.Request;
export const Response = usingCronet ? CronetResponse : globalThis.Response;
export const Headers = usingCronet ? CronetHeaders : globalThis.Headers;

export { fetch as default } from "./fetch.js";
