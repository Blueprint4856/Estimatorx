import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import type { BaseLocationHook } from "wouter";
import Home from "@/pages/Home";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfUse from "@/pages/TermsOfUse";

function makeStaticHook(url: string): BaseLocationHook {
  return () => [url, () => {}];
}

function resolveComponent(url: string) {
  if (url === "/privacy") return PrivacyPolicy;
  if (url === "/terms") return TermsOfUse;
  if (
    url === "/sign-in" ||
    url === "/sign-up" ||
    url === "/app/shared"
  ) return null;
  return Home;
}

export function render(url: string = "/"): string {
  const Component = resolveComponent(url);
  if (!Component) return "";
  return renderToString(
    <Router hook={makeStaticHook(url)}>
      <Component />
    </Router>
  );
}
