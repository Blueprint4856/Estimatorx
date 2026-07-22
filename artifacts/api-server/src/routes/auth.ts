import { Router } from "express";

const router = Router();
const BAPI = "https://api.clerk.com/v1";

function clerkHeaders() {
  return {
    Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

// ── Sign-up ───────────────────────────────────────────────────────────────────

router.post("/auth/signup-verify-prepare", async (req, res) => {
  const { signUpId } = req.body as { signUpId?: string };
  if (!signUpId) { res.status(400).json({ error: "signUpId required" }); return; }

  try {
    const r = await fetch(`${BAPI}/sign_ups/${signUpId}/prepare_email_address_verification`, {
      method: "POST",
      headers: clerkHeaders(),
      body: JSON.stringify({ strategy: "email_code" }),
    });
    const data = await r.json();
    res.status(r.ok ? 200 : r.status).json(data);
  } catch (err) {
    console.error("[auth] signup-verify-prepare failed:", err);
    res.status(502).json({ error: "Failed to reach Clerk API" });
  }
});

router.post("/auth/signup-verify-attempt", async (req, res) => {
  const { signUpId, code } = req.body as { signUpId?: string; code?: string };
  if (!signUpId || !code) { res.status(400).json({ error: "signUpId and code required" }); return; }

  try {
    const verifyRes = await fetch(`${BAPI}/sign_ups/${signUpId}/attempt_email_address_verification`, {
      method: "POST",
      headers: clerkHeaders(),
      body: JSON.stringify({ code }),
    });
    const verifyData = await verifyRes.json() as Record<string, unknown>;

    if (!verifyRes.ok) { res.status(verifyRes.status).json(verifyData); return; }

    const userId = verifyData.created_user_id as string | undefined;
    if (!userId) { res.status(500).json({ error: "No user ID in verification response" }); return; }

    const tokenRes = await fetch(`${BAPI}/sign_in_tokens`, {
      method: "POST",
      headers: clerkHeaders(),
      body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
    });
    const tokenData = await tokenRes.json() as Record<string, unknown>;
    if (!tokenRes.ok) { res.status(tokenRes.status).json(tokenData); return; }

    res.json({ token: tokenData.token });
  } catch (err) {
    console.error("[auth] signup-verify-attempt failed:", err);
    res.status(502).json({ error: "Failed to reach Clerk API" });
  }
});

// ── Sign-in ───────────────────────────────────────────────────────────────────

router.post("/auth/signin-verify-prepare", async (req, res) => {
  const { signInId, emailAddressId } = req.body as { signInId?: string; emailAddressId?: string };
  if (!signInId || !emailAddressId) { res.status(400).json({ error: "signInId and emailAddressId required" }); return; }

  try {
    const r = await fetch(`${BAPI}/sign_ins/${signInId}/prepare_first_factor`, {
      method: "POST",
      headers: clerkHeaders(),
      body: JSON.stringify({ strategy: "email_code", email_address_id: emailAddressId }),
    });
    const data = await r.json();
    res.status(r.ok ? 200 : r.status).json(data);
  } catch (err) {
    console.error("[auth] signin-verify-prepare failed:", err);
    res.status(502).json({ error: "Failed to reach Clerk API" });
  }
});

router.post("/auth/signin-verify-attempt", async (req, res) => {
  const { signInId, code } = req.body as { signInId?: string; code?: string };
  if (!signInId || !code) { res.status(400).json({ error: "signInId and code required" }); return; }

  try {
    const verifyRes = await fetch(`${BAPI}/sign_ins/${signInId}/attempt_first_factor`, {
      method: "POST",
      headers: clerkHeaders(),
      body: JSON.stringify({ strategy: "email_code", code }),
    });
    const verifyData = await verifyRes.json() as Record<string, unknown>;

    if (!verifyRes.ok) { res.status(verifyRes.status).json(verifyData); return; }

    const sessionId = verifyData.created_session_id as string | undefined;
    if (!sessionId) { res.status(500).json({ error: "No session ID in sign-in response" }); return; }

    // Resolve user_id from the session so we can issue a sign-in token
    const sessionRes = await fetch(`${BAPI}/sessions/${sessionId}`, {
      headers: clerkHeaders(),
    });
    const sessionData = await sessionRes.json() as Record<string, unknown>;
    if (!sessionRes.ok) { res.status(sessionRes.status).json(sessionData); return; }

    const userId = sessionData.user_id as string | undefined;
    if (!userId) { res.status(500).json({ error: "No user ID in session" }); return; }

    const tokenRes = await fetch(`${BAPI}/sign_in_tokens`, {
      method: "POST",
      headers: clerkHeaders(),
      body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
    });
    const tokenData = await tokenRes.json() as Record<string, unknown>;
    if (!tokenRes.ok) { res.status(tokenRes.status).json(tokenData); return; }

    res.json({ token: tokenData.token });
  } catch (err) {
    console.error("[auth] signin-verify-attempt failed:", err);
    res.status(502).json({ error: "Failed to reach Clerk API" });
  }
});

export default router;
