# ENHANCE!

ENHANCE! is a local-first digital image processing workspace for guided enhancement, forensic inspection, and spectral reference review.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Optional API/database packages use `DATABASE_URL`; the browser image workspace runs independently.
- `pnpm --filter @workspace/digisl-image-processing dev` — run the image workspace (default port 5173)
- `pnpm test` — numerical and provenance regression suite

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/digisl-image-processing/src/App.tsx` — ENHANCE! processing workspace, evidence probes, spectral reference view, and provenance ledger
- `artifacts/digisl-image-processing/src/index.css` — application theme and responsive workspace styling
- `artifacts/digisl-image-processing/public/reference/` — bundled CRAM-DSP and Archimedes reference images

## Architecture decisions

- Image processing runs locally in the browser with Canvas APIs; uploaded evidence is not sent to a backend.
- CRAM-DSP STAR8, lane-comb, and block-GCD algorithms are ported into the browser worker; Spectral Lab opens the real bundled reference outputs.
- SHA-256 version 2 receipts are verified at load/export and bind source, decoded-raster, and output identities. Legacy data is preserved; unavailable storage falls back to an identified memory session.

## Product

- ENHANCE! provides Shannon-entropy-guided image enhancement at native dimensions with adjustable threshold and strength controls.
- Evidence Lab provides exact KELD, residue lane-comb, and block-GCD fingerprint probes for the loaded image.
- Spectral Lab surfaces the supplied Archimedes reference pack without implying that a standard RGB upload contains multispectral data.
- Provenance records local operations in a verified SHA-256 session ledger. See README.md for the measurement and trust boundaries.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
