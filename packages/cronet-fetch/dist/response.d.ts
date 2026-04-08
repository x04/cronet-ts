/**
 * Implements the WHATWG Fetch API Response class.
 * https://fetch.spec.whatwg.org/#response-class
 */
import { CronetHeaders } from "./headers.js";
import { BodyMixin, type BodyInit } from "./body.js";
export type ResponseType = "basic" | "cors" | "default" | "error" | "opaque" | "opaqueredirect";
export declare class CronetResponse extends BodyMixin implements Response {
    private _status;
    private _statusText;
    private _headers;
    private _type;
    private _url;
    private _redirected;
    private _ok;
    constructor(body?: BodyInit | null, init?: ResponseInit);
    /** Create a Response from the native Cronet response data. */
    static _fromNative(data: {
        url: string;
        status: number;
        statusText: string;
        headers: Array<{
            name: string;
            value: string;
        }>;
        body: Uint8Array;
        redirected: boolean;
        type?: ResponseType;
    }): CronetResponse;
    /** Create a streaming Response from the native Cronet response. */
    static _fromNativeStreaming(data: {
        url: string;
        status: number;
        statusText: string;
        headers: Array<{
            name: string;
            value: string;
        }>;
        bodyStream: ReadableStream<Uint8Array>;
        redirected: boolean;
        type?: ResponseType;
    }): CronetResponse;
    get status(): number;
    get statusText(): string;
    get ok(): boolean;
    get headers(): CronetHeaders;
    get type(): ResponseType;
    get url(): string;
    get redirected(): boolean;
    clone(): CronetResponse;
    static error(): CronetResponse;
    static redirect(url: string, status?: number): CronetResponse;
    static json(data: unknown, init?: ResponseInit): CronetResponse;
}
//# sourceMappingURL=response.d.ts.map