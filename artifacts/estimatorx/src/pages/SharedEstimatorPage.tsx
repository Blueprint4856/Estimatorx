import { useState, useEffect } from "react";
import { useParams } from "wouter";
import Estimator, { deserializeState, primeLocalStorageFromSnapshot } from "./Estimator";

type LoadStatus = "loading" | "loaded" | "notfound" | "error";

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
        <a
          href="/"
          className="inline-block bg-[#E85D26] text-white px-6 py-3 font-bold uppercase tracking-widest text-sm hover:bg-[#D44A15] transition-colors"
        >
          Go Home
        </a>
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
        <button
          onClick={() => window.location.reload()}
          className="bg-[#E85D26] text-white px-6 py-3 font-bold uppercase tracking-widest text-sm hover:bg-[#D44A15] transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

export default function SharedEstimatorPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
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

  return <Estimator sharedToken={token} sharedName={name} />;
}
