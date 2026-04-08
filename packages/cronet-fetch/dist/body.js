/**
 * Body mixin implementation for Request and Response.
 * https://fetch.spec.whatwg.org/#body-mixin
 */
export function extractBody(body) {
    if (body === null || body === undefined) {
        return { bytes: null, contentType: null, stream: null };
    }
    if (typeof body === "string") {
        const encoded = new TextEncoder().encode(body);
        return {
            bytes: encoded,
            contentType: "text/plain;charset=UTF-8",
            stream: null,
        };
    }
    if (body instanceof ArrayBuffer) {
        return {
            bytes: new Uint8Array(body),
            contentType: null,
            stream: null,
        };
    }
    if (ArrayBuffer.isView(body)) {
        return {
            bytes: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
            contentType: null,
            stream: null,
        };
    }
    if (body instanceof URLSearchParams) {
        const encoded = new TextEncoder().encode(body.toString());
        return {
            bytes: encoded,
            contentType: "application/x-www-form-urlencoded;charset=UTF-8",
            stream: null,
        };
    }
    if (body instanceof ReadableStream) {
        return { bytes: null, contentType: null, stream: body };
    }
    // Blob
    if (typeof Blob !== "undefined" && body instanceof Blob) {
        // We'll convert synchronously via arrayBuffer in the caller
        return {
            bytes: null,
            contentType: body.type || null,
            stream: body.stream(),
        };
    }
    // FormData — serialize as multipart
    if (typeof FormData !== "undefined" && body instanceof FormData) {
        // Node.js FormData doesn't have a direct serialize method that gives us bytes.
        // Use the built-in approach: convert to a Request to get the body.
        // For now, serialize as URLSearchParams for simple cases.
        const params = new URLSearchParams();
        for (const [key, value] of body.entries()) {
            if (typeof value === "string") {
                params.append(key, value);
            }
        }
        const encoded = new TextEncoder().encode(params.toString());
        return {
            bytes: encoded,
            contentType: "application/x-www-form-urlencoded;charset=UTF-8",
            stream: null,
        };
    }
    throw new TypeError("Unsupported body type");
}
export async function consumeBody(bodyBytes, bodyStream, bodyUsed) {
    if (bodyUsed) {
        throw new TypeError("Body already consumed");
    }
    if (bodyBytes !== null) {
        return bodyBytes;
    }
    if (bodyStream !== null) {
        const reader = bodyStream.getReader();
        const chunks = [];
        let totalLength = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            chunks.push(value);
            totalLength += value.byteLength;
        }
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return result;
    }
    return new Uint8Array(0);
}
export class BodyMixin {
    _bodyBytes = null;
    _bodyStream = null;
    _bodyUsed = false;
    get body() {
        if (this._bodyStream)
            return this._bodyStream;
        if (this._bodyBytes === null)
            return null;
        // Create a ReadableStream from the bytes
        const bytes = new Uint8Array(this._bodyBytes);
        return new ReadableStream({
            start(controller) {
                controller.enqueue(bytes);
                controller.close();
            },
        });
    }
    get bodyUsed() {
        return this._bodyUsed;
    }
    /** Internal: get raw body bytes without consuming. */
    getBodyBytes() {
        return this._bodyBytes;
    }
    async arrayBuffer() {
        const bytes = await consumeBody(this._bodyBytes, this._bodyStream, this._bodyUsed);
        this._bodyUsed = true;
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    async blob() {
        const buf = await this.arrayBuffer();
        return new Blob([buf]);
    }
    async bytes() {
        const bytes = await consumeBody(this._bodyBytes, this._bodyStream, this._bodyUsed);
        this._bodyUsed = true;
        return new Uint8Array(bytes);
    }
    async formData() {
        // Basic implementation — only handles URL-encoded forms
        const text = await this.text();
        const params = new URLSearchParams(text);
        const fd = new FormData();
        for (const [key, value] of params) {
            fd.append(key, value);
        }
        return fd;
    }
    async json() {
        const text = await this.text();
        return JSON.parse(text);
    }
    async text() {
        const bytes = await consumeBody(this._bodyBytes, this._bodyStream, this._bodyUsed);
        this._bodyUsed = true;
        return new TextDecoder().decode(bytes);
    }
}
//# sourceMappingURL=body.js.map