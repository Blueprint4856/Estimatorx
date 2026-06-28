import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Users ────────────────────────────────────────────────────────────────────
// plan is a named string to support future tiers: "free" | "x_plan" | "pro_plan"
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email"),
  plan: text("plan").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  planExpiresAt: timestamp("plan_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Estimates ────────────────────────────────────────────────────────────────
export const estimatesTable = pgTable("estimates", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull().default("Untitled Estimate"),
  snapshot: text("snapshot").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Shared Estimates ─────────────────────────────────────────────────────────
// Shared via invite link — anyone with the token can read/write.
// snapshot stores the same base64-encoded format as the ?s= URL share.
export const sharedEstimatesTable = pgTable("shared_estimates", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  ownerClerkId: text("owner_clerk_id").notNull(),
  name: text("name").notNull().default("Shared Estimate"),
  snapshot: text("snapshot").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertEstimateSchema = createInsertSchema(estimatesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertSharedEstimateSchema = createInsertSchema(sharedEstimatesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Estimate = typeof estimatesTable.$inferSelect;
export type InsertEstimate = z.infer<typeof insertEstimateSchema>;
export type SharedEstimate = typeof sharedEstimatesTable.$inferSelect;
export type InsertSharedEstimate = z.infer<typeof insertSharedEstimateSchema>;
