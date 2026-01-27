import { Hono } from "hono";
import { cors } from "hono/cors";
import { openApiRouter } from "./routes/openapi";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  })
);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.route("/", openApiRouter);

export default app;
