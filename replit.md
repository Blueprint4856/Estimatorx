# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Clerk (Replit-managed, `@clerk/react` + `@clerk/express`)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Auth Notes

- Clerk is Replit-managed (keys auto-provisioned via `setupClerkWhitelabelAuth`)
- Dev and production user stores are separate — accounts created in dev don't exist on estimatorx.pro
- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` are set as secrets
- Clerk proxy middleware: `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` (production only)
- Sign-in/sign-up routes: `/sign-in`, `/sign-up` (custom branded pages, dark EstimatorX theme)
- `/estimator` is gated — redirects to `/sign-in` when signed out
- Home page (`/`) is always public
- To enable magic link email auth: open Auth pane in Replit workspace toolbar → change email method to "Email link"
