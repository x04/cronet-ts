use napi::bindgen_prelude::*;
use napi::threadsafe_function::{
    ErrorStrategy, ThreadSafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode,
};
use napi_derive::napi;
use once_cell::sync::OnceCell;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use cronet::{
    Engine, EngineParams, HttpCacheMode, Request as CronetRequest, RequestConfig,
};

static RUNTIME: OnceCell<tokio::runtime::Runtime> = OnceCell::new();
static ENGINE: OnceCell<Arc<Engine>> = OnceCell::new();
static ENGINE_PARAMS: OnceCell<EngineParams> = OnceCell::new();
// Pool of proxy-specific engines, keyed by proxy URL
static PROXY_ENGINES: OnceCell<Mutex<HashMap<String, Arc<Engine>>>> = OnceCell::new();

fn get_runtime() -> &'static tokio::runtime::Runtime {
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .worker_threads(4)
            .build()
            .expect("Failed to create tokio runtime")
    })
}

fn get_engine() -> &'static Arc<Engine> {
    ENGINE.get_or_init(|| {
        Arc::new(
            Engine::new(EngineParams {
                enable_quic: true,
                enable_http2: true,
                enable_brotli: true,
                http_cache_mode: HttpCacheMode::InMemory,
                http_cache_max_size: 10 * 1024 * 1024,
                ..Default::default()
            })
            .expect("Failed to create Cronet engine"),
        )
    })
}

fn get_proxy_engines() -> &'static Mutex<HashMap<String, Arc<Engine>>> {
    PROXY_ENGINES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_engine_for_proxy(proxy_url: &str) -> Result<Arc<Engine>> {
    let mut engines = get_proxy_engines()
        .lock()
        .map_err(|_| Error::from_reason("Engine pool lock poisoned"))?;

    if let Some(engine) = engines.get(proxy_url) {
        return Ok(engine.clone());
    }

    // Build params matching the base engine config but with this proxy
    let base = ENGINE_PARAMS.get();
    let params = EngineParams {
        user_agent: base.and_then(|p| p.user_agent.clone()),
        enable_quic: base.map_or(true, |p| p.enable_quic),
        enable_http2: base.map_or(true, |p| p.enable_http2),
        enable_brotli: base.map_or(true, |p| p.enable_brotli),
        http_cache_mode: base.map_or(HttpCacheMode::InMemory, |p| p.http_cache_mode),
        http_cache_max_size: base.map_or(10 * 1024 * 1024, |p| p.http_cache_max_size),
        proxy_url: Some(proxy_url.to_string()),
        ..Default::default()
    };

    let engine = Arc::new(
        Engine::new(params)
            .map_err(|e| Error::from_reason(format!("Failed to create proxy engine: {e}")))?,
    );
    engines.insert(proxy_url.to_string(), engine.clone());
    Ok(engine)
}

#[napi(object)]
pub struct NapiEngineConfig {
    pub user_agent: Option<String>,
    pub enable_quic: Option<bool>,
    pub enable_http2: Option<bool>,
    pub enable_brotli: Option<bool>,
    pub cache_mode: Option<String>,
    pub cache_max_size: Option<i64>,
    pub proxy_url: Option<String>,
}

#[napi]
pub fn init_engine(config: Option<NapiEngineConfig>) -> Result<()> {
    let params = if let Some(cfg) = config {
        EngineParams {
            user_agent: cfg.user_agent,
            enable_quic: cfg.enable_quic.unwrap_or(true),
            enable_http2: cfg.enable_http2.unwrap_or(true),
            enable_brotli: cfg.enable_brotli.unwrap_or(true),
            http_cache_mode: match cfg.cache_mode.as_deref() {
                Some("disabled") => HttpCacheMode::Disabled,
                Some("disk") => HttpCacheMode::Disk,
                Some("disk-no-http") => HttpCacheMode::DiskNoHttp,
                _ => HttpCacheMode::InMemory,
            },
            http_cache_max_size: cfg.cache_max_size.unwrap_or(10 * 1024 * 1024),
            proxy_url: cfg.proxy_url,
            ..Default::default()
        }
    } else {
        EngineParams::default()
    };

    // Store params for proxy engine creation
    let _ = ENGINE_PARAMS.set(EngineParams {
        user_agent: params.user_agent.clone(),
        enable_quic: params.enable_quic,
        enable_http2: params.enable_http2,
        enable_brotli: params.enable_brotli,
        http_cache_mode: params.http_cache_mode,
        http_cache_max_size: params.http_cache_max_size,
        proxy_url: None,
        ..Default::default()
    });

    let engine = Engine::new(params)
        .map_err(|e| Error::from_reason(format!("Failed to init Cronet engine: {e}")))?;

    ENGINE
        .set(Arc::new(engine))
        .map_err(|_| Error::from_reason("Engine already initialized"))?;

    Ok(())
}

#[napi(object)]
pub struct NapiRequestConfig {
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<Vec<Vec<String>>>,
    pub body: Option<Buffer>,
    pub follow_redirects: Option<bool>,
    pub max_redirects: Option<u32>,
    pub disable_cache: Option<bool>,
    pub proxy_url: Option<String>,
}

#[napi(object)]
pub struct NapiResponseHeader {
    pub name: String,
    pub value: String,
}

#[napi(object)]
pub struct NapiResponse {
    pub url: String,
    pub status: i32,
    pub status_text: String,
    pub headers: Vec<NapiResponseHeader>,
    pub body: Buffer,
    pub redirected: bool,
    pub was_cached: bool,
    pub protocol: String,
}

fn build_request_config(config: &NapiRequestConfig) -> RequestConfig {
    let headers = config
        .headers
        .clone()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|pair| {
            if pair.len() >= 2 {
                Some((pair[0].clone(), pair[1].clone()))
            } else {
                None
            }
        })
        .collect();

    let body = config.body.as_ref().map(|b| b.to_vec());

    RequestConfig {
        url: config.url.clone(),
        method: config.method.clone().unwrap_or_else(|| {
            if body.is_some() {
                "POST".to_string()
            } else {
                "GET".to_string()
            }
        }),
        headers,
        body,
        follow_redirects: config.follow_redirects.unwrap_or(true),
        max_redirects: config.max_redirects.unwrap_or(20),
        disable_cache: config.disable_cache.unwrap_or(false),
    }
}

fn resolve_engine(proxy_url: &Option<String>) -> Result<Arc<Engine>> {
    match proxy_url {
        Some(url) if !url.is_empty() => get_engine_for_proxy(url),
        _ => Ok(get_engine().clone()),
    }
}

fn build_napi_response(info: cronet::UrlResponseInfo, body: Vec<u8>) -> NapiResponse {
    let resp_headers = info
        .headers
        .into_iter()
        .map(|(name, value)| NapiResponseHeader { name, value })
        .collect();

    NapiResponse {
        url: info.url,
        status: info.status_code,
        status_text: info.status_text,
        headers: resp_headers,
        body: Buffer::from(body),
        redirected: info.url_chain.len() > 1,
        was_cached: info.was_cached,
        protocol: info.negotiated_protocol,
    }
}

#[napi]
pub async fn execute_request(config: NapiRequestConfig) -> Result<NapiResponse> {
    let engine = resolve_engine(&config.proxy_url)?;
    let req_config = build_request_config(&config);

    let response = get_runtime()
        .spawn(async move { CronetRequest::execute(&engine, req_config).await })
        .await
        .map_err(|e| Error::from_reason(format!("Runtime error: {e}")))?
        .map_err(|e| Error::from_reason(format!("Request failed: {e}")))?;

    Ok(build_napi_response(response.info, response.body))
}

/// Execute a streaming request. Returns response info immediately,
/// body chunks are delivered via the provided callback.
#[napi(
    ts_args_type = "config: NapiRequestConfig, onChunk: (chunk: Buffer | null, error: Error | null) => void"
)]
pub fn execute_streaming_request(
    config: NapiRequestConfig,
    on_chunk: JsFunction,
) -> Result<AsyncTask<StreamingRequestTask>> {
    let engine = resolve_engine(&config.proxy_url)?;
    let req_config = build_request_config(&config);

    let tsfn: ThreadsafeFunction<Option<Vec<u8>>, ErrorStrategy::Fatal> = on_chunk
        .create_threadsafe_function(0, |ctx: ThreadSafeCallContext<Option<Vec<u8>>>| {
            match ctx.value {
                Some(data) => {
                    let buf = ctx.env.create_buffer_with_data(data)?;
                    let null = ctx.env.get_null()?;
                    Ok(vec![buf.into_raw().into_unknown(), null.into_unknown()])
                }
                None => {
                    let null1 = ctx.env.get_null()?;
                    let null2 = ctx.env.get_null()?;
                    Ok(vec![null1.into_unknown(), null2.into_unknown()])
                }
            }
        })?;

    Ok(AsyncTask::new(StreamingRequestTask {
        engine,
        config: req_config,
        tsfn,
    }))
}

pub struct StreamingRequestTask {
    engine: Arc<Engine>,
    config: RequestConfig,
    tsfn: ThreadsafeFunction<Option<Vec<u8>>, ErrorStrategy::Fatal>,
}

impl Task for StreamingRequestTask {
    type Output = NapiResponse;
    type JsValue = NapiResponse;

    fn compute(&mut self) -> Result<Self::Output> {
        let engine = self.engine.clone();
        let config = RequestConfig {
            url: self.config.url.clone(),
            method: self.config.method.clone(),
            headers: self.config.headers.clone(),
            body: self.config.body.clone(),
            follow_redirects: self.config.follow_redirects,
            max_redirects: self.config.max_redirects,
            disable_cache: self.config.disable_cache,
        };
        let tsfn = self.tsfn.clone();

        get_runtime()
            .block_on(async move {
                let mut streaming =
                    CronetRequest::execute_streaming(&engine, config)
                        .await
                        .map_err(|e| Error::from_reason(format!("Request failed: {e}")))?;

                let info = streaming.info.clone();

                while let Some(chunk) = streaming
                    .next_chunk()
                    .await
                    .map_err(|e| Error::from_reason(format!("Read error: {e}")))?
                {
                    tsfn.call(Some(chunk), ThreadsafeFunctionCallMode::Blocking);
                }
                tsfn.call(None, ThreadsafeFunctionCallMode::Blocking);

                Ok(build_napi_response(info, Vec::new()))
            })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}
