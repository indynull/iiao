/**
 * Is it an OS? — Worker API for https://iiao.algor.ist
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return Response.json({
        ok: true,
        slug: "iiao",
        title: "Is it an OS?",
        description: "Placeholder experiment — product TBD.",
        message: "hello from iiao.algor.ist",
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  },
};
