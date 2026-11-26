import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
const HOST = "127.0.0.1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  try {
    const reqUrl = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    let relPath = decodeURIComponent(reqUrl.pathname);
    if (relPath === "/") relPath = "/index.html";
    const filePath = path.resolve(__dirname, "." + relPath);

    if (!filePath.startsWith(__dirname + path.sep) && filePath !== __dirname) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store"
      });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MONEY-TRACK server running at http://${HOST}:${PORT}`);
});
