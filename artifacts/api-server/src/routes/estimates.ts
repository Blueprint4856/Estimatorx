import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { estimatesTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();
const MAX_ESTIMATES = 25;

/* ── Guard: must be signed in and on X Plan ────────────────────────────── */
async function requireXPlan(clerkId: string): Promise<"ok" | "free" | "notfound"> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!user) return "notfound";
  if (user.plan !== "x_plan" && user.plan !== "pro_plan") return "free";
  return "ok";
}

/* ── GET /api/estimates ─────────────────────────────────────────────────── */
router.get("/estimates", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const check = await requireXPlan(userId);
  if (check !== "ok") { res.status(403).json({ error: "X Plan required" }); return; }

  const estimates = await db
    .select({ id: estimatesTable.id, name: estimatesTable.name, createdAt: estimatesTable.createdAt, updatedAt: estimatesTable.updatedAt })
    .from(estimatesTable)
    .where(eq(estimatesTable.ownerId, userId));

  res.json(estimates);
});

/* ── GET /api/estimates/:id ─────────────────────────────────────────────── */
router.get("/estimates/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [estimate] = await db
    .select()
    .from(estimatesTable)
    .where(and(eq(estimatesTable.id, id), eq(estimatesTable.ownerId, userId)));

  if (!estimate) { res.status(404).json({ error: "Not found" }); return; }
  res.json(estimate);
});

/* ── POST /api/estimates ────────────────────────────────────────────────── */
router.post("/estimates", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const check = await requireXPlan(userId);
  if (check !== "ok") { res.status(403).json({ error: "X Plan required" }); return; }

  const count = await db
    .select({ id: estimatesTable.id })
    .from(estimatesTable)
    .where(eq(estimatesTable.ownerId, userId));

  if (count.length >= MAX_ESTIMATES) {
    res.status(400).json({ error: `Maximum of ${MAX_ESTIMATES} estimates reached` }); return;
  }

  const { name, snapshot } = req.body as { name?: string; snapshot?: string };
  if (!name || !snapshot) { res.status(400).json({ error: "name and snapshot required" }); return; }

  const [created] = await db
    .insert(estimatesTable)
    .values({ ownerId: userId, name, snapshot })
    .returning();

  res.status(201).json(created);
});

/* ── PUT /api/estimates/:id ─────────────────────────────────────────────── */
router.put("/estimates/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, snapshot } = req.body as { name?: string; snapshot?: string };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name) updates.name = name;
  if (snapshot) updates.snapshot = snapshot;

  const [updated] = await db
    .update(estimatesTable)
    .set(updates)
    .where(and(eq(estimatesTable.id, id), eq(estimatesTable.ownerId, userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

/* ── DELETE /api/estimates/:id ──────────────────────────────────────────── */
router.delete("/estimates/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .delete(estimatesTable)
    .where(and(eq(estimatesTable.id, id), eq(estimatesTable.ownerId, userId)));

  res.json({ deleted: true });
});

export default router;
