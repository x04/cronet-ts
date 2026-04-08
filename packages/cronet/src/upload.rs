use std::ffi::CString;
use std::ptr;

use cronet_sys::*;

/// Provides upload data for request bodies.
pub struct UploadDataProvider {
    pub(crate) ptr: Cronet_UploadDataProviderPtr,
    // prevent data from being dropped while the provider is alive
    _data: Option<Vec<u8>>,
}

unsafe impl Send for UploadDataProvider {}
unsafe impl Sync for UploadDataProvider {}

struct UploadContext {
    data: Vec<u8>,
    offset: usize,
}

unsafe extern "C" fn upload_get_length(
    self_ptr: Cronet_UploadDataProviderPtr,
) -> i64 {
    let ctx = Cronet_UploadDataProvider_GetClientContext(self_ptr) as *mut UploadContext;
    if ctx.is_null() {
        return -1;
    }
    (*ctx).data.len() as i64
}

unsafe extern "C" fn upload_read(
    self_ptr: Cronet_UploadDataProviderPtr,
    sink: Cronet_UploadDataSinkPtr,
    buffer: Cronet_BufferPtr,
) {
    let ctx = Cronet_UploadDataProvider_GetClientContext(self_ptr) as *mut UploadContext;
    if ctx.is_null() {
        let msg = CString::new("null context").unwrap();
        Cronet_UploadDataSink_OnReadError(sink, msg.as_ptr());
        return;
    }
    let ctx = &mut *ctx;
    let buf_data = Cronet_Buffer_GetData(buffer) as *mut u8;
    let buf_size = Cronet_Buffer_GetSize(buffer) as usize;

    let remaining = ctx.data.len() - ctx.offset;
    let to_copy = remaining.min(buf_size);

    if to_copy > 0 {
        ptr::copy_nonoverlapping(ctx.data.as_ptr().add(ctx.offset), buf_data, to_copy);
        ctx.offset += to_copy;
    }

    // Don't set final_chunk — the sink tracks completion via get_length()
    Cronet_UploadDataSink_OnReadSucceeded(sink, to_copy as u64, false);
}

unsafe extern "C" fn upload_rewind(
    self_ptr: Cronet_UploadDataProviderPtr,
    sink: Cronet_UploadDataSinkPtr,
) {
    let ctx = Cronet_UploadDataProvider_GetClientContext(self_ptr) as *mut UploadContext;
    if !ctx.is_null() {
        (*ctx).offset = 0;
    }
    Cronet_UploadDataSink_OnRewindSucceeded(sink);
}

unsafe extern "C" fn upload_close(
    self_ptr: Cronet_UploadDataProviderPtr,
) {
    let ctx = Cronet_UploadDataProvider_GetClientContext(self_ptr) as *mut UploadContext;
    if !ctx.is_null() {
        drop(Box::from_raw(ctx));
    }
}

impl UploadDataProvider {
    pub fn from_bytes(data: Vec<u8>) -> Self {
        unsafe {
            let ptr = Cronet_UploadDataProvider_CreateWith(
                Some(upload_get_length),
                Some(upload_read),
                Some(upload_rewind),
                Some(upload_close),
            );

            let ctx = Box::new(UploadContext { data, offset: 0 });
            Cronet_UploadDataProvider_SetClientContext(
                ptr,
                Box::into_raw(ctx) as *mut _,
            );

            UploadDataProvider { ptr, _data: None }
        }
    }
}

impl Drop for UploadDataProvider {
    fn drop(&mut self) {
        unsafe {
            Cronet_UploadDataProvider_Destroy(self.ptr);
        }
    }
}
