import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import type { BaseLocationHook } from "wouter";
import Home from "@/pages/Home";

const useStaticLocation: BaseLocationHook = () => ["/", () => {}];

export function render(): string {
  return renderToString(
    <Router hook={useStaticLocation}>
      <Home />
    </Router>
  );
}
