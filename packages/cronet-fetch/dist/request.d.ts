/**
 * Implements the WHATWG Fetch API Request class.
 * https://fetch.spec.whatwg.org/#request-class
 */
import { CronetHeaders } from "./headers.js";
import { BodyMixin, type BodyInit } from "./body.js";
export type RequestMode = "cors" | "navigate" | "no-cors" | "same-origin";
export type RequestCredentials = "include" | "omit" | "same-origin";
export type RequestCache = "default" | "force-cache" | "no-cache" | "no-store" | "only-if-cached" | "reload";
export type RequestRedirect = "error" | "follow" | "manual";
export type RequestDuplex = "half";
export type ReferrerPolicy = "" | "no-referrer" | "no-referrer-when-downgrade" | "origin" | "origin-when-cross-origin" | "same-origin" | "strict-origin" | "strict-origin-when-cross-origin" | "unsafe-url";
export interface CronetRequestInit {
    method?: string;
    headers?: HeadersInit;
    body?: BodyInit;
    referrer?: string;
    referrerPolicy?: ReferrerPolicy;
    mode?: RequestMode;
    credentials?: RequestCredentials;
    cache?: RequestCache;
    redirect?: RequestRedirect;
    integrity?: string;
    keepalive?: boolean;
    signal?: AbortSignal | null;
    duplex?: RequestDuplex;
    window?: null;
}
export declare class CronetRequest extends BodyMixin implements Request {
    private _method;
    private _url;
    private _headers;
    private _signal;
    private _referrer;
    private _referrerPolicy;
    private _mode;
    private _credentials;
    private _cache;
    private _redirect;
    private _integrity;
    private _keepalive;
    private _duplex;
    readonly destination: RequestDestination;
    readonly isHistoryNavigation = false;
    readonly isReloadNavigation = false;
    constructor(input: RequestInfo | URL, init?: CronetRequestInit);
    get method(): string;
    get url(): string;
    get headers(): CronetHeaders;
    get redirect(): RequestRedirect;
    get signal(): AbortSignal;
    get referrer(): string;
    get referrerPolicy(): ReferrerPolicy;
    get mode(): RequestMode;
    get credentials(): RequestCredentials;
    get cache(): RequestCache;
    get integrity(): string;
    get keepalive(): boolean;
    get window(): typeof globalThis;
    clone(): Request;
}
//# sourceMappingURL=request.d.ts.map