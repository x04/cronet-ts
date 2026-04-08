use std::ffi::{CStr, CString};

use cronet_sys::*;
use tokio::sync::mpsc;

use crate::engine::Engine;
use crate::error::{CronetError, ErrorCode, Result};
use crate::executor::ThreadedExecutor;
use crate::upload::UploadDataProvider;

const READ_BUFFER_SIZE: u64 = 32 * 1024; // 32KB

// Send-safe wrappers for raw Cronet pointers.
// These do NOT implement Drop — cleanup is handled by StreamingResponse::drop
// which controls destruction order (request before callback before state).
struct SendableRequest(Cronet_UrlRequestPtr);
unsafe impl Send for SendableRequest {}

struct SendableCallback(Cronet_UrlRequestCallbackPtr);
unsafe impl Send for SendableCallback {}

#[derive(Debug, Clone)]
pub struct UrlResponseInfo {
    pub url: String,
    pub url_chain: Vec<String>,
    pub status_code: i32,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub was_cached: bool,
    pub negotiated_protocol: String,
    pub received_byte_count: i64,
}

impl UrlResponseInfo {
    unsafe fn from_raw(ptr: Cronet_UrlResponseInfoPtr) -> Self {
        let url = cstr_to_string(Cronet_UrlResponseInfo_url_get(ptr));

        let chain_size = Cronet_UrlResponseInfo_url_chain_size(ptr);
        let url_chain = (0..chain_size)
            .map(|i| cstr_to_string(Cronet_UrlResponseInfo_url_chain_at(ptr, i)))
            .collect();

        let status_code = Cronet_UrlResponseInfo_http_status_code_get(ptr);
        let status_text = cstr_to_string(Cronet_UrlResponseInfo_http_status_text_get(ptr));

        let header_count = Cronet_UrlResponseInfo_all_headers_list_size(ptr);
        let headers = (0..header_count)
            .map(|i| {
                let h = Cronet_UrlResponseInfo_all_headers_list_at(ptr, i);
                let name = cstr_to_string(Cronet_HttpHeader_name_get(h));
                let value = cstr_to_string(Cronet_HttpHeader_value_get(h));
                (name, value)
            })
            .collect();

        let was_cached = Cronet_UrlResponseInfo_was_cached_get(ptr);
        let negotiated_protocol =
            cstr_to_string(Cronet_UrlResponseInfo_negotiated_protocol_get(ptr));
        let received_byte_count = Cronet_UrlResponseInfo_received_byte_count_get(ptr);

        UrlResponseInfo {
            url,
            url_chain,
            status_code,
            status_text,
            headers,
            was_cached,
            negotiated_protocol,
            received_byte_count,
        }
    }
}

unsafe fn cstr_to_string(ptr: *const i8) -> String {
    if ptr.is_null() {
        String::new()
    } else {
        CStr::from_ptr(ptr).to_string_lossy().into_owned()
    }
}

/// Represents a complete HTTP response.
pub struct Response {
    pub info: UrlResponseInfo,
    pub body: Vec<u8>,
}

/// Events emitted by a request callback.
enum CallbackEvent {
    RedirectReceived {
        info: UrlResponseInfo,
        new_url: String,
    },
    ResponseStarted {
        info: UrlResponseInfo,
    },
    ReadCompleted {
        data: Vec<u8>,
    },
    Succeeded {
        info: UrlResponseInfo,
    },
    Failed {
        error: CronetError,
    },
    Cancelled,
}

struct CallbackState {
    tx: mpsc::UnboundedSender<CallbackEvent>,
    follow_redirects: bool,
    max_redirects: u32,
    redirect_count: u32,
}

unsafe extern "C" fn on_redirect_received(
    self_ptr: Cronet_UrlRequestCallbackPtr,
    request: Cronet_UrlRequestPtr,
    info: Cronet_UrlResponseInfoPtr,
    new_location_url: *const i8,
) {
    let ctx = Cronet_UrlRequestCallback_GetClientContext(self_ptr) as *mut CallbackState;
    if ctx.is_null() {
        return;
    }
    let state = &mut *ctx;
    let response_info = UrlResponseInfo::from_raw(info);
    let new_url = cstr_to_string(new_location_url);

    state.redirect_count += 1;

    if state.follow_redirects && state.redirect_count <= state.max_redirects {
        let _ = state.tx.send(CallbackEvent::RedirectReceived {
            info: response_info,
            new_url,
        });
        Cronet_UrlRequest_FollowRedirect(request);
    } else {
        let _ = state.tx.send(CallbackEvent::RedirectReceived {
            info: response_info,
            new_url,
        });
    }
}

unsafe extern "C" fn on_response_started(
    self_ptr: Cronet_UrlRequestCallbackPtr,
    request: Cronet_UrlRequestPtr,
    info: Cronet_UrlResponseInfoPtr,
) {
    let ctx = Cronet_UrlRequestCallback_GetClientContext(self_ptr) as *mut CallbackState;
    if ctx.is_null() {
        return;
    }
    let state = &*ctx;
    let response_info = UrlResponseInfo::from_raw(info);
    let _ = state.tx.send(CallbackEvent::ResponseStarted {
        info: response_info,
    });

    // Start reading the body
    let buffer = Cronet_Buffer_Create();
    Cronet_Buffer_InitWithAlloc(buffer, READ_BUFFER_SIZE);
    Cronet_UrlRequest_Read(request, buffer);
}

unsafe extern "C" fn on_read_completed(
    self_ptr: Cronet_UrlRequestCallbackPtr,
    request: Cronet_UrlRequestPtr,
    _info: Cronet_UrlResponseInfoPtr,
    buffer: Cronet_BufferPtr,
    bytes_read: u64,
) {
    let ctx = Cronet_UrlRequestCallback_GetClientContext(self_ptr) as *mut CallbackState;
    if ctx.is_null() {
        return;
    }
    let state = &*ctx;

    if bytes_read > 0 {
        let data_ptr = Cronet_Buffer_GetData(buffer) as *const u8;
        let data = std::slice::from_raw_parts(data_ptr, bytes_read as usize).to_vec();
        let _ = state.tx.send(CallbackEvent::ReadCompleted { data });
    }

    // Continue reading
    Cronet_Buffer_InitWithAlloc(buffer, READ_BUFFER_SIZE);
    Cronet_UrlRequest_Read(request, buffer);
}

unsafe extern "C" fn on_succeeded(
    self_ptr: Cronet_UrlRequestCallbackPtr,
    _request: Cronet_UrlRequestPtr,
    info: Cronet_UrlResponseInfoPtr,
) {
    let ctx = Cronet_UrlRequestCallback_GetClientContext(self_ptr) as *mut CallbackState;
    if ctx.is_null() {
        return;
    }
    let state = &*ctx;
    let response_info = UrlResponseInfo::from_raw(info);
    let _ = state.tx.send(CallbackEvent::Succeeded {
        info: response_info,
    });
}

unsafe extern "C" fn on_failed(
    self_ptr: Cronet_UrlRequestCallbackPtr,
    _request: Cronet_UrlRequestPtr,
    _info: Cronet_UrlResponseInfoPtr,
    error: Cronet_ErrorPtr,
) {
    let ctx = Cronet_UrlRequestCallback_GetClientContext(self_ptr) as *mut CallbackState;
    if ctx.is_null() {
        return;
    }
    let state = &*ctx;
    let code = ErrorCode::from_raw(Cronet_Error_error_code_get(error));
    let message = cstr_to_string(Cronet_Error_message_get(error));
    let _ = state.tx.send(CallbackEvent::Failed {
        error: CronetError::Network { code, message },
    });
}

unsafe extern "C" fn on_canceled(
    self_ptr: Cronet_UrlRequestCallbackPtr,
    _request: Cronet_UrlRequestPtr,
    _info: Cronet_UrlResponseInfoPtr,
) {
    let ctx = Cronet_UrlRequestCallback_GetClientContext(self_ptr) as *mut CallbackState;
    if ctx.is_null() {
        return;
    }
    let state = &*ctx;
    let _ = state.tx.send(CallbackEvent::Cancelled);
}

/// Configuration for a single HTTP request.
pub struct RequestConfig {
    pub url: String,
    pub method: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Vec<u8>>,
    pub follow_redirects: bool,
    pub max_redirects: u32,
    pub disable_cache: bool,
}

impl Default for RequestConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            method: "GET".to_string(),
            headers: Vec::new(),
            body: None,
            follow_redirects: true,
            max_redirects: 20,
            disable_cache: false,
        }
    }
}

/// Streaming response — provides headers before body is fully read.
/// Owns the executor, request, and callback to keep them alive.
pub struct StreamingResponse {
    pub info: UrlResponseInfo,
    body_rx: mpsc::UnboundedReceiver<CallbackEvent>,
    _executor: ThreadedExecutor,
    _request: SendableRequest,
    _callback: SendableCallback,
}

impl Drop for StreamingResponse {
    fn drop(&mut self) {
        unsafe {
            // Destroy the request first — this may synchronously fire on_canceled
            // which is fine since the callback and state are still alive.
            if !self._request.0.is_null() {
                Cronet_UrlRequest_Destroy(self._request.0);
                self._request.0 = std::ptr::null_mut();
            }

            // Reclaim the CallbackState that was Box::into_raw'd during setup,
            // then destroy the callback object.
            if !self._callback.0.is_null() {
                let ctx =
                    Cronet_UrlRequestCallback_GetClientContext(self._callback.0) as *mut CallbackState;
                if !ctx.is_null() {
                    // Set context to null first to prevent callbacks from using freed state
                    Cronet_UrlRequestCallback_SetClientContext(
                        self._callback.0,
                        std::ptr::null_mut(),
                    );
                    drop(Box::from_raw(ctx));
                }
                Cronet_UrlRequestCallback_Destroy(self._callback.0);
                self._callback.0 = std::ptr::null_mut();
            }
        }
    }
}

impl StreamingResponse {
    /// Read the next chunk of the body. Returns None when complete.
    pub async fn next_chunk(&mut self) -> Result<Option<Vec<u8>>> {
        loop {
            match self.body_rx.recv().await {
                Some(CallbackEvent::ReadCompleted { data }) => return Ok(Some(data)),
                Some(CallbackEvent::Succeeded { .. }) => return Ok(None),
                Some(CallbackEvent::Failed { error }) => return Err(error),
                Some(CallbackEvent::Cancelled) => return Err(CronetError::Cancelled),
                None => return Ok(None),
                _ => continue,
            }
        }
    }

    /// Consume the entire remaining body into a Vec<u8>.
    pub async fn collect_body(mut self) -> Result<Vec<u8>> {
        let mut body = Vec::new();
        while let Some(chunk) = self.next_chunk().await? {
            body.extend_from_slice(&chunk);
        }
        Ok(body)
    }
}

pub struct Request;

impl Request {
    /// Execute a full request, collecting the entire response body.
    pub async fn execute(engine: &Engine, config: RequestConfig) -> Result<Response> {
        let streaming = Self::execute_streaming(engine, config).await?;
        let info = streaming.info.clone();
        let body = streaming.collect_body().await?;
        Ok(Response { info, body })
    }

    /// Execute a request with streaming response.
    /// Returns as soon as response headers are received.
    pub async fn execute_streaming(
        engine: &Engine,
        config: RequestConfig,
    ) -> Result<StreamingResponse> {
        let (tx, mut rx) = mpsc::unbounded_channel::<CallbackEvent>();

        let state = Box::new(CallbackState {
            tx,
            follow_redirects: config.follow_redirects,
            max_redirects: config.max_redirects,
            redirect_count: 0,
        });

        let (callback, request, executor, _upload_provider) = unsafe {
            let cb = SendableCallback(Cronet_UrlRequestCallback_CreateWith(
                Some(on_redirect_received),
                Some(on_response_started),
                Some(on_read_completed),
                Some(on_succeeded),
                Some(on_failed),
                Some(on_canceled),
            ));
            Cronet_UrlRequestCallback_SetClientContext(
                cb.0,
                Box::into_raw(state) as *mut _,
            );

            let executor = ThreadedExecutor::new();
            let req = SendableRequest(Cronet_UrlRequest_Create());
            let params = Cronet_UrlRequestParams_Create();

            // Set method
            let c_method = CString::new(config.method.as_str()).unwrap();
            Cronet_UrlRequestParams_http_method_set(params, c_method.as_ptr());

            // Set headers
            for (name, value) in &config.headers {
                let header = Cronet_HttpHeader_Create();
                let c_name = CString::new(name.as_str()).unwrap();
                let c_value = CString::new(value.as_str()).unwrap();
                Cronet_HttpHeader_name_set(header, c_name.as_ptr());
                Cronet_HttpHeader_value_set(header, c_value.as_ptr());
                Cronet_UrlRequestParams_request_headers_add(params, header);
                Cronet_HttpHeader_Destroy(header);
            }

            Cronet_UrlRequestParams_disable_cache_set(params, config.disable_cache);

            // Set upload body if present
            let upload_provider = if let Some(body_data) = config.body {
                let provider = UploadDataProvider::from_bytes(body_data);
                Cronet_UrlRequestParams_upload_data_provider_set(params, provider.ptr);
                Cronet_UrlRequestParams_upload_data_provider_executor_set(
                    params,
                    executor.ptr,
                );
                Some(provider)
            } else {
                None
            };

            // Initialize and start the request
            let c_url = CString::new(config.url.as_str()).unwrap();
            let result = Cronet_UrlRequest_InitWithParams(
                req.0,
                engine.ptr,
                c_url.as_ptr(),
                params,
                cb.0,
                executor.ptr,
            );
            Cronet_UrlRequestParams_Destroy(params);
            CronetError::check(result)?;

            let result = Cronet_UrlRequest_Start(req.0);
            CronetError::check(result)?;

            (cb, req, executor, upload_provider)
        };

        // Wait for response headers (or redirect or error)
        loop {
            match rx.recv().await {
                Some(CallbackEvent::RedirectReceived { info, .. }) => {
                    if !config.follow_redirects {
                        return Ok(StreamingResponse {
                            info,
                            body_rx: rx,
                            _executor: executor,
                            _request: request,
                            _callback: callback,
                        });
                    }
                    continue;
                }
                Some(CallbackEvent::ResponseStarted { info }) => {
                    return Ok(StreamingResponse {
                        info,
                        body_rx: rx,
                        _executor: executor,
                        _request: request,
                        _callback: callback,
                    });
                }
                Some(CallbackEvent::Failed { error }) => return Err(error),
                Some(CallbackEvent::Cancelled) => return Err(CronetError::Cancelled),
                None => {
                    return Err(CronetError::Api(
                        "callback channel closed unexpectedly".into(),
                    ));
                }
                _ => continue,
            }
        }
    }
}
