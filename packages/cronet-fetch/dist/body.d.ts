/**
 * Body mixin implementation for Request and Response.
 * https://fetch.spec.whatwg.org/#body-mixin
 */
export type BodyInit = ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array> | URLSearchParams | string | Blob | FormData | null;
export declare function extractBody(body: BodyInit | undefined | null): {
    bytes: Uint8Array | null;
    contentType: string | null;
    stream: ReadableStream<Uint8Array> | null;
};
export declare function consumeBody(bodyBytes: Uint8Array | null, bodyStream: ReadableStream<Uint8Array> | null, bodyUsed: boolean): Promise<Uint8Array>;
export declare class BodyMixin {
    protected _bodyBytes: Uint8Array | null;
    protected _bodyStream: ReadableStream<Uint8Array> | null;
    protected _bodyUsed: boolean;
    get body(): ReadableStream<Uint8Array<ArrayBuffer>> | null;
    get bodyUsed(): boolean;
    /** Internal: get raw body bytes without consuming. */
    getBodyBytes(): Uint8Array | null;
    arrayBuffer(): Promise<ArrayBuffer>;
    blob(): Promise<Blob>;
    bytes(): Promise<Uint8Array<ArrayBuffer>>;
    formData(): Promise<FormData>;
    json(): Promise<unknown>;
    text(): Promise<string>;
}
//# sourceMappingURL=body.d.ts.map