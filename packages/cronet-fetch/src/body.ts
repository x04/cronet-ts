/**
 * Body mixin implementation for Request and Response.
 * https://fetch.spec.whatwg.org/#body-mixin
 */

export type BodyInit =
  | ArrayBuffer
  | ArrayBufferView
  | ReadableStream<Uint8Array>
  | URLSearchParams
  | string
  | Blob
  | FormData
  | null;

export function extractBody(
  body: BodyInit | undefined | null
): { bytes: Uint8Array | null; contentType: string | null; stream: ReadableStream<Uint8Array> | null } {
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
    return { bytes: null, contentType: null, stream: body as ReadableStream<Uint8Array> };
  }

  // Blob
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    // We'll convert synchronously via arrayBuffer in the caller
    return {
      bytes: null,
      contentType: body.type || null,
      stream: body.stream() as ReadableStream<Uint8Array>,
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

export async function consumeBody(
  bodyBytes: Uint8Array | null,
  bodyStream: ReadableStream<Uint8Array> | null,
  bodyUsed: boolean
): Promise<Uint8Array> {
  if (bodyUsed) {
    throw new TypeError("Body already consumed");
  }

  if (bodyBytes !== null) {
    return bodyBytes;
  }

  if (bodyStream !== null) {
    const reader = bodyStream.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
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
  protected _bodyBytes: Uint8Array | null = null;
  protected _bodyStream: ReadableStream<Uint8Array> | null = null;
  protected _bodyUsed = false;

  get body(): ReadableStream<Uint8Array<ArrayBuffer>> | null {
    if (this._bodyStream) return this._bodyStream as ReadableStream<Uint8Array<ArrayBuffer>>;
    if (this._bodyBytes === null) return null;

    // Create a ReadableStream from the bytes
    const bytes = new Uint8Array(this._bodyBytes) as Uint8Array<ArrayBuffer>;
    return new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }

  get bodyUsed(): boolean {
    return this._bodyUsed;
  }

  /** Internal: get raw body bytes without consuming. */
  getBodyBytes(): Uint8Array | null {
    return this._bodyBytes;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const bytes = await consumeBody(this._bodyBytes, this._bodyStream, this._bodyUsed);
    this._bodyUsed = true;
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
  }

  async blob(): Promise<Blob> {
    const buf = await this.arrayBuffer();
    return new Blob([buf]);
  }

  async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    const bytes = await consumeBody(this._bodyBytes, this._bodyStream, this._bodyUsed);
    this._bodyUsed = true;
    return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
  }

  async formData(): Promise<FormData> {
    // Basic implementation — only handles URL-encoded forms
    const text = await this.text();
    const params = new URLSearchParams(text);
    const fd = new FormData();
    for (const [key, value] of params) {
      fd.append(key, value);
    }
    return fd;
  }

  async json(): Promise<unknown> {
    const text = await this.text();
    return JSON.parse(text);
  }

  async text(): Promise<string> {
    const bytes = await consumeBody(this._bodyBytes, this._bodyStream, this._bodyUsed);
    this._bodyUsed = true;
    return new TextDecoder().decode(bytes);
  }
}
