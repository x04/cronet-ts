# cronet-ts

Drop-in `fetch()` replacement for Node.js, powered by Chromium's [Cronet](https://chromium.googlesource.com/chromium/src/+/master/components/cronet/) networking stack.

Get HTTP/2, HTTP/3 (QUIC), and Brotli compression out of the box. Falls back to `globalThis.fetch` on unsupported platforms.

## Install

```bash
npm install cronet-fetch
```

Platform-specific native binaries are installed automatically via `optionalDependencies`.

**Supported platforms:**
| OS | Arch | Package |
|----|------|---------|
| macOS | ARM64 (Apple Silicon) | `@aspect-build/cronet-fetch-darwin-arm64` |
| Linux | x86-64 (glibc) | `@aspect-build/cronet-fetch-linux-x64-gnu` |

On unsupported platforms, `cronet-fetch` transparently falls back to Node's built-in `fetch`.

## Usage

```ts
import { fetch, Request, Headers } from "cronet-fetch";

const res = await fetch("https://example.com");
const text = await res.text();
```

### Engine configuration

```ts
import { fetch, initEngine } from "cronet-fetch";

initEngine({
  enableQuic: true,
  enableHttp2: true,
  enableBrotli: true,
  userAgent: "my-app/1.0",
});

const res = await fetch("https://example.com");
```

### Per-request proxy

```ts
const res = await fetch("https://example.com", {
  proxy: "http://proxy:8080",
});
```

### Check if Cronet is active

```ts
import { usingCronet } from "cronet-fetch";

if (usingCronet) {
  console.log("Using Chromium Cronet (HTTP/3, QUIC, Brotli)");
} else {
  console.log("Falling back to native fetch");
}
```

### Silence fallback warning

When Cronet binaries aren't available, a warning is logged. Suppress it with:

```bash
CRONET_FETCH_SILENT=1 node app.js
```

## Architecture

```
cronet-fetch          TypeScript Fetch API (drop-in replacement)
  └─ cronet-node      Node.js native addon (napi-rs)
       └─ cronet      Safe Rust wrapper
            └─ cronet-sys   Raw FFI bindings (bindgen)
                 └─ libcronet.{so,dylib}   Chromium Cronet shared library
```

## Building from source

### Prerequisites

- Rust (stable)
- Node.js >= 18
- For Cronet itself: Chromium build toolchain (~100GB disk, 30-60 min build)

### Quick build (native addon only, requires prebuilt libcronet)

```bash
# Place libcronet in the expected location:
#   packages/cronet-sys/lib/Darwin-arm64/libcronet.dylib   (macOS ARM64)
#   packages/cronet-sys/lib/Linux-x86_64/libcronet.so      (Linux x64)

cargo build -p cronet-node --release

# Build TypeScript
cd packages/cronet-fetch && npm install && npm run build
```

### Full build (including Cronet from Chromium source)

```bash
# macOS
./scripts/fetch-and-build.sh

# Linux (Docker)
./scripts/build-cronet-linux.sh
docker build --platform linux/amd64 -f docker/Dockerfile.cronet-node-linux -t cronet-node-linux .
```

See `scripts/` for more build options.

## License

MIT
