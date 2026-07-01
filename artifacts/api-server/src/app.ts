import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import sharedPreviewRouter from "./routes/sharedPreview";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

const corsOrigin = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((d) => d.trim())
  : process.env.NODE_ENV === "development"
  ? true
  : false;

app.use(cors({ credentials: true, origin: corsOrigin }));

// Stripe webhooks must receive the raw body for signature verification.
// Register this BEFORE express.json() so the Buffer is preserved.
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));

app.use((req, _res, next) => {
  if (Buffer.isBuffer(req.body)) { next(); return; }
  express.json()(req, _res, next);
});
app.use((req, _res, next) => {
  if (Buffer.isBuffer(req.body)) { next(); return; }
  express.urlencoded({ extended: true })(req, _res, next);
});

app.use(
  clerkMiddleware((req) => ({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Shared estimate preview pages — served at /shared/:token (not under /api).
// Returns meta-rich HTML for crawlers, social bots, and AI assistants.
// Human visitors stay on /shared/:token and click through to /app/shared/:token.
app.use(sharedPreviewRouter);

app.use("/api", router);

export default app;
