import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/react";

export type Plan = "free" | "x_plan" | "pro_plan";

interface SubscriptionState {
  plan: Plan;
  isXPlan: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionState>({
  plan: "free",
  isXPlan: false,
  loading: true,
  refresh: async () => {},
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const [plan, setPlan] = useState<Plan>("free");
  const [loading, setLoading] = useState(true);

  const fetchPlan = useCallback(async () => {
    if (!isSignedIn) { setPlan("free"); setLoading(false); return; }
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/user/plan`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as { plan: Plan };
        setPlan(data.plan ?? "free");
      }
    } catch { setPlan("free"); }
    finally { setLoading(false); }
  }, [isSignedIn]);

  useEffect(() => { void fetchPlan(); }, [fetchPlan]);

  // Handle post-Stripe-Checkout return: ?checkout=success&plan=x_plan
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      void fetchPlan();
      // Clean up the URL without a page reload
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SubscriptionContext.Provider value={{ plan, isXPlan: plan === "x_plan" || plan === "pro_plan", loading, refresh: fetchPlan }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
