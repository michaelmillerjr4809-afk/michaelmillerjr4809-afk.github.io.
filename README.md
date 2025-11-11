# CartoonMaker – Play Store (TWA) Packaging Guide

CartoonMaker is a PWA ready for Android Play Store via Trusted Web Activity (TWA).

## 1) Host the PWA

- Host on `https://michaelmillerjr4809-afk.github.io/` (GitHub Pages user site root) or a custom domain.
- If you prefer a project site path, deploy at `https://michaelmillerjr4809-afk.github.io/cartoonmaker/`.
- Service worker and manifest use relative paths to support both root and subpath hosting.

## 2) Digital Asset Links

TWA requires a site–app association using `/.well-known/assetlinks.json` at the site origin.

- File provided at `/.well-known/assetlinks.json` (placeholder values).
- Update:
  - `package_name`: `io.github.michaelmillerjr4809afk.cartoonmaker`
  - `sha256_cert_fingerprints`: signing key fingerprint

For GitHub Pages, the origin domain is `https://michaelmillerjr4809-afk.github.io/`.
Place the `assetlinks.json` in the **user site** repo so it serves at `https://michaelmillerjr4809-afk.github.io/.well-known/assetlinks.json`.

## 3) Generate Android Bundle (Bubblewrap)

Install Bubblewrap:

```bash
npm i -g @bubblewrap/cli
```

Initialize from manifest:

```bash
bubblewrap init --manifest=https://michaelmillerjr4809-afk.github.io/manifest.json
```

Provide applicationId `io.github.michaelmillerjr4809afk.cartoonmaker` and your signing key.

Build app bundle:

```bash
bubblewrap build
```

This produces a signed `.aab` bundle ready for Play Console.

## 4) Play Console

- Create a new app (Paid or Free as desired).
- Upload `.aab`.
- Store listing: title, descriptions, screenshots, icon, feature graphic.
- Content rating + Data Safety: link to `https://michaelmillerjr4809-afk.github.io/privacy.html`.
- Publish.

## 5) MP4 Export (Optional)

For robust MP4 export in all browsers:

- Vendor FFmpeg WebAssembly files locally (JS + WASM) and reference them from `/vendor/ffmpeg/`.
- Update `index.html` to load local FFmpeg scripts instead of CDN.

## Notes

- Manifest `start_url` and `scope` are relative to support subpath hosting.
- Service worker caches core assets for offline use.
- Privacy Policy page is included and linked in the app footer.
