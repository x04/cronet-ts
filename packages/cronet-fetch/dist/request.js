/**
 * Implements the WHATWG Fetch API Request class.
 * https://fetch.spec.whatwg.org/#request-class
 */
import { CronetHeaders } from "./headers.js";
import { BodyMixin, extractBody } from "./body.js";
const KNOWN_METHODS = new Set([
    "DELETE",
    "GET",
    "HEAD",
    "OPTIONS",
    "POST",
    "PUT",
    "PATCH",
]);
function normalizeMethod(method) {
    const upper = method.toUpperCase();
    if (KNOWN_METHODS.has(upper))
        return upper;
    return method;
}
const NO_BODY_METHODS = new Set(["GET", "HEAD"]);
export class CronetRequest extends BodyMixin {
    _method;
    _url;
    _headers;
    _signal;
    _referrer;
    _referrerPolicy;
    _mode;
    _credentials;
    _cache;
    _redirect;
    _integrity;
    _keepalive;
    _duplex;
    destination = "";
    isHistoryNavigation = false;
    isReloadNavigation = false;
    constructor(input, init) {
        super();
        let url;
        let inputHeaders;
        let inputMethod = "GET";
        let inputBody = null;
        let inputSignal = null;
        if (input instanceof CronetRequest) {
            url = new URL(input.url);
            inputHeaders = new CronetHeaders(input.headers);
            inputMethod = input.method;
            inputSignal = input.signal;
            if (!input.bodyUsed && input.getBodyBytes()) {
                inputBody = input.getBodyBytes();
            }
        }
        else if (input instanceof URL) {
            url = input;
        }
        else if (typeof input === "string") {
            url = new URL(input);
        }
        else {
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
            const h = new CronetHeaders(init.headers);
            for (const [name, value] of h) {
                this._headers.append(name, value);
            }
        }
        else if (inputHeaders) {
            this._headers = CronetHeaders._withGuard(undefined, "request");
            for (const [name, value] of inputHeaders) {
                this._headers.append(name, value);
            }
        }
        else {
            this._headers = CronetHeaders._withGuard(undefined, "request");
        }
        // Body
        const bodySource = init?.body !== undefined ? init.body : inputBody;
        if (bodySource !== null && bodySource !== undefined) {
            if (NO_BODY_METHODS.has(this._method)) {
                throw new TypeError(`Request with ${this._method} method cannot have body`);
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
    get method() {
        return this._method;
    }
    get url() {
        return this._url.href;
    }
    get headers() {
        return this._headers;
    }
    get redirect() {
        return this._redirect;
    }
    get signal() {
        return this._signal;
    }
    get referrer() {
        return this._referrer;
    }
    get referrerPolicy() {
        return this._referrerPolicy;
    }
    get mode() {
        return this._mode;
    }
    get credentials() {
        return this._credentials;
    }
    get cache() {
        return this._cache;
    }
    get integrity() {
        return this._integrity;
    }
    get keepalive() {
        return this._keepalive;
    }
    get window() {
        return globalThis;
    }
    clone() {
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
//# sourceMappingURL=request.js.map