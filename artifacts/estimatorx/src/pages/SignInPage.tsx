import { useState, useEffect, useRef } from "react";
import { useSignIn, useSignUp } from "@clerk/react";
import { useLocation } from "wouter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type Stage = "email" | "sending" | "code" | "verifying" | "done" | "error";

export default function SignInPage() {
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

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setStage("sending");
    setErrMsg("");

    const { error: createErr } = await signIn.create({ identifier: email });

    if (!createErr) {
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

    const isNotFound =
      createErr.code === "form_identifier_not_found" ||
      createErr.clerkError ||
      createErr.message?.toLowerCase().includes("find") ||
      createErr.message?.toLowerCase().includes("exist");

    if (!isNotFound) {
      setErrMsg(createErr.message ?? "Something went wrong. Please try again.");
      setStage("error");
      return;
    }

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
