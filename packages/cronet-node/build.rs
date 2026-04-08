extern crate napi_build;

fn main() {
    napi_build::setup();

    // Set rpath so the .node finds libcronet.dylib/so next to itself at runtime
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    match target_os.as_str() {
        "macos" => {
            println!("cargo:rustc-cdylib-link-arg=-Wl,-rpath,@loader_path");
            // Override the default install name (absolute path into target/release/deps/)
            // to prevent dyld from treating it as a self-dependency and deadlocking.
            println!("cargo:rustc-cdylib-link-arg=-Wl,-install_name,@rpath/cronet_node.node");
        }
        "linux" => {
            println!("cargo:rustc-cdylib-link-arg=-Wl,-rpath,$ORIGIN");
        }
        _ => {}
    }
}
