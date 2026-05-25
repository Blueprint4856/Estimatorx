import { useState } from "react";
import { X, Printer, Zap } from "lucide-react";

interface PaywallModalProps {
  onClose: () => void;
  /** The action that triggered the paywall — used after successful checkout */
  trigger: "print" | "cci";
}

export function PaywallModal({ onClose, trigger }: PaywallModalProps) {
  const [loading, setLoading] = useState<"print" | "xplan" | null>(null);
  const base = import.meta.env.BASE_URL;

  async function goToCheckout(type: "print" | "xplan") {
    setLoading(type);
    try {
      const endpoint = type === "print"
        ? `${base}api/stripe/checkout/print`
        : `${base}api/stripe/checkout/xplan`;
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: trigger }),
      });
      if (!res.ok) throw new Error("Checkout failed");
      const { url } = await res.json() as { url: string };
      window.location.href = url;
    } catch {
      setLoading(null);
      alert("Something went wrong. Please try again.");
    }
  }

  const triggerLabel = trigger === "print" ? "print this estimate" : "use regional cost adjustment";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="relative w-full max-w-lg bg-white border border-[#DDD8D0] shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1A1A1A] px-8 py-6">
          <button onClick={onClose} className="absolute top-4 right-4 text-[#888] hover:text-white transition-colors">
            <X size={18} />
          </button>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#E85D26] mb-1">EstimatorX Pro</p>
          <h2 className="text-[#F7F4F0] font-black text-xl uppercase tracking-tight">
            Unlock to {triggerLabel}
          </h2>
        </div>

        {/* Body */}
        <div className="px-8 py-6">
          <ul className="space-y-2 mb-8 text-sm text-[#444]">
            {[
              "Print & export your estimates as PDF",
              "Regional cost adjustment (CCI) for accurate local pricing",
              "Save up to 25 named estimates to the cloud",
              "Access your estimates from any device",
              "Never lose an estimate — stored securely",
            ].map(b => (
              <li key={b} className="flex items-start gap-2">
                <span className="text-[#E85D26] font-black mt-0.5">✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* One-time print */}
            <div className="border border-[#DDD8D0] p-5">
              <div className="flex items-center gap-2 mb-1">
                <Printer size={15} className="text-[#888]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#888]">One-time print</span>
              </div>
              <p className="text-3xl font-black text-[#1A1A1A] mb-1">$0.99</p>
              <p className="text-xs text-[#888] mb-4">Single use — this estimate only</p>
              <button
                onClick={() => goToCheckout("print")}
                disabled={loading !== null}
                className="w-full border border-[#1A1A1A] text-[#1A1A1A] py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-[#1A1A1A] hover:text-white transition-colors disabled:opacity-50"
              >
                {loading === "print" ? "Redirecting…" : "Print for $0.99"}
              </button>
            </div>

            {/* X Plan */}
            <div className="border-2 border-[#E85D26] p-5 relative">
              <div className="absolute -top-3 left-4 bg-[#E85D26] px-2 py-0.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-white">Best value</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <Zap size={15} className="text-[#E85D26]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#E85D26]">X Plan</span>
              </div>
              <p className="text-3xl font-black text-[#1A1A1A] mb-1">$9.99<span className="text-base font-normal text-[#888]">/mo</span></p>
              <p className="text-xs text-[#888] mb-4">Unlimited everything · Cancel anytime</p>
              <button
                onClick={() => goToCheckout("xplan")}
                disabled={loading !== null}
                className="w-full bg-[#E85D26] text-white py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-[#D44A15] transition-colors disabled:opacity-50"
              >
                {loading === "xplan" ? "Redirecting…" : "Upgrade to X Plan"}
              </button>
            </div>
          </div>

          <p className="text-center text-[11px] text-[#999] mt-5">
            Secure checkout via Stripe · Coupon codes accepted at checkout
          </p>
        </div>
      </div>
    </div>
  );
}
