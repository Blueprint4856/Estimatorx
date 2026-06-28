import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const sk = process.env["CLERK_SECRET_KEY"];
  if (sk) {
    fetch("https://api.clerk.com/v1/instance", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${sk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ application_name: "EstimatorX" }),
    })
      .then(async (res) => {
        const body = await res.text();
        if (res.ok) {
          logger.info({ status: res.status }, "Clerk instance name set to EstimatorX");
        } else {
          logger.warn({ status: res.status, body }, "Clerk instance name PATCH failed");
        }
      })
      .catch((e: unknown) => logger.warn({ err: e }, "Could not update Clerk instance name"));
  }
});
