import { Router } from "express";
import { randomBytes } from "node:crypto";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { sharedEstimatesTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

/* ── POST /api/shared ───────────────────────────────────────────────────────
   Create a new shared estimate link. Requires auth + X Plan.
   Body: { name: string; snapshot: string }  (snapshot = base64-encoded state)
   Returns: { token: string }
─────────────────────────────────────────────────────────────────────────── */
router.post("/shared", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));
  const plan = user?.plan ?? "free";
  if (plan !== "x_plan" && plan !== "pro_plan") {
    res.status(403).json({ error: "X Plan required" }); return;
  }

  const { name, snapshot } = req.body as { name?: string; snapshot?: string };
  if (!snapshot) { res.status(400).json({ error: "snapshot required" }); return; }

  const token = randomBytes(16).toString("hex");

  const [created] = await db
    .insert(sharedEstimatesTable)
    .values({
      token,
      ownerClerkId: userId,
      name: name?.trim() || "Shared Estimate",
      snapshot,
    })
    .returning({ token: sharedEstimatesTable.token, id: sharedEstimatesTable.id });

  req.log.info({ id: created.id }, "Shared estimate created");
  res.status(201).json({ token: created.token });
});

/* ── GET /api/shared/:token ─────────────────────────────────────────────────
   Fetch a shared estimate. Public — no auth required.
   Returns: { name: string; snapshot: string }
─────────────────────────────────────────────────────────────────────────── */
router.get("/shared/:token", async (req, res) => {
  const { token } = req.params;
  if (!token || !/^[0-9a-f]{32}$/.test(token)) {
    res.status(400).json({ error: "Invalid token" }); return;
  }

  const [row] = await db
    .select({
      name: sharedEstimatesTable.name,
      snapshot: sharedEstimatesTable.snapshot,
      updatedAt: sharedEstimatesTable.updatedAt,
    })
    .from(sharedEstimatesTable)
    .where(eq(sharedEstimatesTable.token, token));

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

/* ── PUT /api/shared/:token ─────────────────────────────────────────────────
   Update a shared estimate's snapshot. Public — token is the implicit auth.
   Body: { snapshot: string; name?: string }
─────────────────────────────────────────────────────────────────────────── */
router.put("/shared/:token", async (req, res) => {
  const { token } = req.params;
  if (!token || !/^[0-9a-f]{32}$/.test(token)) {
    res.status(400).json({ error: "Invalid token" }); return;
  }

  const { snapshot, name } = req.body as { snapshot?: string; name?: string };
  if (!snapshot) { res.status(400).json({ error: "snapshot required" }); return; }

  const updates: Record<string, unknown> = { snapshot, updatedAt: new Date() };
  if (name?.trim()) updates.name = name.trim();

  const [updated] = await db
    .update(sharedEstimatesTable)
    .set(updates)
    .where(eq(sharedEstimatesTable.token, token))
    .returning({ token: sharedEstimatesTable.token });

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

export default router;
