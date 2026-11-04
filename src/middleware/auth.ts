import type { MiddlewareHandler } from "hono";

/** Extract the client's Bearer key (if any) for upstream passthrough. */
export const authPassthrough: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("Authorization");
  c.set("apiKey", header?.startsWith("Bearer ") ? header.slice(7) : undefined);
  await next();
};
