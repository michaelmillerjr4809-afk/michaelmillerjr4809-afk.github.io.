Local FFmpeg WebAssembly

Place these files in this directory for offline, CDN-free MP4 export:

- ffmpeg.min.js (from @ffmpeg/ffmpeg dist)
- ffmpeg-core.js (from @ffmpeg/core dist)
- ffmpeg-core.wasm (from @ffmpeg/core dist)

Expected paths used by the app:

- vendor/ffmpeg/ffmpeg.min.js
- vendor/ffmpeg/ffmpeg-core.js
- vendor/ffmpeg/ffmpeg-core.wasm

Version recommendation: @ffmpeg/ffmpeg and @ffmpeg/core 0.12.x

Notes:
- No bundler needed; the app dynamically loads ffmpeg.min.js at runtime.
- `corePath` is set to `vendor/ffmpeg/ffmpeg-core.js` in `main.js`.
