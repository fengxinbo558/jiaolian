import { defineConfig, loadEnv } from "vite";

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) reject(new Error("body too large"));
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  let apiModule;
  return { plugins: [{
    name: "form-local-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        if (!pathname.startsWith("/api/")) return next();
        try {
          apiModule ??= import("./server/form-api.mjs");
          const { handleFormApi } = await apiModule;
          const result = await handleFormApi({
            method: request.method || "GET",
            pathname,
            headers: request.headers,
            rawBody: request.method === "GET" ? "" : await readBody(request),
            secure: false,
          });
          response.statusCode = result.status;
          for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
          response.end(result.body);
        } catch {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: "服务暂时不可用" }));
        }
      });
    },
  }] };
});
