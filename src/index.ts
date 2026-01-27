import { Hono } from 'hono'
import { linksRouter } from "./routes/links";
import { redirectRouter } from "./routes/redirect";

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.route('/api', linksRouter);
app.route('/', redirectRouter);

export default app
