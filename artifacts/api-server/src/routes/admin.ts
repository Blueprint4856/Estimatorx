import { Router } from "express";
import { getAuth } from "@clerk/express";

const router = Router();

const ADMIN_EMAIL = "lwfogg@renewal1.co";

async function clerkGet(path: string) {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY not set");
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Clerk API ${res.status}`);
  return res.json();
}

function primaryEmail(user: Record<string, unknown>): string {
  const addrs = user.email_addresses as Array<{ id: string; email_address: string }> | undefined;
  const primary = user.primary_email_address_id as string | undefined;
  return addrs?.find((e) => e.id === primary)?.email_address ?? "";
}

router.get("/admin/users", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const me = await clerkGet(`/users/${userId}`) as Record<string, unknown>;
    if (primaryEmail(me) !== ADMIN_EMAIL) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const users = await clerkGet("/users?limit=200&order_by=-created_at") as Record<string, unknown>[];
    const count = await clerkGet("/users/count") as { object: string; total_count: number };

    const rows = users.map((u) => ({
      id: u.id,
      email: primaryEmail(u),
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
    }));

    res.json({ total: count.total_count, users: rows });
  } catch (err) {
    req.log.error({ err }, "admin/users failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
