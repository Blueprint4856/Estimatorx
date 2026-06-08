# SEO Strategy

## In scope
- Public marketing landing page (`/`)
- Public shared estimate links (`/shared/:token`) because they are externally accessible and intended to be shareable

## Out of scope
- Authenticated estimator experience (`/estimator`)
- Admin routes (`/admin`)
- Authentication screens (`/sign-in`, `/sign-up`) except where shared shell metadata affects them indirectly

## Target audience
- Homeowners planning builds, additions, remodels, or new homes
- DIYers and first-time builders who need reliable cost estimates
- General contractors, investors, and developers who want fast itemized estimates

## Primary keywords
- Construction estimator
- Residential construction estimator
- Material and labor estimator
- Building cost estimator
- Construction cost calculator

## Notes
- Current frontend is a Vite React SPA served as a static artifact with a catch-all rewrite to `/index.html`.
- Public SEO-critical content for `/` lives in React components, not in server-rendered HTML.
- Shared estimate links are public and socially shareable, so metadata quality matters even if they are not intended as acquisition pages.
- Treat indexation of `/shared/:token` as an explicit product decision; these URLs behave more like share pages than canonical marketing landing pages.
- If `/shared/:token` is kept out of search via page-level `noindex`, standard search crawlers must be allowed to fetch those pages so they can actually read the `noindex`.
- AI crawlers should follow the same exclusions as standard bots for `/shared/`, auth routes, and app routes unless there is an explicit decision to expose those areas for AI retrieval.

## Dismissed categories
- (None yet)
