import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { apiRouter } from "./server/routes.js";
import { sanitizeDatabaseDocuments } from "./server/extraction.js";
import { healGraphIfOrphanedDocs } from "./server/db.js";

const PORT = 3000;

async function startServer() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Sanitize any existing documents in DB so no base64 remains
  await sanitizeDatabaseDocuments();

  // Auto-heal graph if documents exist but nodes are empty
  await healGraphIfOrphanedDocs();

  // Mount API router
  app.use("/api", apiRouter);

  // Vite development middleware or static asset serving in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`The Living Graph server running on http://localhost:${PORT}`);
  });
}

startServer();
