/**
 * Post-build prerender script.
 * Runs after both the client and SSR builds.
 * Renders each public route to its own HTML file so crawlers, social bots,
 * and AI crawlers receive route-specific titles, metadata, canonicals, and
 * body content without executing JavaScript.
 *
 * Output:
 *   dist/public/index.html           — home page  (/)
 *   dist/public/privacy/index.html   — privacy    (/privacy)
 *   dist/public/terms/index.html     — terms      (/terms)
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const serverEntry = path.join(rootDir, "dist/server/entry-server.js");
const templatePath = path.join(rootDir, "dist/public/index.html");

let render;
try {
  ({ render } = await import(serverEntry));
} catch (err) {
  console.error("[prerender] Failed to import server entry:", err);
  process.exit(1);
}

const SITE = "https://estimatorx.pro";
const OG_IMAGE = `${SITE}/opengraph.jpg`;

/**
 * Route definitions. Each entry drives both the server render and all head
 * replacements so every output file is fully self-contained.
 */
const MINIMAL_JSON_LD = JSON.stringify(
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        "name": "EstimatorX.pro",
        "url": SITE,
        "publisher": { "@id": `${SITE}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE}/#organization`,
        "name": "EstimatorX.pro",
        "url": SITE,
        "logo": { "@type": "ImageObject", "url": `${SITE}/logo.png` },
      },
    ],
  },
  null,
  2
);

const routes = [
  {
    url: "/",
    outPath: path.join(rootDir, "dist/public/index.html"),
    title: "EstimatorX.pro — Free Construction Cost Estimator",
    description:
      "Get fast, accurate material and labor estimates for any construction project. Built on 38 years of field knowledge and RSMeans rates. Free to start.",
    robots: "index, follow",
    canonical: `${SITE}/`,
    ogType: "website",
    ogTitle: "EstimatorX.pro — Free Construction Cost Estimator",
    ogDescription:
      "Get fast, accurate material and labor estimates for any construction project. Built on 38 years of field knowledge and RSMeans rates. Free to start.",
    twitterTitle: "EstimatorX.pro — Free Construction Cost Estimator",
    twitterDescription:
      "Fast, accurate material and labor estimates for any construction project. Built on 38 years of field knowledge. Free to start.",
    jsonLd: null, // keep the existing JSON-LD from the template unchanged
  },
  {
    url: "/privacy",
    outPath: path.join(rootDir, "dist/public/privacy/index.html"),
    title: "Privacy Policy — EstimatorX.pro",
    description:
      "Read the EstimatorX.pro Privacy Policy. Learn what information we collect, how we use it, and your rights regarding your data.",
    robots: "index, follow",
    canonical: `${SITE}/privacy/`,
    ogType: "article",
    ogTitle: "Privacy Policy — EstimatorX.pro",
    ogDescription:
      "Read the EstimatorX.pro Privacy Policy. Learn what information we collect, how we use it, and your rights regarding your data.",
    twitterTitle: "Privacy Policy — EstimatorX.pro",
    twitterDescription:
      "Read the EstimatorX.pro Privacy Policy. Learn what information we collect and your data rights.",
    jsonLd: JSON.stringify(
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebPage",
            "@id": `${SITE}/privacy/`,
            "url": `${SITE}/privacy/`,
            "name": "Privacy Policy",
            "description":
              "EstimatorX.pro Privacy Policy — what information we collect, how we use it, and your data rights.",
            "isPartOf": { "@id": `${SITE}/#website` },
            "publisher": { "@id": `${SITE}/#organization` },
          },
          {
            "@type": "WebSite",
            "@id": `${SITE}/#website`,
            "name": "EstimatorX.pro",
            "url": SITE,
            "publisher": { "@id": `${SITE}/#organization` },
          },
          {
            "@type": "WebApplication",
            "@id": `${SITE}/#app`,
            "name": "EstimatorX.pro",
            "url": SITE,
          },
          {
            "@type": "Organization",
            "@id": `${SITE}/#organization`,
            "name": "EstimatorX.pro",
            "url": SITE,
            "logo": {
              "@type": "ImageObject",
              "url": `${SITE}/logo.png`,
            },
          },
        ],
      },
      null,
      2
    ),
  },
  {
    url: "/terms",
    outPath: path.join(rootDir, "dist/public/terms/index.html"),
    title: "Terms of Use — EstimatorX.pro",
    description:
      "Read the EstimatorX.pro Terms of Use. These terms govern your access to and use of our construction cost estimating application.",
    robots: "index, follow",
    canonical: `${SITE}/terms/`,
    ogType: "article",
    ogTitle: "Terms of Use — EstimatorX.pro",
    ogDescription:
      "Read the EstimatorX.pro Terms of Use governing your access to and use of our construction cost estimating application.",
    twitterTitle: "Terms of Use — EstimatorX.pro",
    twitterDescription:
      "Read the EstimatorX.pro Terms of Use governing your access to and use of our service.",
    jsonLd: JSON.stringify(
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebPage",
            "@id": `${SITE}/terms/`,
            "url": `${SITE}/terms/`,
            "name": "Terms of Use",
            "description":
              "EstimatorX.pro Terms of Use — terms governing your access to and use of the construction cost estimating application.",
            "isPartOf": { "@id": `${SITE}/#website` },
            "publisher": { "@id": `${SITE}/#organization` },
          },
          {
            "@type": "WebSite",
            "@id": `${SITE}/#website`,
            "name": "EstimatorX.pro",
            "url": SITE,
            "publisher": { "@id": `${SITE}/#organization` },
          },
          {
            "@type": "WebApplication",
            "@id": `${SITE}/#app`,
            "name": "EstimatorX.pro",
            "url": SITE,
          },
          {
            "@type": "Organization",
            "@id": `${SITE}/#organization`,
            "name": "EstimatorX.pro",
            "url": SITE,
            "logo": {
              "@type": "ImageObject",
              "url": `${SITE}/logo.png`,
            },
          },
        ],
      },
      null,
      2
    ),
  },

  // ── Utility / noindex routes ──────────────────────────────────────────────
  // These pages must not be indexed or mistaken for the homepage by bots,
  // social crawlers, or AI systems that fetch raw HTML without running JS.
  {
    url: "/sign-in",
    outPath: path.join(rootDir, "dist/public/sign-in/index.html"),
    title: "Sign In — EstimatorX.pro",
    description:
      "Sign in or create your free EstimatorX.pro account to access your construction cost estimates.",
    robots: "noindex, nofollow",
    canonical: `${SITE}/sign-in/`,
    ogType: "website",
    ogTitle: "Sign In — EstimatorX.pro",
    ogDescription: "Sign in or create your free EstimatorX.pro account.",
    twitterTitle: "Sign In — EstimatorX.pro",
    twitterDescription: "Sign in or create your free EstimatorX.pro account.",
    jsonLd: MINIMAL_JSON_LD,
  },
  {
    url: "/sign-up",
    outPath: path.join(rootDir, "dist/public/sign-up/index.html"),
    title: "Sign Up — EstimatorX.pro",
    description:
      "Create your free EstimatorX.pro account and start building accurate construction cost estimates today.",
    robots: "noindex, nofollow",
    canonical: `${SITE}/sign-up/`,
    ogType: "website",
    ogTitle: "Sign Up — EstimatorX.pro",
    ogDescription:
      "Create your free EstimatorX.pro account and start estimating.",
    twitterTitle: "Sign Up — EstimatorX.pro",
    twitterDescription: "Create your free EstimatorX.pro account.",
    jsonLd: MINIMAL_JSON_LD,
  },
  {
    // Generic shell for /app/shared/:token — the token is not known at build
    // time, so we prerender a route-appropriate HTML shell that the static
    // server delivers for any /app/shared/* request via an artifact rewrite.
    // The shell carries noindex/nofollow and no homepage JSON-LD; the React
    // client still hydrates and loads the interactive shared estimator.
    url: "/app/shared",
    outPath: path.join(rootDir, "dist/public/app/shared/index.html"),
    title: "Shared Estimate — EstimatorX.pro",
    description:
      "View a shared construction cost estimate on EstimatorX.pro.",
    robots: "noindex, nofollow",
    canonical: null, // token is unknown at build time; client sets per-token canonical
    ogType: "website",
    ogTitle: "Shared Estimate — EstimatorX.pro",
    ogDescription: "View a shared construction cost estimate on EstimatorX.pro.",
    twitterTitle: "Shared Estimate — EstimatorX.pro",
    twitterDescription: "View a shared construction cost estimate on EstimatorX.pro.",
    jsonLd: MINIMAL_JSON_LD,
  },
];

// Load the shared HTML shell built by Vite (home page template).
let templateHtml;
try {
  templateHtml = readFileSync(templatePath, "utf-8");
} catch (err) {
  console.error("[prerender] Failed to read dist/public/index.html:", err);
  process.exit(1);
}

const placeholder = '<div id="root"></div>';
if (!templateHtml.includes(placeholder)) {
  console.warn("[prerender] Could not find root div placeholder in template — aborting");
  process.exit(1);
}

for (const route of routes) {
  // 1. Render the component to an HTML string.
  let bodyHtml;
  try {
    bodyHtml = render(route.url);
  } catch (err) {
    console.error(`[prerender] Failed to render ${route.url}:`, err);
    process.exit(1);
  }

  // 2. Start from the shared template (which already has all shared assets,
  //    fonts, favicon, and the client script tag).
  let html = templateHtml;

  // 3. Inject pre-rendered body.
  html = html.replace(
    placeholder,
    bodyHtml
      ? `<div id="root" data-prerendered="true">${bodyHtml}</div>`
      : `<div id="root"></div>`
  );

  // 4. Swap head metadata — use non-greedy regexes so only the first match
  //    per tag is replaced (there should only be one of each anyway).

  // <title>
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${route.title}</title>`);

  // <meta name="description">
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
    `<meta name="description" content="${escapeAttr(route.description)}" />`
  );

  // <meta name="robots">
  html = html.replace(
    /<meta\s+name="robots"\s+content="[^"]*"\s*\/>/,
    `<meta name="robots" content="${route.robots}" />`
  );

  // <link rel="canonical"> — remove the tag entirely when canonical is null
  // (used for dynamic-token routes where the canonical is set client-side)
  if (route.canonical === null) {
    html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/>\n?/, "");
  } else {
    html = html.replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/,
      `<link rel="canonical" href="${route.canonical}" />`
    );
  }

  // og:type
  html = html.replace(
    /(<meta\s+property="og:type"\s+content=")[^"]*(")/,
    `$1${route.ogType}$2`
  );

  // og:url — use canonical when set, otherwise omit the tag
  if (route.canonical === null) {
    html = html.replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/>\n?/, "");
  } else {
    html = html.replace(
      /(<meta\s+property="og:url"\s+content=")[^"]*(")/,
      `$1${route.canonical}$2`
    );
  }

  // og:title
  html = html.replace(
    /(<meta\s+property="og:title"\s+content=")[^"]*(")/,
    `$1${escapeAttr(route.ogTitle)}$2`
  );

  // og:description
  html = html.replace(
    /(<meta\s+property="og:description"\s+content=")[^"]*(")/,
    `$1${escapeAttr(route.ogDescription)}$2`
  );

  // twitter:title
  html = html.replace(
    /(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,
    `$1${escapeAttr(route.twitterTitle)}$2`
  );

  // twitter:description
  html = html.replace(
    /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,
    `$1${escapeAttr(route.twitterDescription)}$2`
  );

  // JSON-LD (replace only for non-home routes that supply their own schema)
  if (route.jsonLd !== null) {
    html = html.replace(
      /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/,
      `<script type="application/ld+json">\n    ${route.jsonLd}\n    </script>`
    );
  }

  // 5. Ensure the output directory exists, then write.
  const outDir = path.dirname(route.outPath);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(route.outPath, html, "utf-8");

  console.log(`[prerender] ✓ ${route.url}  →  ${path.relative(rootDir, route.outPath)}`);
}

console.log("[prerender] All routes pre-rendered successfully.");

/**
 * Escape characters that would break an HTML attribute value enclosed in
 * double quotes.  Ampersands must come first to avoid double-escaping.
 */
function escapeAttr(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
