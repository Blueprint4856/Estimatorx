import { Router } from "express";
import Stripe from "stripe";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

/* ── Ensure user row exists, return stripeCustomerId ── */
async function ensureUser(clerkId: string): Promise<string | undefined> {
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!existing) {
    await db.insert(usersTable).values({ clerkId, plan: "free" }).onConflictDoNothing();
    return undefined;
  }
  return existing.stripeCustomerId ?? undefined;
}

/* ── GET /api/user/plan ─────────────────────────────────────────────────── */
router.get("/user/plan", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.json({ plan: "free" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));
  if (!user) { res.json({ plan: "free" }); return; }

  if ((user.plan === "x_plan" || user.plan === "pro_plan") && user.planExpiresAt && user.planExpiresAt < new Date()) {
    await db.update(usersTable).set({ plan: "free" }).where(eq(usersTable.clerkId, userId));
    res.json({ plan: "free" }); return;
  }

  res.json({ plan: user.plan });
});

/* ── POST /api/stripe/checkout/print ───────────────────────────────────── */
router.post("/stripe/checkout/print", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const printPriceId = process.env.STRIPE_PRINT_PRICE_ID;
  if (!printPriceId) {
    req.log.error("STRIPE_PRINT_PRICE_ID env var not set");
    res.status(500).json({ error: "Print checkout not configured" }); return;
  }

  const stripe = getStripe();
  const customerId = await ensureUser(userId);
  const origin = (req.headers.origin as string | undefined) ?? `https://${(process.env.REPLIT_DOMAINS ?? "").split(",")[0]}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    allow_promotion_codes: true,
    ...(customerId ? { customer: customerId } : {}),
    line_items: [{ price: printPriceId, quantity: 1 }],
    success_url: `${origin}/estimator?checkout=success&action=print&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/estimator`,
    metadata: { clerkId: userId },
  });

  res.json({ url: session.url });
});

/* ── POST /api/stripe/checkout/xplan ───────────────────────────────────── */
router.post("/stripe/checkout/xplan", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const xplanPriceId = process.env.STRIPE_XPLAN_PRICE_ID;
  if (!xplanPriceId) {
    req.log.error("STRIPE_XPLAN_PRICE_ID env var not set");
    res.status(500).json({ error: "X Plan checkout not configured" }); return;
  }

  const stripe = getStripe();
  const customerId = await ensureUser(userId);
  const origin = (req.headers.origin as string | undefined) ?? `https://${(process.env.REPLIT_DOMAINS ?? "").split(",")[0]}`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    allow_promotion_codes: true,
    ...(customerId ? { customer: customerId } : {}),
    line_items: [{ price: xplanPriceId, quantity: 1 }],
    success_url: `${origin}/estimator?checkout=success&plan=x_plan&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/estimator`,
    metadata: { clerkId: userId },
  });

  res.json({ url: session.url });
});

/* ── POST /api/stripe/verify-print ─────────────────────────────────────── */
// Frontend calls this after returning from Stripe print checkout to confirm payment
router.post("/stripe/verify-print", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { sessionId } = req.body as { sessionId?: string };
  if (!sessionId) { res.status(400).json({ error: "sessionId required" }); return; }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    res.status(400).json({ error: "Payment not completed" }); return;
  }

  res.json({ allowed: true });
});

/* ── POST /api/stripe/webhook ───────────────────────────────────────────── */
// NOTE: registered BEFORE express.json() in app.ts so req.body is a raw Buffer
router.post("/stripe/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"] as string | undefined;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    req.log.warn("STRIPE_WEBHOOK_SECRET not set — webhook ignored");
    res.status(400).json({ error: "Webhook not configured" }); return;
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig ?? "", secret);
  } catch (err) {
    req.log.error({ err }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: "Invalid signature" }); return;
  }

  try {
    await handleStripeEvent(event, req.log);
  } catch (err) {
    req.log.error({ err, type: event.type }, "Error handling Stripe event");
    res.status(500).json({ error: "Handler error" }); return;
  }

  res.json({ received: true });
});

interface EventLogger { warn: (msg: string) => void }

async function handleStripeEvent(event: Stripe.Event, log: EventLogger) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const clerkId = session.metadata?.clerkId;
      if (!clerkId) break;

      const customerId = session.customer as string | null;

      if (session.mode === "subscription") {
        // X Plan subscription activated
        await db.update(usersTable)
          .set({
            plan: "x_plan",
            ...(customerId ? { stripeCustomerId: customerId } : {}),
            stripeSubscriptionId: session.subscription as string | null,
          })
          .where(eq(usersTable.clerkId, clerkId));
      } else if (session.mode === "payment") {
        // One-time print — store customer ID for future use
        if (customerId) {
          await db.update(usersTable)
            .set({ stripeCustomerId: customerId })
            .where(eq(usersTable.clerkId, clerkId));
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      const [user] = await db.select().from(usersTable).where(eq(usersTable.stripeCustomerId, customerId));
      if (!user) { log.warn("subscription.updated: no user found for customer " + customerId); break; }

      const isActive = sub.status === "active" || sub.status === "trialing";
      // current_period_end is a unix timestamp on the Stripe Subscription object
      const periodEnd = (sub as unknown as Record<string, number>)["current_period_end"];
      await db.update(usersTable)
        .set({
          plan: isActive ? "x_plan" : "free",
          stripeSubscriptionId: sub.id,
          planExpiresAt: isActive ? null : (periodEnd ? new Date(periodEnd * 1000) : null),
        })
        .where(eq(usersTable.stripeCustomerId, customerId));
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      await db.update(usersTable)
        .set({ plan: "free", stripeSubscriptionId: null })
        .where(eq(usersTable.stripeCustomerId, customerId));
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      log.warn("Invoice payment failed for customer " + String(invoice.customer));
      break;
    }
  }
}

export default router;
