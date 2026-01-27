import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { isValidHttpUrl } from "../lib/validateUrl";
import {
  getClickCount,
  listClickEvents,
  recordClickEvent,
} from "../services/analyticsService";
import { createShortLink, findLinkByCode } from "../services/linkService";

export const openApiRouter = new OpenAPIHono();

openApiRouter.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    title: "Hono URL Shortener",
    version: "1.0.0",
  },
});

openApiRouter.get(
  "/docs",
  swaggerUI({
    url: "/openapi.json",
  })
);

const errorResponseSchema = z.object({
  error: z.string(),
});

const linkSchema = z.object({
  code: z.string(),
  originalUrl: z.string(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
});

const clickEventSchema = z.object({
  id: z.string(),
  linkId: z.string(),
  clickedAt: z.string().datetime(),
  userAgent: z.string().nullable(),
  referer: z.string().nullable(),
  ipHash: z.string().nullable(),
});

const createLinkRoute = createRoute({
  method: "post",
  path: "/api/links",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            url: z.string().refine(isValidHttpUrl, "url must be http/https"),
            expiresAt: z.string().datetime().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Short link created",
      content: {
        "application/json": {
          schema: z.object({
            code: z.string(),
            shortUrl: z.string(),
            originalUrl: z.string(),
            expiresAt: z.string().datetime().nullable(),
          }),
        },
      },
    },
    400: {
      description: "Validation error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

openApiRouter.openapi(createLinkRoute, async (c) => {
  const body = c.req.valid("json");

  const baseUrl =
    process.env.BASE_URL ?? new URL(c.req.url).origin;

  const created = await createShortLink({
    url: body.url,
    expiresAt: body.expiresAt,
    baseUrl,
  });

  if (!created) {
    return c.json({ error: "failed to create short url" }, 500 as const);
  }

  return c.json(created, 200 as const);
});

const linkMetaRoute = createRoute({
  method: "get",
  path: "/api/links/{code}",
  request: {
    params: z.object({
      code: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Link metadata",
      content: {
        "application/json": {
          schema: linkSchema.extend({
            clickCount: z.number(),
          }),
        },
      },
    },
    404: {
      description: "Link not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

openApiRouter.openapi(linkMetaRoute, async (c) => {
  const code = c.req.param("code");

  const link = await findLinkByCode(code);
  if (!link) {
    return c.json({ error: "not found" }, 404 as const);
  }

  const clickCount = await getClickCount(link.id);

  return c.json(
    {
      code: link.code,
      originalUrl: link.originalUrl,
      createdAt: link.createdAt.toISOString(),
      expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
      clickCount,
    },
    200 as const
  );
});

const linkEventsRoute = createRoute({
  method: "get",
  path: "/api/links/{code}/events",
  request: {
    params: z.object({
      code: z.string(),
    }),
    query: z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      limit: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Click events",
      content: {
        "application/json": {
          schema: z.object({
            code: z.string(),
            events: z.array(clickEventSchema),
          }),
        },
      },
    },
    404: {
      description: "Link not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

openApiRouter.openapi(linkEventsRoute, async (c) => {
  const code = c.req.param("code");
  const query = c.req.valid("query");

  const link = await findLinkByCode(code);
  if (!link) {
    return c.json({ error: "not found" }, 404 as const);
  }

  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  const limit = Math.min(
    Math.max(Number(query.limit ?? 50), 1),
    200
  );

  const events = await listClickEvents({
    linkId: link.id,
    from,
    to,
    limit,
  });

  return c.json(
    {
      code: link.code,
      events: events.map((event) => ({
        id: event.id,
        linkId: event.linkId,
        clickedAt: event.clickedAt.toISOString(),
        userAgent: event.userAgent ?? null,
        referer: event.referer ?? null,
        ipHash: event.ipHash ?? null,
      })),
    },
    200 as const
  );
});

const redirectRoute = createRoute({
  method: "get",
  path: "/{code}",
  request: {
    params: z.object({
      code: z.string(),
    }),
  },
  responses: {
    302: {
      description: "Redirect to original URL",
    },
    404: {
      description: "Link not found",
      content: {
        "text/plain": {
          schema: z.string(),
        },
      },
    },
    410: {
      description: "Link expired",
      content: {
        "text/plain": {
          schema: z.string(),
        },
      },
    },
  },
});

openApiRouter.openapi(redirectRoute, async (c) => {
  const code = c.req.param("code");

  const link = await findLinkByCode(code);
  if (!link) {
    return c.text("not found", 404);
  }

  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
    return c.text("expired", 410);
  }

  const userAgent = c.req.header("user-agent") ?? null;
  const referer = c.req.header("referer") ?? null;

  const forwarded = c.req.header("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ??
    c.req.header("cf-connecting-ip") ??
    null;

  try {
    await recordClickEvent({
      linkId: link.id,
      userAgent,
      referer,
      ip,
    });
  } catch {
    // ignore logging errors, still redirect
  }

  return c.redirect(link.originalUrl, 302);
});
