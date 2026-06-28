# SEO Strategy

## In scope
- Public marketing landing page (`/`)
- Public shared estimate links (`/shared/:token`) because they are externally accessible and intended to be shareable
- Supporting public legal pages (`/privacy`, `/terms`) when they are linked from the homepage or included in the sitemap

## Out of scope
- Authenticated estimator experience (`/estimator`)
- Admin routes (`/admin`)
- Authentication screens (`/sign-in`, `/sign-up`) except where shared shell metadata or AI guidance files misrepresent them as canonical content

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
- The frontend is hybrid rather than purely client-rendered: `/`, `/privacy`, and `/terms` are prerendered at build time, and `/shared/:token` is server-rendered by the API before redirecting users into the app.
- Shared estimate links are public and socially shareable, so metadata quality matters even if they are not intended as acquisition pages.
- Treat indexation of `/shared/:token` as an explicit product decision; these URLs behave more like share pages than canonical marketing landing pages.
- If `/shared/:token` is kept out of search via page-level `noindex`, standard search crawlers must be allowed to fetch those pages so they can actually read the `noindex`.
- `/app/shared/:token` should be treated as a non-canonical app path and should not become a crawl target for search or AI bots.
- Authentication screens are utility routes and should not be presented as canonical brand content in `llms.txt`.

## Dismissed categories
- (None yet)
