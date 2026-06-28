# EstimatorX

**Residential Construction Cost Estimator**

EstimatorX is a web application that generates fast, itemized construction cost estimates for residential projects. Built on 38 years of field knowledge and RSMeans national labor rates, it covers all 8 major trade categories from site work through HVAC.

Live at: [estimatorx.pro](https://estimatorx.pro)

---

## Features

- **8 Trade Estimators** — Site Work, Foundation, Walls & Framing, Floor Systems, Roof, Plumbing, Electrical, HVAC
- **Itemized Takeoffs** — Material quantities broken out line by line (board feet, cubic yards, linear feet, unit counts)
- **RSMeans Labor Rates** — Adjustable to your local market
- **PDF Plan Import** — Upload a building plan PDF and extract dimensions automatically via OpenAI GPT-4o
- **Shareable Estimate Links** — Share a live link with contractors, lenders, or partners (no account required to view)
- **Save & Compare** — Store multiple estimates to compare scope or scenarios
- **Clerk Authentication** — OTP-based sign-in, no password required
- **Stripe Payments** — Free tier + X Plan subscription + one-time print purchase

---

## Pricing

| Plan | Price | Features |
|------|-------|----------|
| Free | $0 | All 8 trade estimators, RSMeans rates, 1 saved project, print for $0.99 |
| X Plan | $9.99/mo | Unlimited saved projects, PDF plan import, live shareable links, no watermarks, priority support |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Framer Motion |
| Routing | Wouter |
| State / Data | TanStack React Query |
| Auth | Clerk (OTP sign-in) |
| Backend | Express 5, Node.js, TypeScript |
| Database | PostgreSQL via Drizzle ORM |
| Payments | Stripe (subscriptions + one-time payments) |
| AI | OpenAI GPT-4o (PDF plan extraction) |
| Package Manager | pnpm workspaces (monorepo) |

---

## Project Structure

```
estimatorx/
├── artifacts/
│   ├── estimatorx/        # React frontend (Vite SPA + SSR prerender)
│   ├── api-server/        # Express API backend
│   └── mockup-sandbox/    # Development mockup environment
├── lib/
│   ├── db/                # Drizzle ORM schema + PostgreSQL client
│   ├── api-spec/          # Shared API specification
│   ├── api-zod/           # Zod validation schemas
│   ├── api-client-react/  # React API client hooks
│   ├── integrations-openai-ai-react/   # OpenAI React integration
│   └── integrations-openai-ai-server/  # OpenAI server integration
├── scripts/               # Build and utility scripts
├── pnpm-workspace.yaml    # Monorepo workspace config
└── tsconfig.base.json     # Shared TypeScript config
```

---

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/user/plan` | Get current user's plan |
| GET | `/api/estimates` | List user's saved estimates |
| POST | `/api/estimates` | Create a new estimate |
| PUT | `/api/estimates/:id` | Update an estimate |
| DELETE | `/api/estimates/:id` | Delete an estimate |
| POST | `/api/plans/extract` | Extract dimensions from a PDF plan (OpenAI) |
| POST | `/api/stripe/checkout/xplan` | Start X Plan subscription checkout |
| POST | `/api/stripe/checkout/print` | Start one-time print checkout |
| POST | `/api/stripe/verify-print` | Verify print payment after redirect |
| POST | `/api/stripe/webhook` | Stripe webhook handler |
| GET/POST | `/api/shared` | Shared estimate read/write |

---

## Database Schema

**users** — `clerkId`, `email`, `plan`, `stripeCustomerId`, `stripeSubscriptionId`, `planExpiresAt`

**estimates** — `ownerId`, `name`, `snapshot` (base64-encoded estimator state)

**shared_estimates** — `token`, `ownerClerkId`, `name`, `snapshot`

---

## Environment Variables

### API Server
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `CLERK_SECRET_KEY` | Clerk backend secret key |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_XPLAN_PRICE_ID` | Stripe price ID for X Plan subscription |
| `STRIPE_PRINT_PRICE_ID` | Stripe price ID for one-time print |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | OpenAI API key |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | OpenAI API base URL |

### Frontend
| Variable | Description |
|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `VITE_CLERK_PROXY_URL` | Clerk proxy URL (optional) |

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Push database schema
pnpm --filter @workspace/db run push

# Start development
pnpm -r --if-present run dev
```

---

## License

MIT
