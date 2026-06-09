import { useState, useEffect } from "react";
import { useParams } from "wouter";
import Estimator, { deserializeState, primeLocalStorageFromSnapshot } from "./Estimator";

type LoadStatus = "loading" | "loaded" | "notfound" | "error";

function useSharedPageMeta(token: string | undefined) {
  useEffect(() => {
    const canonical = document.querySelector<HTMLLinkElement>("link[rel='canonical']");
    const prevCanonical = canonical?.href ?? "";

    let noindexMeta = document.querySelector<HTMLMetaElement>("meta[name='robots']");
    if (!noindexMeta) {
      noindexMeta = document.createElement("meta");
      noindexMeta.name = "robots";
      document.head.appendChild(noindexMeta);
    }
    noindexMeta.content = "noindex, nofollow";

    if (canonical && token) {
      canonical.href = `https://estimatorx.pro/shared/${token}`;
    }

    return () => {
      noindexMeta?.remove();
      if (canonical) canonical.href = prevCanonical;
    };
  }, [token]);
}

function LoadingScreen() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#1A1A1A]">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#E85D26] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#A8A09A] text-sm font-bold uppercase tracking-widest">Loading estimate…</p>
      </div>
    </div>
  );
}

function NotFoundScreen() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#1A1A1A] px-4">
      <div className="text-center max-w-sm">
        <div className="text-[#E85D26] text-5xl font-black mb-4">404</div>
        <h1 className="text-[#F7F4F0] font-black text-2xl uppercase tracking-tight mb-3">Estimate Not Found</h1>
        <p className="text-[#888] text-sm mb-8">
          This invite link may be invalid or expired. Ask the estimator to share a new link.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/sign-up"
            className="inline-block bg-[#E85D26] text-white px-6 py-3 font-bold uppercase tracking-widest text-sm hover:bg-[#D44A15] transition-colors"
          >
            Start Your Free Estimate
          </a>
          <a
            href="/"
            className="inline-block border border-[#3A3530] text-[#A8A09A] px-6 py-3 font-bold uppercase tracking-widest text-sm hover:border-[#E85D26] hover:text-[#F7F4F0] transition-colors"
          >
            Learn More
          </a>
        </div>
        <p className="text-[#555] text-xs mt-6">
          Build accurate residential construction cost estimates free at{" "}
          <a href="/" className="text-[#E85D26] hover:underline">EstimatorX.pro</a>
        </p>
      </div>
    </div>
  );
}

function ErrorScreen() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#1A1A1A] px-4">
      <div className="text-center max-w-sm">
        <h1 className="text-[#F7F4F0] font-black text-2xl uppercase tracking-tight mb-3">Something Went Wrong</h1>
        <p className="text-[#888] text-sm mb-8">Could not load this shared estimate. Please try again.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="bg-[#E85D26] text-white px-6 py-3 font-bold uppercase tracking-widest text-sm hover:bg-[#D44A15] transition-colors"
          >
            Retry
          </button>
          <a
            href="/sign-up"
            className="inline-block border border-[#3A3530] text-[#A8A09A] px-6 py-3 font-bold uppercase tracking-widest text-sm hover:border-[#E85D26] hover:text-[#F7F4F0] transition-colors"
          >
            Build Your Own Free
          </a>
        </div>
      </div>
    </div>
  );
}

function StartFreeBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      role="banner"
      aria-label="Try EstimatorX free"
      className="fixed bottom-0 left-0 right-0 z-[9999] bg-[#1A1A1A] border-t-2 border-[#E85D26] shadow-2xl"
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <p className="text-[#F7F4F0] text-sm font-bold">
          <span className="text-[#E85D26]">EstimatorX.pro</span>
          {" — "}Build your own accurate construction cost estimate free. No contractor required.
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="/sign-up"
            className="bg-[#E85D26] text-white px-5 py-2 font-bold uppercase tracking-wider text-xs hover:bg-[#D44A15] transition-colors whitespace-nowrap"
          >
            Start Free →
          </a>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="text-[#555] hover:text-[#F7F4F0] transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SharedEstimatorPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  useSharedPageMeta(token);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [name, setName] = useState("Shared Estimate");

  useEffect(() => {
    if (!token) { setStatus("notfound"); return; }

    const base = (import.meta.env.BASE_URL as string) || "/";
    fetch(`${base}api/shared/${token}`)
      .then(async (r) => {
        if (r.status === 404) { setStatus("notfound"); return; }
        if (!r.ok) { setStatus("error"); return; }
        const data = await r.json() as { name: string; snapshot: string };
        if (data.snapshot) {
          const state = deserializeState(data.snapshot);
          if (state) primeLocalStorageFromSnapshot(state);
        }
        setName(data.name || "Shared Estimate");
        setStatus("loaded");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  if (status === "loading") return <LoadingScreen />;
  if (status === "notfound") return <NotFoundScreen />;
  if (status === "error") return <ErrorScreen />;

  return (
    <>
      <Estimator sharedToken={token} sharedName={name} />
      <StartFreeBanner />
    </>
  );
}
