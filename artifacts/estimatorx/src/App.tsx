import { lazy, Suspense, useEffect, useRef } from "react";
import { ClerkProvider, Show, useClerk } from "@clerk/react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import NotFound from "@/pages/not-found";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfUse from "@/pages/TermsOfUse";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";

const Estimator = lazy(() => import("@/pages/Estimator"));
const SharedEstimatorPage = lazy(() => import("@/pages/SharedEstimatorPage"));
const Admin = lazy(() => import("@/pages/Admin"));
const OTPSignInPage = lazy(() => import("@/pages/SignInPage"));

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

/* ─── Protected estimator ──────────────────────────────────────────────────── */

function ProtectedEstimator() {
  return (
    <>
      <Show when="signed-in">
        <Estimator />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

/* ─── Clerk query-cache invalidation ───────────────────────────────────────── */

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

/* ─── Router ───────────────────────────────────────────────────────────────── */

function Router() {
  return (
    <Suspense fallback={null}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/estimator" component={ProtectedEstimator} />
        {/* /shared/:token is handled server-side by the API server for SEO.
            /app/shared/:token is the interactive React SPA entry point. */}
        <Route path="/app/shared/:token" component={SharedEstimatorPage} />
        <Route path="/admin" component={Admin} />
        <Route path="/sign-in/*?" component={OTPSignInPage} />
        <Route path="/sign-up/*?" component={OTPSignInPage} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/terms" component={TermsOfUse} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <SubscriptionProvider>
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </SubscriptionProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
