use cronet_sys::*;
use std::collections::VecDeque;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;

/// An executor that processes runnables on a dedicated thread,
/// matching the pattern from Chromium's sample_executor.
pub struct ThreadedExecutor {
    pub(crate) ptr: Cronet_ExecutorPtr,
    _state: Arc<ExecutorState>,
}

unsafe impl Send for ThreadedExecutor {}
unsafe impl Sync for ThreadedExecutor {}

struct ExecutorState {
    queue: Mutex<(VecDeque<Cronet_RunnablePtr>, bool)>,
    condvar: Condvar,
}

unsafe impl Send for ExecutorState {}
unsafe impl Sync for ExecutorState {}

unsafe extern "C" fn executor_execute(
    self_ptr: Cronet_ExecutorPtr,
    command: Cronet_RunnablePtr,
) {
    let ctx = Cronet_Executor_GetClientContext(self_ptr) as *const ExecutorState;
    if ctx.is_null() {
        Cronet_Runnable_Destroy(command);
        return;
    }
    let state = &*ctx;
    let mut guard = state.queue.lock().unwrap();
    if guard.1 {
        Cronet_Runnable_Destroy(command);
        return;
    }
    guard.0.push_back(command);
    state.condvar.notify_one();
}

fn thread_loop(state: Arc<ExecutorState>) {
    loop {
        let runnable = {
            let mut guard = state.queue.lock().unwrap();
            loop {
                if let Some(r) = guard.0.pop_front() {
                    break Some(r);
                }
                if guard.1 {
                    break None;
                }
                guard = state.condvar.wait(guard).unwrap();
            }
        };
        match runnable {
            Some(r) => unsafe {
                Cronet_Runnable_Run(r);
                Cronet_Runnable_Destroy(r);
            },
            None => break,
        }
    }
    // Drain remaining
    let state_ref = &*state;
    let mut guard = state_ref.queue.lock().unwrap();
    while let Some(r) = guard.0.pop_front() {
        unsafe { Cronet_Runnable_Destroy(r) };
    }
}

impl ThreadedExecutor {
    pub fn new() -> Self {
        let state = Arc::new(ExecutorState {
            queue: Mutex::new((VecDeque::new(), false)),
            condvar: Condvar::new(),
        });

        let thread_state = Arc::clone(&state);
        thread::spawn(move || thread_loop(thread_state));

        unsafe {
            let ptr = Cronet_Executor_CreateWith(Some(executor_execute));
            Cronet_Executor_SetClientContext(
                ptr,
                Arc::as_ptr(&state) as *mut _,
            );
            ThreadedExecutor { ptr, _state: state }
        }
    }
}

impl Default for ThreadedExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for ThreadedExecutor {
    fn drop(&mut self) {
        {
            let mut guard = self._state.queue.lock().unwrap();
            guard.1 = true;
        }
        self._state.condvar.notify_one();
        unsafe {
            Cronet_Executor_Destroy(self.ptr);
        }
    }
}

// Keep DirectExecutor for backwards compat
pub struct DirectExecutor {
    pub(crate) ptr: Cronet_ExecutorPtr,
}

unsafe impl Send for DirectExecutor {}
unsafe impl Sync for DirectExecutor {}

unsafe extern "C" fn direct_execute(
    _self: Cronet_ExecutorPtr,
    command: Cronet_RunnablePtr,
) {
    Cronet_Runnable_Run(command);
    Cronet_Runnable_Destroy(command);
}

impl DirectExecutor {
    pub fn new() -> Self {
        unsafe {
            let ptr = Cronet_Executor_CreateWith(Some(direct_execute));
            DirectExecutor { ptr }
        }
    }
}

impl Default for DirectExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for DirectExecutor {
    fn drop(&mut self) {
        unsafe {
            Cronet_Executor_Destroy(self.ptr);
        }
    }
}
