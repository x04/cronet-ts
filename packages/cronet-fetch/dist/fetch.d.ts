/**
 * Implements the WHATWG Fetch API fetch() function.
 * https://fetch.spec.whatwg.org/#fetch-method
 *
 * Uses Chromium's Cronet networking stack via the native addon.
 */
import { type CronetRequestInit } from "./request.js";
import { CronetResponse } from "./response.js";
/** True when Cronet native addon is available; false when using globalThis.fetch fallback. */
export declare let usingCronet: boolean;
export interface CronetEngineInit {
    userAgent?: string;
    enableQuic?: boolean;
    enableHttp2?: boolean;
    enableBrotli?: boolean;
    cacheMode?: string;
    cacheMaxSize?: number;
    proxyUrl?: string;
    /** Disable Cronet's internal cookie jar. Each request gets a fresh engine so no cookies leak between requests. */
    disableCookieJar?: boolean;
}
export interface CronetFetchInit extends CronetRequestInit {
    /** Per-request proxy URL, e.g. "http://proxy:8080" or "https://proxy:8443" */
    proxy?: string;
    /** Disable Cronet's internal cookie jar for this request. Overrides the engine-level setting. */
    disableCookieJar?: boolean;
}
/**
 * Initialize the Cronet engine with custom configuration.
 * Must be called before the first fetch() if you need proxy support
 * or other engine-level settings.
 * No-op when falling back to native fetch on unsupported platforms.
 */
export declare function initEngine(config?: CronetEngineInit): void;
/**
 * The fetch() function — drop-in replacement for the global fetch,
 * backed by Chromium's Cronet networking stack.
 */
export declare function fetch(input: RequestInfo | URL, init?: CronetFetchInit): Promise<CronetResponse | globalThis.Response>;
/**
 * Streaming fetch — returns a Response whose body is a ReadableStream
 * that yields chunks as they arrive from the network.
 */
export declare function fetchStreaming(input: RequestInfo | URL, init?: CronetFetchInit): Promise<CronetResponse | globalThis.Response>;
//# sourceMappingURL=fetch.d.ts.map