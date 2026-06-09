import { Router } from "express";
import { db } from "@workspace/db";
import { sharedEstimatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

const esc = (str: string) =>
  str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildPreviewHtml(token: string, name: string): string {
  const safeName = esc(name);
  const pageTitle = `${safeName} — EstimatorX.pro`;
  const desc = `View shared construction estimate: ${safeName}. Built with EstimatorX.pro — fast, accurate material and labor estimates.`;
  const safeToken = esc(token);
  const canonicalUrl = `https://estimatorx.pro/shared/${safeToken}`;
  const appUrl = `/app/shared/${safeToken}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${pageTitle}</title>
  <meta name="description" content="${esc(desc)}" />
  <meta name="robots" content="noindex, follow" />
  <link rel="canonical" href="${canonicalUrl}" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:title" content="${pageTitle}" />
  <meta property="og:description" content="View this shared construction estimate on EstimatorX.pro. Built with field-proven formulas and RSMeans labor rates." />
  <meta property="og:image" content="https://estimatorx.pro/opengraph.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="EstimatorX.pro" />
  <meta property="og:locale" content="en_US" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${pageTitle}" />
  <meta name="twitter:description" content="View this shared construction estimate on EstimatorX.pro." />
  <meta name="twitter:image" content="https://estimatorx.pro/opengraph.jpg" />

  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

  <script>
    // Redirect browsers to the interactive React app.
    // Crawlers that don't execute JavaScript will see the content below.
    if (typeof window !== 'undefined') {
      window.location.replace(${JSON.stringify(appUrl)});
    }
  </script>
</head>
<body style="margin:0;background:#1a1a1a;font-family:system-ui,-apple-system,sans-serif;">
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;">
    <div style="text-align:center;max-width:480px;width:100%;">
      <div style="color:#a8a09a;font-size:0.75rem;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:1rem;">
        Shared Construction Estimate
      </div>
      <h1 style="color:#f7f4f0;font-size:1.75rem;font-weight:900;margin:0 0 1rem;text-transform:uppercase;letter-spacing:-0.02em;">
        ${safeName}
      </h1>
      <p style="color:#888;font-size:0.875rem;margin:0 0 2rem;">
        View the full interactive estimate breakdown on EstimatorX.pro.
      </p>
      <a href="${appUrl}"
         style="display:inline-block;background:#e85d26;color:#fff;padding:0.75rem 2rem;font-weight:700;text-decoration:none;text-transform:uppercase;letter-spacing:0.05em;font-size:0.875rem;">
        View Estimate →
      </a>
      <div style="margin-top:3rem;padding-top:2rem;border-top:1px solid #2c2825;">
        <p style="color:#a8a09a;font-size:0.8rem;margin:0 0 1rem;">Want accurate numbers for your own project?</p>
        <a href="/sign-up"
           style="display:inline-block;border:1px solid #e85d26;color:#e85d26;padding:0.6rem 1.5rem;font-weight:700;text-decoration:none;text-transform:uppercase;letter-spacing:0.05em;font-size:0.8rem;margin-bottom:1rem;">
          Build Your Free Construction Estimate →
        </a>
        <p style="color:#555;font-size:0.7rem;margin:0;">
          Free to start · No contractor required · RSMeans labor rates built in
        </p>
      </div>
      <div style="margin-top:1.5rem;font-size:0.7rem;color:#444;">
        <a href="/" style="color:#e85d26;text-decoration:none;font-weight:700;">EstimatorX.pro</a>
        &nbsp;&mdash; Residential construction cost estimator
      </div>
    </div>
  </div>
</body>
</html>`;
}

function build404Html(token: string): string {
  const safeToken = esc(token);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Estimate Not Found — EstimatorX.pro</title>
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <meta property="og:title" content="Estimate Not Found — EstimatorX.pro" />
  <meta property="og:description" content="This estimate link is invalid or has expired." />
</head>
<body style="margin:0;background:#1a1a1a;font-family:system-ui,-apple-system,sans-serif;">
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;">
    <div style="text-align:center;max-width:400px;">
      <div style="color:#e85d26;font-size:3rem;font-weight:900;margin-bottom:1rem;">404</div>
      <h1 style="color:#f7f4f0;font-size:1.5rem;font-weight:900;text-transform:uppercase;letter-spacing:-0.02em;margin:0 0 0.75rem;">
        Estimate Not Found
      </h1>
      <p style="color:#888;font-size:0.875rem;margin:0 0 2rem;">
        This invite link may be invalid or expired. Ask the estimator to share a new link.
      </p>
      <a href="/"
         style="display:inline-block;background:#e85d26;color:#fff;padding:0.75rem 2rem;font-weight:700;text-decoration:none;text-transform:uppercase;letter-spacing:0.05em;font-size:0.875rem;">
        Go Home
      </a>
    </div>
  </div>
</body>
</html>`;
}

/* ── GET /shared/:token ─────────────────────────────────────────────────────
   Serve a meta-rich HTML preview page for shared estimates.
   - Valid token → 200 HTML with OG tags + JS redirect to /app/shared/:token
   - Invalid format → 400
   - Token not found → 404 HTML
   Crawlers and social bots see the estimate name and description immediately.
   Browsers are instantly redirected to the interactive React SPA.
──────────────────────────────────────────────────────────────────────────── */
router.get("/shared/:token", async (req, res) => {
  const { token } = req.params;

  if (!token || !/^[0-9a-f]{32}$/.test(token)) {
    res.status(400).type("html").send(build404Html(token ?? ""));
    return;
  }

  const [row] = await db
    .select({ name: sharedEstimatesTable.name })
    .from(sharedEstimatesTable)
    .where(eq(sharedEstimatesTable.token, token));

  if (!row) {
    res.status(404).type("html").send(build404Html(token));
    return;
  }

  res.status(200).type("html").send(buildPreviewHtml(token, row.name));
});

export default router;
