import express, { type Express } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

export function createExpressApp() {
  const app = express();
  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", service: "Gileada POS", timestamp: new Date().toISOString() });
  });
  app.use("/api", (_request, response) => {
    response.sendStatus(404);
  });
  return app;
}

async function listenWithFallback(app: Express, preferredPort: number, host: string): Promise<number> {
  const maxAttempts = 20;

  for (let port = preferredPort; port < preferredPort + maxAttempts; port += 1) {
    try {
      await new Promise<void>((resolve, reject) => {
        const server = app.listen(port, host, () => resolve());
        server.once("error", (error: NodeJS.ErrnoException) => {
          if (error.code === "EADDRINUSE") {
            reject(error);
            return;
          }
          reject(error);
        });
      });
      return port;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
        throw error;
      }
    }
  }

  throw new Error(`No available port found starting from ${preferredPort}`);
}

export async function startServer() {
  const app = createExpressApp();
  const preferredPort = Number(process.env.PORT) || 3000;
  const HOST = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";

  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(appDirectory, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          port: Number(process.env.VITE_HMR_PORT) || 24679
        }
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }

  const PORT = await listenWithFallback(app, preferredPort, HOST);
  console.log(`[Gileada POS] Server running at http://${HOST}:${PORT}`);
}

// Start only if executed directly as entrypoint
const isDirectRun = Boolean(
  process.argv[1] && (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"))
);

if (isDirectRun && process.env.NODE_ENV !== "test") {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
  });
}
