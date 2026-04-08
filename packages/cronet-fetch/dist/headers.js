/**
 * Implements the WHATWG Fetch API Headers interface.
 * https://fetch.spec.whatwg.org/#headers-class
 */
function normalizeHeaderName(name) {
    const normalized = name.toLowerCase();
    if (!/^[a-z0-9!#$%&'*+\-.^_`|~]+$/i.test(name)) {
        throw new TypeError(`Invalid header name: "${name}"`);
    }
    return normalized;
}
function normalizeHeaderValue(value) {
    return value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
}
// In a browser, certain headers are forbidden for security (CORS).
// cronet-ts is a server-side library — no restrictions apply.
const FORBIDDEN_HEADERS = new Set();
const FORBIDDEN_RESPONSE_HEADERS = new Set();
export class CronetHeaders {
    _headers = new Map();
    _guard = "none";
    constructor(init) {
        if (init) {
            this._fill(init);
        }
    }
    static _withGuard(init, guard) {
        const h = new CronetHeaders(init);
        h._guard = guard;
        return h;
    }
    static _fromRawPairs(pairs) {
        const h = new CronetHeaders();
        for (const { name, value } of pairs) {
            const key = name.toLowerCase();
            const existing = h._headers.get(key);
            if (existing) {
                existing.push(value);
            }
            else {
                h._headers.set(key, [value]);
            }
        }
        return h;
    }
    _fill(init) {
        if (init instanceof CronetHeaders) {
            for (const [name, values] of init._headers) {
                this._headers.set(name, [...values]);
            }
        }
        else if (Symbol.iterator in Object(init)) {
            for (const pair of init) {
                const arr = Array.from(pair);
                if (arr.length !== 2) {
                    throw new TypeError("Each header pair must be an iterable of exactly two items");
                }
                this.append(arr[0], arr[1]);
            }
        }
        else if (typeof init === "object") {
            for (const [name, value] of Object.entries(init)) {
                this.append(name, value);
            }
        }
    }
    _checkImmutable() {
        if (this._guard === "immutable") {
            throw new TypeError("Cannot modify immutable Headers");
        }
    }
    append(name, value) {
        this._checkImmutable();
        const normalized = normalizeHeaderName(name);
        const normalizedValue = normalizeHeaderValue(value);
        if (this._guard === "request" &&
            FORBIDDEN_HEADERS.has(normalized)) {
            return;
        }
        if (this._guard === "response" &&
            FORBIDDEN_RESPONSE_HEADERS.has(normalized)) {
            return;
        }
        const existing = this._headers.get(normalized);
        if (existing) {
            existing.push(normalizedValue);
        }
        else {
            this._headers.set(normalized, [normalizedValue]);
        }
    }
    delete(name) {
        this._checkImmutable();
        const normalized = normalizeHeaderName(name);
        if (this._guard === "request" &&
            FORBIDDEN_HEADERS.has(normalized)) {
            return;
        }
        this._headers.delete(normalized);
    }
    get(name) {
        const normalized = normalizeHeaderName(name);
        const values = this._headers.get(normalized);
        if (!values || values.length === 0)
            return null;
        return values.join(", ");
    }
    getSetCookie() {
        return this._headers.get("set-cookie") ?? [];
    }
    has(name) {
        const normalized = normalizeHeaderName(name);
        return this._headers.has(normalized);
    }
    set(name, value) {
        this._checkImmutable();
        const normalized = normalizeHeaderName(name);
        const normalizedValue = normalizeHeaderValue(value);
        if (this._guard === "request" &&
            FORBIDDEN_HEADERS.has(normalized)) {
            return;
        }
        this._headers.set(normalized, [normalizedValue]);
    }
    forEach(callbackfn, thisArg) {
        const sorted = [...this._headers.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        for (const [name, values] of sorted) {
            callbackfn.call(thisArg, values.join(", "), name, this);
        }
    }
    *entries() {
        const sorted = [...this._headers.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        for (const [name, values] of sorted) {
            yield [name, values.join(", ")];
        }
    }
    *keys() {
        const sorted = [...this._headers.keys()].sort();
        for (const name of sorted) {
            yield name;
        }
    }
    *values() {
        const sorted = [...this._headers.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        for (const [, values] of sorted) {
            yield values.join(", ");
        }
    }
    [Symbol.iterator]() {
        return this.entries();
    }
    /** Internal: convert to array of [name, value] pairs for the native layer */
    _toPairs() {
        const pairs = [];
        for (const [name, values] of this._headers) {
            for (const value of values) {
                pairs.push([name, value]);
            }
        }
        return pairs;
    }
}
//# sourceMappingURL=headers.js.map