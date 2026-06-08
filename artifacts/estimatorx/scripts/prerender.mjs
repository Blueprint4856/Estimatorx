/**
 * Post-build prerender script.
 * Runs after both the client and SSR builds.
 * Renders the home page to HTML and injects it into dist/public/index.html
 * so crawlers receive the marketing content without executing JavaScript.
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const serverEntry = path.join(rootDir, "dist/server/entry-server.js");
const indexPath = path.join(rootDir, "dist/public/index.html");

let render;
try {
  ({ render } = await import(serverEntry));
} catch (err) {
  console.error("[prerender] Failed to import server entry:", err);
  process.exit(1);
}

let html;
try {
  html = render();
} catch (err) {
  console.error("[prerender] Failed to render home page:", err);
  process.exit(1);
}

let indexHtml = readFileSync(indexPath, "utf-8");

// Replace the empty root div with the pre-rendered content.
// Also add data-prerendered so main.tsx can use hydrateRoot.
const placeholder = '<div id="root"></div>';
const hydrated = `<div id="root" data-prerendered="true">${html}</div>`;

if (!indexHtml.includes(placeholder)) {
  console.warn("[prerender] Could not find root div placeholder — skipping injection");
  process.exit(0);
}

indexHtml = indexHtml.replace(placeholder, hydrated);
writeFileSync(indexPath, indexHtml, "utf-8");

console.log("[prerender] Successfully injected pre-rendered home page content into dist/public/index.html");
