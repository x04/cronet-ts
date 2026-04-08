use std::ffi::{CStr, CString};

use cronet_sys::*;

use crate::error::{CronetError, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpCacheMode {
    Disabled,
    InMemory,
    DiskNoHttp,
    Disk,
}

impl HttpCacheMode {
    fn to_raw(self) -> Cronet_EngineParams_HTTP_CACHE_MODE {
        match self {
            Self::Disabled => Cronet_EngineParams_HTTP_CACHE_MODE_Cronet_EngineParams_HTTP_CACHE_MODE_DISABLED,
            Self::InMemory => Cronet_EngineParams_HTTP_CACHE_MODE_Cronet_EngineParams_HTTP_CACHE_MODE_IN_MEMORY,
            Self::DiskNoHttp => Cronet_EngineParams_HTTP_CACHE_MODE_Cronet_EngineParams_HTTP_CACHE_MODE_DISK_NO_HTTP,
            Self::Disk => Cronet_EngineParams_HTTP_CACHE_MODE_Cronet_EngineParams_HTTP_CACHE_MODE_DISK,
        }
    }
}

pub struct EngineParams {
    pub user_agent: Option<String>,
    pub enable_quic: bool,
    pub enable_http2: bool,
    pub enable_brotli: bool,
    pub http_cache_mode: HttpCacheMode,
    pub http_cache_max_size: i64,
    pub storage_path: Option<String>,
    pub accept_language: Option<String>,
    pub experimental_options: Option<String>,
    pub proxy_url: Option<String>,
}

impl Default for EngineParams {
    fn default() -> Self {
        Self {
            user_agent: None,
            enable_quic: true,
            enable_http2: true,
            enable_brotli: true,
            http_cache_mode: HttpCacheMode::InMemory,
            http_cache_max_size: 10 * 1024 * 1024, // 10MB
            storage_path: None,
            accept_language: None,
            experimental_options: None,
            proxy_url: None,
        }
    }
}

pub struct Engine {
    pub(crate) ptr: Cronet_EnginePtr,
}

unsafe impl Send for Engine {}
unsafe impl Sync for Engine {}

impl Engine {
    pub fn new(params: EngineParams) -> Result<Self> {
        unsafe {
            let engine = Cronet_Engine_Create();
            if engine.is_null() {
                return Err(CronetError::Api("failed to create engine".into()));
            }

            let raw_params = Cronet_EngineParams_Create();

            if let Some(ref ua) = params.user_agent {
                let c_ua = CString::new(ua.as_str()).unwrap();
                Cronet_EngineParams_user_agent_set(raw_params, c_ua.as_ptr());
            }

            if let Some(ref lang) = params.accept_language {
                let c_lang = CString::new(lang.as_str()).unwrap();
                Cronet_EngineParams_accept_language_set(raw_params, c_lang.as_ptr());
            }

            if let Some(ref path) = params.storage_path {
                let c_path = CString::new(path.as_str()).unwrap();
                Cronet_EngineParams_storage_path_set(raw_params, c_path.as_ptr());
            }

            // Merge proxy_url into experimental_options JSON
            let experimental_options = match (&params.experimental_options, &params.proxy_url) {
                (Some(opts), Some(proxy)) => {
                    // Parse existing options, inject proxy
                    let mut parsed: serde_json::Value =
                        serde_json::from_str(opts).unwrap_or(serde_json::json!({}));
                    parsed["proxy"] = serde_json::json!({"url": proxy});
                    Some(parsed.to_string())
                }
                (None, Some(proxy)) => {
                    Some(format!(r#"{{"proxy":{{"url":"{}"}}}}"#, proxy))
                }
                (Some(opts), None) => Some(opts.clone()),
                (None, None) => None,
            };
            if let Some(ref opts) = experimental_options {
                let c_opts = CString::new(opts.as_str()).unwrap();
                Cronet_EngineParams_experimental_options_set(raw_params, c_opts.as_ptr());
            }

            Cronet_EngineParams_enable_quic_set(raw_params, params.enable_quic);
            Cronet_EngineParams_enable_http2_set(raw_params, params.enable_http2);
            Cronet_EngineParams_enable_brotli_set(raw_params, params.enable_brotli);
            Cronet_EngineParams_http_cache_mode_set(raw_params, params.http_cache_mode.to_raw());
            Cronet_EngineParams_http_cache_max_size_set(raw_params, params.http_cache_max_size);

            let result = Cronet_Engine_StartWithParams(engine, raw_params);
            Cronet_EngineParams_Destroy(raw_params);

            CronetError::check(result)?;

            Ok(Engine { ptr: engine })
        }
    }

    pub fn version(&self) -> String {
        unsafe {
            let v = Cronet_Engine_GetVersionString(self.ptr);
            if v.is_null() {
                return String::new();
            }
            CStr::from_ptr(v).to_string_lossy().into_owned()
        }
    }

    pub fn default_user_agent(&self) -> String {
        unsafe {
            let v = Cronet_Engine_GetDefaultUserAgent(self.ptr);
            if v.is_null() {
                return String::new();
            }
            CStr::from_ptr(v).to_string_lossy().into_owned()
        }
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        unsafe {
            let _ = Cronet_Engine_Shutdown(self.ptr);
            Cronet_Engine_Destroy(self.ptr);
        }
    }
}
