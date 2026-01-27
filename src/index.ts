import { Hono } from "hono";
import { openApiRouter } from "./routes/openapi";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.route("/", openApiRouter);

export default app;
