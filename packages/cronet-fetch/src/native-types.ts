/**
 * Types for the cronet-node native addon interface.
 * These mirror the napi-rs exported types.
 */

export interface NapiRequestConfig {
  url: string;
  method?: string;
  headers?: string[][];
  body?: Buffer;
  followRedirects?: boolean;
  maxRedirects?: number;
  disableCache?: boolean;
  proxyUrl?: string;
  disableCookieJar?: boolean;
}

export interface NapiResponseHeader {
  name: string;
  value: string;
}

export interface NapiResponse {
  url: string;
  status: number;
  statusText: string;
  headers: NapiResponseHeader[];
  body: Buffer;
  redirected: boolean;
  wasCached: boolean;
  protocol: string;
}
