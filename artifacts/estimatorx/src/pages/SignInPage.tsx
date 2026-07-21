import { useState, useRef } from "react";
import { useClerk, useSignIn, useSignUp } from "@clerk/react";
import { useLocation } from "wouter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type Stage = "email" | "sending" | "code" | "verifying" | "done" | "error";

type ClerkError = { errors?: Array<{ code?: string; message: string }> };

export default function SignInPage() {
  const { client } = useClerk();
  const { signIn, isLoaded: siLoaded, setActive } = useSignIn();
  const { signUp, isLoaded: suLoaded } = useSignUp();
  const [, setLocation] = useLocation();

  const [email, setEmail]   = useState("");
  const [code, setCode]     = useState("");
  const [stage, setStage]   = useState<Stage>("email");
  const [errMsg, setErrMsg] = useState("");
  const modeRef = useRef<"signIn" | "signUp">("signIn");

  const isReady = siLoaded && suLoaded;

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn || !signUp) {
      setErrMsg("Authentication service is still loading — please wait a moment and try again.");
      setStage("error");
      return;
    }
    setStage("sending");
    setErrMsg("");

    let needsSignUp = false;

    // ── Existing-user path ───────────────────────────────────────────────────
    // Clerk v6.25.x bug: create() Promises resolve with stale hook state.
    // client.signIn IS updated synchronously, but may already hold a stale
    // resource from a prior attempt. We detect a fresh create by comparing the
    // resource ID before vs. after — a changed ID means a new sign-in was made.
    const prevSignInId = client?.signIn?.id ?? null;
    try {
      await signIn.create({ identifier: email });
      const liveSignIn = client?.signIn;
      const signInCreated = Boolean(liveSignIn?.id && liveSignIn.id !== prevSignInId);
      console.log("[si] prev:", prevSignInId, "live:", liveSignIn?.id, "created:", signInCreated);

      if (signInCreated && liveSignIn?.status) {
        const factor = liveSignIn.supportedFirstFactors?.find(
          (f) => f.strategy === "email_code",
        );
        if (!factor) {
          setErrMsg("Email sign-in is not available for this account. Please contact support.");
          setStage("error");
          return;
        }
        await liveSignIn.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: factor.emailAddressId,
        });
        modeRef.current = "signIn";
        setStage("code");
        return;
      }

      // ID unchanged → 422 → user not found → try sign-up
      needsSignUp = true;
    } catch (err: unknown) {
      const clerkErr = err as ClerkError;
      const errCode = clerkErr.errors?.[0]?.code;
      if (errCode === "form_identifier_not_found") {
        needsSignUp = true;
      } else {
        setErrMsg(clerkErr.errors?.[0]?.message ?? "Something went wrong. Please try again.");
        setStage("error");
        return;
      }
    }

    // ── New-user path ────────────────────────────────────────────────────────
    if (needsSignUp) {
      try {
        const prevSignUpId = client?.signUp?.id ?? null;
        await signUp.create({ emailAddress: email });
        const liveSignUp = client?.signUp;
        const signUpCreated = Boolean(liveSignUp?.id && liveSignUp.id !== prevSignUpId);
        console.log("[su] prev:", prevSignUpId, "live:", liveSignUp?.id, "created:", signUpCreated);

        // Prefer the live resource if it was freshly created; otherwise fall back
        // to the hook reference (which Clerk may have mutated in place).
        // Cast needed because client.signUp is typed as SignUpFutureResource | SignUpResource.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resource = (signUpCreated ? liveSignUp! : signUp) as any;
        await resource.prepareEmailAddressVerification({ strategy: "email_code" });
        modeRef.current = "signUp";
        setStage("code");
      } catch (suErr: unknown) {
        const e = suErr as ClerkError;
        const suErrCode = e.errors?.[0]?.code;
        console.log("[su] threw — code:", suErrCode, "msg:", e.errors?.[0]?.message);
        if (suErrCode === "form_identifier_exists" || suErrCode === "email_address_exists") {
          setErrMsg("An account with this email already exists. Please try again in a moment.");
        } else {
          setErrMsg(e.errors?.[0]?.message ?? "Could not create your account. Please try again.");
        }
        setStage("error");
      }
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn || !signUp || !setActive) return;
    setStage("verifying");
    setErrMsg("");

    try {
      if (modeRef.current === "signUp") {
        const result = await signUp.attemptEmailAddressVerification({ code });
        if (result.status === "complete") {
          await setActive({ session: result.createdSessionId });
          setStage("done");
          setLocation("/estimator");
        } else {
          setErrMsg("Verification incomplete. Please try again.");
          setStage("code");
        }
      } else {
        const result = await signIn.attemptFirstFactor({ strategy: "email_code", code });
        if (result.status === "complete") {
          await setActive({ session: result.createdSessionId });
          setStage("done");
          setLocation("/estimator");
        } else {
          setErrMsg("Verification incomplete. Please try again.");
          setStage("code");
        }
      }
    } catch (err: unknown) {
      const clerkErr = err as ClerkError;
      setErrMsg(clerkErr.errors?.[0]?.message ?? "Incorrect code. Please try again.");
      setStage("code");
    }
  }

  async function resend() {
    if (!signIn || !signUp) return;
    setErrMsg("");
    setCode("");
    try {
      if (modeRef.current === "signUp") {
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      } else {
        const factor = signIn.supportedFirstFactors?.find(
          (f) => f.strategy === "email_code",
        );
        if (factor && factor.strategy === "email_code") {
          await signIn.prepareFirstFactor({
            strategy: "email_code",
            emailAddressId: factor.emailAddressId,
          });
        }
      }
    } catch {
      // silently ignore resend errors
    }
  }

  function changeEmail() {
    setEmail("");
    setCode("");
    setStage("email");
    setErrMsg("");
  }

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

  if (stage === "code" || stage === "verifying") {
    const busy = stage === "verifying";
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#1A1A1A] px-4">
        <div className="w-full max-w-[420px] border border-[#3A3530] p-10">
          <img src={`${basePath}/logo-dark.svg`} alt="EstimatorX.pro" className="h-12 mx-auto mb-8" />

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

  const busy = stage === "sending";
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#1A1A1A] px-4">
      <div className="w-full max-w-[420px] border border-[#3A3530] p-10">
        <img src={`${basePath}/logo-dark.svg`} alt="EstimatorX.pro" className="h-12 mx-auto mb-8" />
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

          {/* Clerk mounts the Cloudflare Turnstile bot-protection widget here */}
          <div id="clerk-captcha" />

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[#E85D26] text-white py-3.5 font-bold uppercase tracking-widest hover:bg-[#D44A15] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Sending…" : "Send Code"}
          </button>
          {!isReady && (
            <p className="text-[10px] text-[#6B6460] text-center">
              Connecting to auth service…
            </p>
          )}
        </form>

        <p className="text-center text-[11px] text-[#6B6460] mt-6 leading-relaxed">
          New or returning — works the same either way.<br />No password ever.
        </p>

        <div className="mt-8 pt-6 border-t border-[#2C2825] text-center">
          <p className="text-[11px] text-[#555] mb-2 uppercase tracking-wider">Don't have an account?</p>
          <p className="text-[12px] text-[#A8A09A] leading-relaxed mb-3">
            Build accurate residential construction cost estimates free — no credit card required.
          </p>
          <a href="/" className="text-[11px] font-bold uppercase tracking-widest text-[#E85D26] hover:underline">
            Learn about EstimatorX.pro →
          </a>
        </div>
      </div>
    </div>
  );
}
