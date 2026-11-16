# Local changes to tauri-plugin-libmpv 0.3.2

Upstream: https://github.com/nini22P/tauri-plugin-libmpv. The MPL-2.0 license is retained in LICENSE. Cargo uses this directory so the fixes are reproducible outside the author's Cargo cache.

- Callback userdata remains a typed Box owned by the instance. Failed creation drops the same type that was allocated.
- Native callbacks hand owned event strings to a bounded, ordered delivery worker (256 entries). Teardown stops delivery, destroys the native handle, closes the sender and joins the worker.
- Events carry a monotonically increasing instance identity so the host rejects events from a destroyed instance.
- The application owns window close ordering and watch flushes; the plugin no longer intercepts close independently.
- Trace logs omit command arguments and property values, which can contain signed URLs, cookies or proxy credentials.

No native DLL was replaced. Wrapper correctness below its exported C ABI still requires live playback checks; these Rust changes do not prove the absence of defects in that binary.
