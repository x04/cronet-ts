/**
 * Implements the WHATWG Fetch API Response class.
 * https://fetch.spec.whatwg.org/#response-class
 */

import { CronetHeaders, type HeadersGuard } from "./headers.js";
import { BodyMixin, extractBody, type BodyInit } from "./body.js";

export type ResponseType =
  | "basic"
  | "cors"
  | "default"
  | "error"
  | "opaque"
  | "opaqueredirect";

export class CronetResponse extends BodyMixin implements Response {
  private _status: number;
  private _statusText: string;
  private _headers: CronetHeaders;
  private _type: ResponseType;
  private _url: string;
  private _redirected: boolean;
  private _ok: boolean;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    super();

    this._status = init?.status ?? 200;
    this._statusText = init?.statusText ?? "";
    this._ok = this._status >= 200 && this._status < 300;
    this._type = "default";
    this._url = "";
    this._redirected = false;

    // Headers
    if (init?.headers !== undefined) {
      this._headers = CronetHeaders._withGuard(undefined, "response");
      const h = new CronetHeaders(init.headers as any);
      for (const [name, value] of h) {
        this._headers.append(name, value);
      }
    } else {
      this._headers = CronetHeaders._withGuard(undefined, "response");
    }

    // Body
    if (body !== null && body !== undefined) {
      const extracted = extractBody(body);
      this._bodyBytes = extracted.bytes;
      this._bodyStream = extracted.stream;
      if (extracted.contentType && !this._headers.has("content-type")) {
        this._headers.set("content-type", extracted.contentType);
      }
    }
  }

  /** Create a Response from the native Cronet response data. */
  static _fromNative(data: {
    url: string;
    status: number;
    statusText: string;
    headers: Array<{ name: string; value: string }>;
    body: Uint8Array;
    redirected: boolean;
    type?: ResponseType;
  }): CronetResponse {
    const resp = new CronetResponse();
    resp._status = data.status;
    resp._statusText = data.statusText;
    resp._ok = data.status >= 200 && data.status < 300;
    resp._url = data.url;
    resp._redirected = data.redirected;
    resp._type = data.type ?? "basic";
    resp._headers = CronetHeaders._fromRawPairs(data.headers);
    resp._bodyBytes = data.body.length > 0 ? data.body : null;
    return resp;
  }

  /** Create a streaming Response from the native Cronet response. */
  static _fromNativeStreaming(data: {
    url: string;
    status: number;
    statusText: string;
    headers: Array<{ name: string; value: string }>;
    bodyStream: ReadableStream<Uint8Array>;
    redirected: boolean;
    type?: ResponseType;
  }): CronetResponse {
    const resp = new CronetResponse();
    resp._status = data.status;
    resp._statusText = data.statusText;
    resp._ok = data.status >= 200 && data.status < 300;
    resp._url = data.url;
    resp._redirected = data.redirected;
    resp._type = data.type ?? "basic";
    resp._headers = CronetHeaders._fromRawPairs(data.headers);
    resp._bodyStream = data.bodyStream;
    return resp;
  }

  get status(): number {
    return this._status;
  }

  get statusText(): string {
    return this._statusText;
  }

  get ok(): boolean {
    return this._ok;
  }

  get headers(): CronetHeaders {
    return this._headers;
  }

  get type(): ResponseType {
    return this._type;
  }

  get url(): string {
    return this._url;
  }

  get redirected(): boolean {
    return this._redirected;
  }

  clone(): CronetResponse {
    if (this._bodyUsed) {
      throw new TypeError("Cannot clone a Response whose body is already used");
    }
    const cloned = new CronetResponse();
    cloned._status = this._status;
    cloned._statusText = this._statusText;
    cloned._ok = this._ok;
    cloned._url = this._url;
    cloned._redirected = this._redirected;
    cloned._type = this._type;
    cloned._headers = new CronetHeaders(this._headers);
    cloned._bodyBytes = this._bodyBytes ? new Uint8Array(this._bodyBytes) : null;
    // Note: streams cannot be truly cloned. A full implementation would use tee().
    cloned._bodyStream = this._bodyStream;
    return cloned;
  }

  // Static factory methods per spec

  static error(): CronetResponse {
    const resp = new CronetResponse();
    resp._status = 0;
    resp._statusText = "";
    resp._type = "error";
    resp._headers = CronetHeaders._withGuard(undefined, "immutable");
    return resp;
  }

  static redirect(url: string, status = 302): CronetResponse {
    if (![301, 302, 303, 307, 308].includes(status)) {
      throw new RangeError(`Invalid redirect status: ${status}`);
    }
    const resp = new CronetResponse(null, { status });
    resp._headers.set("location", url);
    return resp;
  }

  static json(data: unknown, init?: ResponseInit): CronetResponse {
    const body = JSON.stringify(data);
    const resp = new CronetResponse(body, init);
    if (!resp._headers.has("content-type")) {
      resp._headers.set("content-type", "application/json");
    }
    return resp;
  }
}
