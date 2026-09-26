# ENHANCE! · Digital Image Processing

A local browser workspace for image enhancement, exact CRAM-DSP probes,
Archimedes reference inspection, and verifiable processing receipts.

## Run

Use Node.js 24 and pnpm 10.34.5 (pinned in `package.json`).

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @workspace/digisl-image-processing dev
```

Open http://localhost:5173. `PORT` and `BASE_PATH` are optional overrides;
they default to `5173` and `/`. The image workspace works without a database
or API server. Serve production builds over HTTPS with an SPA fallback for
`/forensics`, `/spectral`, and `/receipts`.

```sh
pnpm test
pnpm run typecheck
pnpm --filter @workspace/digisl-image-processing build
```

## Workflow

1. Import a PNG, JPEG, WebP, or BMP. Maximum: 50 MiB, 16 million decoded
   pixels, and 8,192 pixels per side. Supported images retain native dimensions.
2. Set entropy threshold in bits and sharpening strength, then run enhancement.
   Original, enhanced, entropy, and mask views remain available. Download the
   selected output layer as PNG. A changed recipe is identified until rerun.
3. In Evidence Lab, choose an RGB channel and run an exact integer probe.
   Download the probe map and inspect its measurements.
4. Spectral Lab opens seven existing reference PNGs at full size.
5. Export a receipt from Provenance. Source files, decoded rasters, and
   generated PNGs are bound to the recorded method and parameters by SHA-256.

Processing runs in cancellable Web Workers. Replacing or resetting a source
invalidates work attached to that image. Files and computed images stay in
browser memory; only settings and receipt metadata are saved locally.

## Measurement contract

| Tool | Computation | Scope |
| --- | --- | --- |
| Entropy enhancement | Shannon entropy `−Σ p log₂ p`, 256-bin histogram, 9×9 reflected neighborhood; luminance sharpening | Floating-point visual enhancement; integer luminance conversion `(77R + 150G + 29B + 128) >> 8`, clamped 8-bit PNG output, clipping count |
| KELD | `K = ((L mod 36) − (L mod 37)) mod 37` | Exact STAR8 band index for the selected decoded channel; bands 0–7 for an 8-bit image |
| Lane comb | Match signed ±1 independently on lanes 7, 11, 13 | Horizontal and vertical sample pairs; joint modulus 1001 covers every 8-bit difference |
| Quantization fingerprint | GCD of intra-block horizontal and vertical sample differences | 16×16 blocks, partial edge blocks included, flat blocks excluded from background estimation |
| Background step | Largest `s ≥ 2` dividing at least half of non-flat block fingerprints | Orange flags incompatibility with that step; a diagnostic for inspection |

Evidence probes operate on fully opaque samples of one selected RGB channel,
without resampling or grayscale conversion. Their integer arithmetic remains
within JavaScript's safe integer range. Canvas decodes to sRGB RGBA8 and may
perform color/profile, orientation, and alpha conversion. Receipts distinguish
the original file hash from the decoded raster hash. High-bit-depth TIFF/RAW
and native spectral cubes remain an integration opportunity; the bundled
Python CRAM-DSP archive contains the relevant foundation.

Enhancement preserves alpha, excludes fully transparent samples from entropy,
and weights sharpening neighbors by alpha. It retains the source for
comparison; clamping and PNG re-encoding are recorded processing boundaries.
Metadata such as EXIF is not copied to exported PNGs.

## Provenance

Version 2 receipts use a SHA-256 chain over the operation ID, sequence number,
operation, sorted parameters, timestamp, and previous digest. The app checks
stored receipts before loading and verifies again before export. An externally
retained receipt provides a comparison point; a local chain alone cannot
establish capture authenticity, an external timestamp, or detect a completely
rewritten chain or deleted tail.

Earlier `enhance-session-ledger` receipts remain untouched and can be exported
separately. Invalid version 2 data remains preserved in browser storage; new
operations use an explicitly identified memory session. If storage is denied
or full, export the current receipt before closing the page. SHA-256 requires
HTTPS or localhost.

## Code map

- `artifacts/digisl-image-processing/src/App.tsx`: workspace and job lifecycle
- `src/lib/processing.ts`: pure raster algorithms, bounded input validation
- `src/lib/processing.worker.ts`: transferable pixel-buffer worker
- `src/lib/image-io.ts`: image decode, PNG encoding, worker cancellation
- `src/lib/provenance.ts`: SHA-256 receipts and verification
- `tests/`: numerical and provenance regression checks
- `docs/REVIEW.md`: findings, implemented refinements, and next opportunities

The `src/` paths above are relative to `artifacts/digisl-image-processing/`.
CRAM-DSP ports and reference assets are attributed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
