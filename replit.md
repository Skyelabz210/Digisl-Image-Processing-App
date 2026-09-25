# ENHANCE!

ENHANCE! is a local-first digital image processing workspace for guided enhancement, forensic inspection, and spectral reference review.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

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
- The first build keeps the CRAM-DSP and Archimedes concepts approachable through visual probes and reference outputs instead of exposing the research code directly.
- Session receipts are stored in localStorage and exported as JSON so the local-first behavior is visible and auditable.

## Product

- ENHANCE! provides entropy-guided image enhancement with adjustable threshold and strength controls.
- Evidence Lab provides KELD-inspired, lane-comb-inspired, and quantization fingerprint probes for the loaded image.
- Spectral Lab surfaces the supplied Archimedes reference pack without implying that a standard RGB upload contains multispectral data.
- Provenance records local operations in an append-only session ledger.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
