import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = resolve(root, "assets");

await mkdir(assets, { recursive: true });

await build({
  entryPoints: [resolve(root, "src/app.js")],
  outfile: resolve(assets, "app.js"),
  bundle: true,
  format: "esm",
  minify: false,
  sourcemap: false,
  target: ["es2022"],
  legalComments: "eof"
});

await cp(
  resolve(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"),
  resolve(assets, "pdf.worker.min.mjs")
);

console.log("Aplicação estática gerada em apps/validador-projudi/.");
