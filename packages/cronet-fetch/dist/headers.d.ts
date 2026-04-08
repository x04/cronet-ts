/**
 * Implements the WHATWG Fetch API Headers interface.
 * https://fetch.spec.whatwg.org/#headers-class
 */
type HeaderInit = Headers | Record<string, string> | Iterable<readonly [string, string]> | Array<[string, string]>;
export type HeadersGuard = "immutable" | "request" | "request-no-cors" | "response" | "none";
export declare class CronetHeaders implements Headers {
    private _headers;
    private _guard;
    constructor(init?: HeaderInit);
    static _withGuard(init: HeaderInit | undefined, guard: HeadersGuard): CronetHeaders;
    static _fromRawPairs(pairs: Array<{
        name: string;
        value: string;
    }>): CronetHeaders;
    private _fill;
    private _checkImmutable;
    append(name: string, value: string): void;
    delete(name: string): void;
    get(name: string): string | null;
    getSetCookie(): string[];
    has(name: string): boolean;
    set(name: string, value: string): void;
    forEach(callbackfn: (value: string, key: string, parent: Headers) => void, thisArg?: unknown): void;
    entries(): HeadersIterator<[string, string]>;
    keys(): HeadersIterator<string>;
    values(): HeadersIterator<string>;
    [Symbol.iterator](): HeadersIterator<[string, string]>;
    /** Internal: convert to array of [name, value] pairs for the native layer */
    _toPairs(): Array<[string, string]>;
}
type HeadersIterator<T> = IterableIterator<T>;
export {};
//# sourceMappingURL=headers.d.ts.map