import { useState, useEffect, useRef } from "react";
import { ClerkProvider, Show, useClerk, useSignIn, useSignUp } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Estimator from "@/pages/Estimator";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

/* ─── Magic-link sign-in page ──────────────────────────────────────────────── */

type Stage = "idle" | "sending" | "sent" | "done" | "error";

function MagicLinkPage() {
  const { signIn, fetchStatus: siFetch } = useSignIn();
  const { signUp, fetchStatus: suFetch } = useSignUp();
  const [, setLocation] = useLocation();

  const [email, setEmail]   = useState("");
  const [stage, setStage]   = useState<Stage>("idle");
  const [errMsg, setErrMsg] = useState("");
  const modeRef = useRef<"signIn" | "signUp">("signIn");

  const isReady = siFetch === "idle" && suFetch === "idle";
  const isBusy  = stage === "sending";

  // URL used as the link destination — Clerk JS auto-processes
  // the __clerk_ticket param when it loads on this page.
  const verificationUrl = `${window.location.origin}${basePath}/sign-in`;

  // Cleanup — reset attempts when component unmounts
  useEffect(() => () => {
    void signIn.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (isBusy) return;
    setStage("sending");
    setErrMsg("");

    // ── Step 1: identify — signUpIfMissing lets Clerk handle new vs existing ─
    const { error: createErr } = await signIn.create({
      identifier: email,
      signUpIfMissing: true,
    });

    if (createErr) {
      setErrMsg(createErr.message ?? "Something went wrong. Please try again.");
      setStage("error");
      return;
    }

    // ── Step 2a: new user — Clerk signals isTransferable ────────────────────
    if (signIn.isTransferable) {
      const { error: suCreateErr } = await signUp.create({ transfer: true });
      if (suCreateErr) {
        setErrMsg(suCreateErr.message ?? "Could not create your account.");
        setStage("error");
        return;
      }

      const { error: suSendErr } = await signUp.verifications.sendEmailLink({ verificationUrl });
      if (suSendErr) {
        setErrMsg(suSendErr.message ?? "Could not send the sign-in link.");
        setStage("error");
        return;
      }

      modeRef.current = "signUp";
      setStage("sent");

      const { error: suWaitErr } = await signUp.verifications.waitForEmailLinkVerification();
      if (suWaitErr) {
        setErrMsg(suWaitErr.message ?? "Verification failed or expired.");
        setStage("error");
        return;
      }

      if (signUp.verifications.emailLinkVerification?.status === "verified") {
        await signUp.finalize();
        setStage("done");
        setLocation("/estimator");
      }
      return;
    }

    // ── Step 2b: existing user — send magic link ─────────────────────────────
    const { error: sendErr } = await signIn.emailLink.sendLink({
      verificationUrl,
      emailAddress: email,
    });
    if (sendErr) {
      setErrMsg(sendErr.message ?? "Could not send the sign-in link.");
      setStage("error");
      return;
    }

    modeRef.current = "signIn";
    setStage("sent");

    // ── Step 3: poll until the user clicks the link ──────────────────────────
    const { error: waitErr } = await signIn.emailLink.waitForVerification();
    if (waitErr) {
      setErrMsg(waitErr.message ?? "Verification failed or expired.");
      setStage("error");
      return;
    }

    if (signIn.emailLink.verification?.status === "verified") {
      await signIn.finalize();
      setStage("done");
      setLocation("/estimator");
    }
  }

  async function reset() {
    if (modeRef.current === "signUp") {
      await signUp.reset();
    } else {
      await signIn.reset();
    }
    setEmail("");
    setStage("idle");
    setErrMsg("");
  }

  /* ── Redirecting flash ─────────────────────────────────────────────────── */
  if (stage === "done") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#1A1A1A]">
        <div className="text-center">
          <div className="text-[#E85D26] text-5xl font-black mb-4">✓</div>
          <p className="text-[#F7F4F0] font-bold text-lg uppercase tracking-wider">
            Signed in — redirecting…
          </p>
        </div>
      </div>
    );
  }

  /* ── "Check your email" holding screen ────────────────────────────────── */
  if (stage === "sent") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#1A1A1A] px-4">
        <div className="w-full max-w-[420px] border border-[#3A3530] p-10 text-center">
          <img
            src={`${basePath}/logo.svg`}
            alt="EstimatorX.pro"
            className="h-12 mx-auto mb-8"
          />
          <div className="w-14 h-14 bg-[#E85D26]/10 border-2 border-[#E85D26] flex items-center justify-center mx-auto mb-6">
            <svg
              width="22" height="22" viewBox="0 0 24 24"
              fill="none" stroke="#E85D26" strokeWidth="2.5" strokeLinecap="round"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <h2 className="text-[#F7F4F0] font-black text-2xl uppercase tracking-tight mb-3">
            Check Your Email
          </h2>
          <p className="text-[#A8A09A] text-sm mb-1">A sign-in link was sent to</p>
          <p className="text-[#E85D26] font-bold text-sm mb-6 break-all">{email}</p>
          <p className="text-[#A8A09A] text-xs leading-relaxed">
            Click the link in the email to access the estimator.<br />
            This tab updates automatically once you click it.
          </p>
          <button
            onClick={reset}
            className="mt-8 text-xs text-[#6B6460] hover:text-[#F7F4F0] transition-colors uppercase tracking-widest"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  /* ── Email input form ──────────────────────────────────────────────────── */
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#1A1A1A] px-4">
      <div className="w-full max-w-[420px] border border-[#3A3530] p-10">
        <img
          src={`${basePath}/logo.svg`}
          alt="EstimatorX.pro"
          className="h-12 mx-auto mb-8"
        />
        <h1 className="text-[#F7F4F0] font-black text-2xl uppercase tracking-tight text-center mb-2">
          Sign In
        </h1>
        <p className="text-[#A8A09A] text-sm text-center mb-8">
          Enter your email and we'll send you a one-click sign-in link.
        </p>

        <form onSubmit={send} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#A8A09A] mb-2">
              Email Address
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isBusy}
              className="w-full bg-[#2C2825] border border-[#3A3530] px-4 py-3 text-[#F7F4F0] placeholder-[#6B6460] focus:outline-none focus:border-[#E85D26] transition-colors disabled:opacity-50"
            />
          </div>

          {stage === "error" && (
            <p className="text-red-400 text-sm">{errMsg}</p>
          )}

          <button
            type="submit"
            disabled={isBusy || !isReady}
            className="w-full bg-[#E85D26] text-white py-3.5 font-bold uppercase tracking-widest hover:bg-[#D44A15] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBusy ? "Sending…" : "Send Magic Link"}
          </button>
        </form>

        <p className="text-center text-[11px] text-[#6B6460] mt-6 leading-relaxed">
          New or returning — one link does it all.<br />No password ever.
        </p>
      </div>
    </div>
  );
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
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/estimator" component={ProtectedEstimator} />
      <Route path="/sign-in/*?" component={MagicLinkPage} />
      <Route path="/sign-up/*?" component={MagicLinkPage} />
      <Route component={NotFound} />
    </Switch>
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
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
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
