import { Router } from "express";

const router = Router();
const BAPI = "https://api.clerk.com/v1";

function clerkHeaders() {
  return {
    Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

// Called by the browser after signUp.create() succeeds.
// Uses the Clerk backend API (secret key) so client-side auth token is not needed.
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
    res.status(502).json({ error: "Failed to reach Clerk API" });
  }
});

// Called when the user submits the 6-digit code.
// Verifies the code via BAPI, then issues a sign-in token so the browser
// can activate the session without client-side auth.
router.post("/auth/signup-verify-attempt", async (req, res) => {
  const { signUpId, code } = req.body as { signUpId?: string; code?: string };
  if (!signUpId || !code) { res.status(400).json({ error: "signUpId and code required" }); return; }

  try {
    const verifyRes = await fetch(`${BAPI}/sign_ups/${signUpId}/attempt_email_address_verification`, {
      method: "POST",
      headers: clerkHeaders(),
      body: JSON.stringify({ code }),
    });
    const verifyData = await verifyRes.json();

    if (!verifyRes.ok) {
      res.status(verifyRes.status).json(verifyData);
      return;
    }

    const userId: string | undefined = verifyData.response?.created_user_id;
    if (!userId) { res.status(500).json({ error: "No user ID in verification response" }); return; }

    // Create a short-lived sign-in token the browser can exchange for a session.
    const tokenRes = await fetch(`${BAPI}/sign_in_tokens`, {
      method: "POST",
      headers: clerkHeaders(),
      body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) { res.status(tokenRes.status).json(tokenData); return; }

    res.json({ token: tokenData.token });
  } catch (err) {
    res.status(502).json({ error: "Failed to reach Clerk API" });
  }
});

export default router;
