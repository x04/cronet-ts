use std::env;
use std::path::PathBuf;

fn main() {
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap();
    let target_arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap();

    // Determine platform-specific lib directory
    let platform_dir = match (target_os.as_str(), target_arch.as_str()) {
        ("macos", "aarch64") => "Darwin-arm64",
        ("macos", "x86_64") => "Darwin-x86_64",
        ("linux", "x86_64") => "Linux-x86_64",
        ("linux", "aarch64") => "Linux-aarch64",
        _ => panic!("Unsupported platform: {}-{}", target_os, target_arch),
    };

    let lib_dir = if let Ok(dir) = env::var("CRONET_LIB_DIR") {
        PathBuf::from(dir)
    } else {
        let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
        manifest_dir.join("lib").join(platform_dir)
    };

    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=dylib=cronet");


    // Generate bindings from cronet_c.h
    let header = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("include/cronet_c.h");

    let include_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("include");

    let bindings = bindgen::Builder::default()
        .header(header.to_str().unwrap())
        .clang_arg(format!("-I{}", include_dir.display()))
        .clang_arg("-xc++")
        .clang_arg("-std=c++17")
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
        .allowlist_function("Cronet_.*")
        .allowlist_type("Cronet_.*")
        .allowlist_var("Cronet_.*")
        .allowlist_type("stream_engine")
        .derive_debug(true)
        .derive_default(true)
        .generate()
        .expect("Unable to generate bindings");

    bindings
        .write_to_file(out_dir.join("bindings.rs"))
        .expect("Couldn't write bindings!");
}
