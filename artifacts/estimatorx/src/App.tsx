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

/* ─── Email OTP sign-in page ───────────────────────────────────────────────── */
// Every login sends a fresh 6-digit code — no password ever.

type Stage = "email" | "sending" | "code" | "verifying" | "done" | "error";

function OTPSignInPage() {
  const { signIn, fetchStatus: siFetch } = useSignIn();
  const { signUp, fetchStatus: suFetch } = useSignUp();
  const [, setLocation] = useLocation();

  const [email, setEmail]   = useState("");
  const [code, setCode]     = useState("");
  const [stage, setStage]   = useState<Stage>("email");
  const [errMsg, setErrMsg] = useState("");
  const modeRef = useRef<"signIn" | "signUp">("signIn");

  const isReady = siFetch === "idle" && suFetch === "idle";

  useEffect(() => () => { void signIn.reset(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Step 1: submit email, send OTP ───────────────────────────────────── */
  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setStage("sending");
    setErrMsg("");

    // Try sign-in first. If the user doesn't exist yet, fall through to sign-up.
    const { error: createErr } = await signIn.create({ identifier: email });

    if (!createErr) {
      // ── Existing user: send OTP ──────────────────────────────────────────
      const { error: sendErr } = await signIn.emailCode.sendCode({ emailAddress: email });
      if (sendErr) {
        setErrMsg(sendErr.message ?? "Could not send the verification code.");
        setStage("error");
        return;
      }
      modeRef.current = "signIn";
      setStage("code");
      return;
    }

    // ── User not found: create account and send verification code ────────
    const isNotFound =
      createErr.code === "form_identifier_not_found" ||
      createErr.clerkError ||
      createErr.message?.toLowerCase().includes("find") ||
      createErr.message?.toLowerCase().includes("exist");

    if (!isNotFound) {
      // Unexpected error — surface it
      setErrMsg(createErr.message ?? "Something went wrong. Please try again.");
      setStage("error");
      return;
    }

    // Include a random password so Clerk's password requirement is satisfied.
    // The user never sees or uses it — every login goes through OTP codes.
    const pw = crypto.randomUUID().replace(/-/g, "") + "Xx1!";
    const { error: suErr } = await signUp.create({ emailAddress: email, password: pw });
    if (suErr) {
      setErrMsg(suErr.message ?? "Could not create your account. Please try again.");
      setStage("error");
      return;
    }
    const { error: sendErr } = await signUp.verifications.sendEmailCode();
    if (sendErr) {
      setErrMsg(sendErr.message ?? "Could not send the verification code.");
      setStage("error");
      return;
    }
    modeRef.current = "signUp";
    setStage("code");
  }

  /* ── Step 2: verify the code ──────────────────────────────────────────── */
  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setStage("verifying");
    setErrMsg("");

    if (modeRef.current === "signUp") {
      const { error: verifyErr } = await signUp.verifications.verifyEmailCode({ code });
      if (verifyErr) {
        setErrMsg(verifyErr.message ?? "Incorrect code. Please try again.");
        setStage("code");
        return;
      }
      const { error: finalizeErr } = await signUp.finalize();
      if (finalizeErr) {
        setErrMsg(finalizeErr.message ?? "Sign-up could not be completed. Please try again.");
        setStage("error");
        return;
      }
    } else {
      const { error: verifyErr } = await signIn.emailCode.verifyCode({ code });
      if (verifyErr) {
        setErrMsg(verifyErr.message ?? "Incorrect code. Please try again.");
        setStage("code");
        return;
      }
      const { error: finalizeErr } = await signIn.finalize();
      if (finalizeErr) {
        setErrMsg(finalizeErr.message ?? "Sign-in could not be completed. Please try again.");
        setStage("error");
        return;
      }
    }

    setStage("done");
    setLocation("/estimator");
  }

  /* ── Resend code ──────────────────────────────────────────────────────── */
  async function resend() {
    setErrMsg("");
    setCode("");
    if (modeRef.current === "signUp") {
      await signUp.verifications.sendEmailCode();
    } else {
      await signIn.emailCode.sendCode({ emailAddress: email });
    }
  }

  function changeEmail() {
    void (modeRef.current === "signUp" ? signUp.reset() : signIn.reset());
    setEmail("");
    setCode("");
    setStage("email");
    setErrMsg("");
  }

  /* ── Done flash ───────────────────────────────────────────────────────── */
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

  /* ── Code entry screen ────────────────────────────────────────────────── */
  if (stage === "code" || stage === "verifying") {
    const busy = stage === "verifying";
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#1A1A1A] px-4">
        <div className="w-full max-w-[420px] border border-[#3A3530] p-10">
          <img src={`${basePath}/logo.svg`} alt="EstimatorX.pro" className="h-12 mx-auto mb-8" />

          <div className="w-14 h-14 bg-[#E85D26]/10 border-2 border-[#E85D26] flex items-center justify-center mx-auto mb-6">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E85D26" strokeWidth="2.5" strokeLinecap="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>

          <h2 className="text-[#F7F4F0] font-black text-2xl uppercase tracking-tight text-center mb-2">
            Check Your Email
          </h2>
          <p className="text-[#A8A09A] text-sm text-center mb-1">
            We sent a 6-digit code to
          </p>
          <p className="text-[#E85D26] font-bold text-sm text-center mb-8 break-all">{email}</p>

          <form onSubmit={submitCode} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[#A8A09A] mb-2">
                Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                disabled={busy}
                className="w-full bg-[#2C2825] border border-[#3A3530] px-4 py-3 text-[#F7F4F0] text-center text-2xl font-bold tracking-[0.5em] placeholder-[#3A3530] focus:outline-none focus:border-[#E85D26] transition-colors disabled:opacity-50"
              />
            </div>

            {errMsg && <p className="text-red-400 text-sm">{errMsg}</p>}

            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="w-full bg-[#E85D26] text-white py-3.5 font-bold uppercase tracking-widest hover:bg-[#D44A15] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "Verifying…" : "Verify Code"}
            </button>
          </form>

          <div className="flex justify-between mt-6 text-xs text-[#6B6460]">
            <button onClick={resend} className="hover:text-[#F7F4F0] transition-colors uppercase tracking-wider">
              Resend code
            </button>
            <button onClick={changeEmail} className="hover:text-[#F7F4F0] transition-colors uppercase tracking-wider">
              Change email
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Email entry screen ───────────────────────────────────────────────── */
  const busy = stage === "sending";
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#1A1A1A] px-4">
      <div className="w-full max-w-[420px] border border-[#3A3530] p-10">
        <img src={`${basePath}/logo.svg`} alt="EstimatorX.pro" className="h-12 mx-auto mb-8" />
        <h1 className="text-[#F7F4F0] font-black text-2xl uppercase tracking-tight text-center mb-2">
          Sign In
        </h1>
        <p className="text-[#A8A09A] text-sm text-center mb-8">
          Enter your email and we'll send you a one-time code.
        </p>

        <form onSubmit={submitEmail} className="space-y-4">
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
              disabled={busy}
              className="w-full bg-[#2C2825] border border-[#3A3530] px-4 py-3 text-[#F7F4F0] placeholder-[#6B6460] focus:outline-none focus:border-[#E85D26] transition-colors disabled:opacity-50"
            />
          </div>

          {stage === "error" && <p className="text-red-400 text-sm">{errMsg}</p>}

          <button
            type="submit"
            disabled={busy || !isReady}
            className="w-full bg-[#E85D26] text-white py-3.5 font-bold uppercase tracking-widest hover:bg-[#D44A15] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Sending…" : "Send Code"}
          </button>
        </form>

        <p className="text-center text-[11px] text-[#6B6460] mt-6 leading-relaxed">
          New or returning — works the same either way.<br />No password ever.
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
      <Route path="/sign-in/*?" component={OTPSignInPage} />
      <Route path="/sign-up/*?" component={OTPSignInPage} />
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
