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
export type { RequestMode, RequestCredentials, RequestCache, RequestRedirect, ReferrerPolicy, } from "./request.js";
export type { ResponseType } from "./response.js";
import { CronetRequest } from "./request.js";
import { CronetResponse } from "./response.js";
import { CronetHeaders } from "./headers.js";
export declare const Request: typeof CronetRequest | {
    new (input: RequestInfo | URL, init?: RequestInit): Request;
    prototype: Request;
};
export declare const Response: typeof CronetResponse | {
    new (body?: BodyInit | null, init?: ResponseInit): Response;
    prototype: Response;
    error(): Response;
    json(data: any, init?: ResponseInit): Response;
    redirect(url: string | URL, status?: number): Response;
};
export declare const Headers: typeof CronetHeaders | {
    new (init?: HeadersInit): Headers;
    prototype: Headers;
};
export { fetch as default } from "./fetch.js";
//# sourceMappingURL=index.d.ts.map