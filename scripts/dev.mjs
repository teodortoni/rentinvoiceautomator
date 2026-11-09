import { createServer } from "node:http";
import { buildSettings } from "./build.mjs";

const server = createServer(async (request, response) => {
  if (request.method !== "GET" || request.url !== "/") {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const html = await buildSettings({ demo: true, write: false });
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(html);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end("Build failed. Check the terminal.");
  }
});
server.listen(5173, "127.0.0.1", () => console.log("Demo: http://127.0.0.1:5173 (fictional data; no Google calls or real emails). Refresh after editing."));
