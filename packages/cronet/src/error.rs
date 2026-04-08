#![allow(non_upper_case_globals)]
use cronet_sys::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    Callback,
    HostnameNotResolved,
    InternetDisconnected,
    NetworkChanged,
    TimedOut,
    ConnectionClosed,
    ConnectionTimedOut,
    ConnectionRefused,
    ConnectionReset,
    AddressUnreachable,
    QuicProtocolFailed,
    Other,
}

impl ErrorCode {
    pub(crate) fn from_raw(code: Cronet_Error_ERROR_CODE) -> Self {
        match code {
            Cronet_Error_ERROR_CODE_Cronet_Error_ERROR_CODE_ERROR_CALLBACK => Self::Callback,
            Cronet_Error_ERROR_CODE_Cronet_Error_ERROR_CODE_ERROR_HOSTNAME_NOT_RESOLVED => Self::HostnameNotResolved,
            Cronet_Error_ERROR_CODE_Cronet_Error_ERROR_CODE_ERROR_INTERNET_DISCONNECTED => Self::InternetDisconnected,
            Cronet_Error_ERROR_CODE_Cronet_Error_ERROR_CODE_ERROR_NETWORK_CHANGED => Self::NetworkChanged,
            Cronet_Error_ERROR_CODE_Cronet_Error_ERROR_CODE_ERROR_TIMED_OUT => Self::TimedOut,
            Cronet_Error_ERROR_CODE_Cronet_Error_ERROR_CODE_ERROR_CONNECTION_CLOSED => Self::ConnectionClosed,
            Cronet_Error_ERROR_CODE_Cronet_Error_ERROR_CODE_ERROR_CONNECTION_TIMED_OUT => Self::ConnectionTimedOut,
            Cronet_Error_ERROR_CODE_Cronet_Error_ERROR_CODE_ERROR_CONNECTION_REFUSED => Self::ConnectionRefused,
            Cronet_Error_ERROR_CODE_Cronet_Error_ERROR_CODE_ERROR_CONNECTION_RESET => Self::ConnectionReset,
            Cronet_Error_ERROR_CODE_Cronet_Error_ERROR_CODE_ERROR_ADDRESS_UNREACHABLE => Self::AddressUnreachable,
            Cronet_Error_ERROR_CODE_Cronet_Error_ERROR_CODE_ERROR_QUIC_PROTOCOL_FAILED => Self::QuicProtocolFailed,
            _ => Self::Other,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum CronetError {
    #[error("Cronet network error ({code:?}): {message}")]
    Network { code: ErrorCode, message: String },

    #[error("Cronet API error: {0}")]
    Api(String),

    #[error("Request cancelled")]
    Cancelled,

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),
}

impl CronetError {
    pub(crate) fn from_result(result: Cronet_RESULT) -> Option<Self> {
        if result == Cronet_RESULT_Cronet_RESULT_SUCCESS {
            return None;
        }
        let msg = match result {
            Cronet_RESULT_Cronet_RESULT_ILLEGAL_ARGUMENT => "illegal argument",
            Cronet_RESULT_Cronet_RESULT_ILLEGAL_ARGUMENT_INVALID_HTTP_METHOD => "invalid HTTP method",
            Cronet_RESULT_Cronet_RESULT_ILLEGAL_ARGUMENT_INVALID_HTTP_HEADER => "invalid HTTP header",
            Cronet_RESULT_Cronet_RESULT_ILLEGAL_STATE => "illegal state",
            Cronet_RESULT_Cronet_RESULT_ILLEGAL_STATE_ENGINE_ALREADY_STARTED => "engine already started",
            Cronet_RESULT_Cronet_RESULT_ILLEGAL_STATE_REQUEST_ALREADY_STARTED => "request already started",
            Cronet_RESULT_Cronet_RESULT_ILLEGAL_STATE_REQUEST_NOT_INITIALIZED => "request not initialized",
            Cronet_RESULT_Cronet_RESULT_NULL_POINTER => "null pointer",
            Cronet_RESULT_Cronet_RESULT_NULL_POINTER_URL => "null URL",
            Cronet_RESULT_Cronet_RESULT_NULL_POINTER_CALLBACK => "null callback",
            Cronet_RESULT_Cronet_RESULT_NULL_POINTER_EXECUTOR => "null executor",
            _ => "unknown error",
        };
        Some(CronetError::Api(msg.to_string()))
    }

    pub(crate) fn check(result: Cronet_RESULT) -> Result<()> {
        match Self::from_result(result) {
            Some(e) => Err(e),
            None => Ok(()),
        }
    }
}

pub type Result<T> = std::result::Result<T, CronetError>;
