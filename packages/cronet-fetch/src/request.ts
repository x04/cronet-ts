/**
 * Implements the WHATWG Fetch API Request class.
 * https://fetch.spec.whatwg.org/#request-class
 */

import { CronetHeaders, type HeadersGuard } from "./headers.js";
import { BodyMixin, extractBody, type BodyInit } from "./body.js";

export type RequestMode = "cors" | "navigate" | "no-cors" | "same-origin";
export type RequestCredentials = "include" | "omit" | "same-origin";
export type RequestCache =
  | "default"
  | "force-cache"
  | "no-cache"
  | "no-store"
  | "only-if-cached"
  | "reload";
export type RequestRedirect = "error" | "follow" | "manual";
export type RequestDuplex = "half";
export type ReferrerPolicy =
  | ""
  | "no-referrer"
  | "no-referrer-when-downgrade"
  | "origin"
  | "origin-when-cross-origin"
  | "same-origin"
  | "strict-origin"
  | "strict-origin-when-cross-origin"
  | "unsafe-url";

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

const KNOWN_METHODS = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
  "PATCH",
]);

function normalizeMethod(method: string): string {
  const upper = method.toUpperCase();
  if (KNOWN_METHODS.has(upper)) return upper;
  return method;
}

const NO_BODY_METHODS = new Set(["GET", "HEAD"]);

export class CronetRequest extends BodyMixin implements Request {
  private _method: string;
  private _url: URL;
  private _headers: CronetHeaders;
  private _signal: AbortSignal;
  private _referrer: string;
  private _referrerPolicy: ReferrerPolicy;
  private _mode: RequestMode;
  private _credentials: RequestCredentials;
  private _cache: RequestCache;
  private _redirect: RequestRedirect;
  private _integrity: string;
  private _keepalive: boolean;
  private _duplex: RequestDuplex;
  readonly destination: RequestDestination = "";
  readonly isHistoryNavigation = false;
  readonly isReloadNavigation = false;

  constructor(input: RequestInfo | URL, init?: CronetRequestInit) {
    super();

    let url: URL;
    let inputHeaders: CronetHeaders | undefined;
    let inputMethod = "GET";
    let inputBody: BodyInit | null | undefined = null;
    let inputSignal: AbortSignal | null = null;

    if (input instanceof CronetRequest) {
      url = new URL(input.url);
      inputHeaders = new CronetHeaders(input.headers);
      inputMethod = input.method;
      inputSignal = input.signal;
      if (!input.bodyUsed && input.getBodyBytes()) {
        inputBody = input.getBodyBytes();
      }
    } else if (input instanceof URL) {
      url = input;
    } else if (typeof input === "string") {
      url = new URL(input);
    } else {
      // Request-like
      url = new URL(input.url);
      inputHeaders = new CronetHeaders(input.headers);
      inputMethod = input.method;
    }

    this._method = normalizeMethod(init?.method ?? inputMethod);
    this._url = url;

    // Headers
    if (init?.headers !== undefined) {
      this._headers = CronetHeaders._withGuard(undefined, "request");
      const h = new CronetHeaders(init.headers as any);
      for (const [name, value] of h) {
        this._headers.append(name, value);
      }
    } else if (inputHeaders) {
      this._headers = CronetHeaders._withGuard(undefined, "request");
      for (const [name, value] of inputHeaders) {
        this._headers.append(name, value);
      }
    } else {
      this._headers = CronetHeaders._withGuard(undefined, "request");
    }

    // Body
    const bodySource = init?.body !== undefined ? init.body : inputBody;
    if (bodySource !== null && bodySource !== undefined) {
      if (NO_BODY_METHODS.has(this._method)) {
        throw new TypeError(
          `Request with ${this._method} method cannot have body`
        );
      }
      const extracted = extractBody(bodySource);
      this._bodyBytes = extracted.bytes;
      this._bodyStream = extracted.stream;
      if (extracted.contentType && !this._headers.has("content-type")) {
        this._headers.set("content-type", extracted.contentType);
      }
    }

    this._signal = init?.signal ?? inputSignal ?? new AbortController().signal;
    this._referrer = init?.referrer ?? "about:client";
    this._referrerPolicy = init?.referrerPolicy ?? "";
    this._mode = init?.mode ?? "cors";
    this._credentials = init?.credentials ?? "same-origin";
    this._cache = init?.cache ?? "default";
    this._redirect = init?.redirect ?? "follow";
    this._integrity = init?.integrity ?? "";
    this._keepalive = init?.keepalive ?? false;
    this._duplex = init?.duplex ?? "half";
  }

  get method(): string {
    return this._method;
  }

  get url(): string {
    return this._url.href;
  }

  get headers(): CronetHeaders {
    return this._headers;
  }

  get redirect(): RequestRedirect {
    return this._redirect;
  }

  get signal(): AbortSignal {
    return this._signal;
  }

  get referrer(): string {
    return this._referrer;
  }

  get referrerPolicy(): ReferrerPolicy {
    return this._referrerPolicy;
  }

  get mode(): RequestMode {
    return this._mode;
  }

  get credentials(): RequestCredentials {
    return this._credentials;
  }

  get cache(): RequestCache {
    return this._cache;
  }

  get integrity(): string {
    return this._integrity;
  }

  get keepalive(): boolean {
    return this._keepalive;
  }

  get window(): typeof globalThis {
    return globalThis;
  }

  clone(): Request {
    if (this._bodyUsed) {
      throw new TypeError("Cannot clone a Request whose body is already used");
    }
    return new CronetRequest(this.url, {
      method: this._method,
      headers: this._headers,
      body: this._bodyBytes ?? undefined,
      signal: this._signal,
      referrer: this._referrer,
      referrerPolicy: this._referrerPolicy,
      mode: this._mode,
      credentials: this._credentials,
      cache: this._cache,
      redirect: this._redirect,
      integrity: this._integrity,
      keepalive: this._keepalive,
      duplex: this._duplex,
    });
  }
}
