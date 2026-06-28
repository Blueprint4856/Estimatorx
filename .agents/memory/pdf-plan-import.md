---
name: PDF plan import implementation
description: How the AI building plan import feature works and key decisions made during implementation
---

# PDF Building Plan Import

## Approach
Uses **text extraction** (not image rendering) from PDF pages via pdfjs-dist legacy build, then sends extracted text to GPT-5.1 (text model, not vision) to parse dimensions.

## Why Text (Not Vision)
- pdfjs-dist main build uses browser-only `DOMMatrix` — crashes Node.js at startup
- Legacy build (`pdfjs-dist/legacy/build/pdf.mjs`) imports cleanly in Node.js
- Digital/CAD architectural PDFs always contain machine-readable text dimensions
- Avoids canvas native module rendering complexity

**Why:** Image-rendering approach (pdfjs-dist + canvas → GPT-4o vision) is deferred as follow-up task #20.

## Key Implementation Files
- Route: `artifacts/api-server/src/routes/plans.ts`
- Modal: `artifacts/estimatorx/src/components/PlanImportModal.tsx`
- Toolbar button in `artifacts/estimatorx/src/pages/Estimator.tsx`

## Build Config
- `pdfjs-dist` is in the `external` list in `artifacts/api-server/build.mjs` — must stay external (can't bundle its legacy ESM)
- `canvas` is in `onlyBuiltDependencies` in `pnpm-workspace.yaml` (installed but not currently used)

## AI Setup
- OpenAI provisioned via Replit AI Integrations: `AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY`
- Direct `openai` SDK usage in `plans.ts` (not via `@workspace/integrations-openai-ai-server` lib)
- Model: `gpt-5.1` for text extraction

## Feature Gate
- Endpoint: `POST /api/plans/extract` — 403 if not x_plan or pro_plan
- Frontend button: shows PaywallModal (reuses "cci" trigger) for free users
