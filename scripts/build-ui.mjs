import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
for (const [entry, output] of [
  ["browser", "course-browser"],
  ["preview", "download-preview"],
]) {
  const result = await build({
    entryPoints: [new URL(`src/ui/${entry}.ts`, root).pathname],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
  });
  const [template, styles] = await Promise.all([
    readFile(new URL(`src/ui/${entry}.html`, root), "utf8"),
    readFile(new URL("src/ui/browser.css", root), "utf8"),
  ]);
  const html = template
    .replace("/* APP_STYLES */", () => styles)
    .replace("/* APP_SCRIPT */", () =>
      result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script"),
    );
  await mkdir(new URL("dist/ui/", root), { recursive: true });
  await writeFile(new URL(`dist/ui/${output}.html`, root), html);
  console.log(`Bundled self-contained ${output} HTML`);
}
