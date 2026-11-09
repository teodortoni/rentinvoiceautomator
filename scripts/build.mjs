import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

export async function buildSettings({ demo = false, write = true } = {}) {
  const result = await build({
    entryPoints: ["ui/main.jsx"], bundle: true, write: false, minify: true,
    format: "iife", target: ["es2020"],
    define: { "process.env.NODE_ENV": '"production"', __LOCAL_DEMO__: String(demo) }
  });
  const styles = await readFile("ui/styles.css", "utf8");
  const { css } = await postcss([tailwindcss({
    content: ["./ui/**/*.{js,jsx}"],
    theme: { extend: { colors: { coral: { 50: "#fff1f2", 500: "#ff385c", 600: "#da2448", 700: "#bd1e3e" } } } }
  })]).process(styles, { from: "ui/styles.css" });
  const script = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const html = `<!doctype html>
<html lang="en"><head><base target="_top"><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rent Invoice Manager</title><style>${css}</style></head>
<body><div id="root"></div><script>${script}</script></body></html>`;
  if (write) await writeFile("Settings.html", html);
  return html;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  await buildSettings();
  console.log("Built Settings.html for the Google Docs Editor add-on (demo disabled).");
}
