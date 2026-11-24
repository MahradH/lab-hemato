#!/usr/bin/env node
/**
 * Build-time catalog pipeline.
 *
 *   input/ (recursive)
 *      -> image discovery + stable ids
 *      -> OpenCV field detection / cropping (scripts/process-images.py)
 *      -> educational description matching (src/data/descriptions.fa.json)
 *      -> src/generated/catalog.json
 *      -> reports/image-review.html + reports/catalog-report.json
 *
 * The application never hardcodes an image list. New images appear after this
 * script runs, and a missing description never hides a card.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputDir = path.join(root, "input");
const publicDir = path.join(root, "public");
const generatedDir = path.join(root, "src", "generated");
const reportsDir = path.join(root, "reports");
const cacheDir = path.join(root, ".cache");

const SUPPORTED = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const UNSUPPORTED_IMAGE = new Set([
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
  ".bmp",
  ".gif",
  ".jfif",
  ".svg",
  ".dng",
  ".raw",
]);

function log(message) {
  console.log(message);
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

async function walk(dir, relative = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await walk(path.join(dir, entry.name), rel)));
    } else if (entry.isFile()) {
      files.push({ relativePath: rel, absolutePath: path.join(dir, entry.name) });
    }
  }
  return files;
}

function stableOutStem(relativePath) {
  const base = relativePath.split("/").pop() ?? relativePath;
  const stem = base.replace(/\.[^.]+$/, "");
  let ascii = Array.from(stem)
    .map((char) => (/^[a-z0-9]$/i.test(char) ? char.toLowerCase() : "-"))
    .join("");
  ascii = ascii
    .split("-")
    .filter(Boolean)
    .join("-")
    .slice(0, 48);
  if (!ascii) ascii = "card";
  const digest = createHash("sha1").update(relativePath, "utf8").digest("hex").slice(0, 6);
  return `${ascii}-${digest}`;
}

function descriptionKey(title) {
  return title
    .normalize("NFC")
    .toLowerCase()
    .replace(/\p{M}/gu, "")
    .replace(/[^0-9a-z\u0600-\u06ff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSearch(value) {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\p{M}/gu, "")
    .replace(/\u0640/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ی")
    .replace(/ۀ/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`Invalid JSON in ${path.relative(root, file)}: ${error.message}`);
  }
}

function pickPython() {
  const candidates = [process.env.PYTHON, "python3", "python"].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-c", "import cv2, PIL, numpy"], {
      stdio: "ignore",
      timeout: 60_000,
    });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function copyExtension(relativePath) {
  return path.extname(relativePath).toLowerCase() === ".jpeg"
    ? ".jpg"
    : path.extname(relativePath).toLowerCase();
}

async function prepareFallback(files, warnings) {
  const results = {};
  for (const file of files) {
    const stem = stableOutStem(file.relativePath);
    const ext = copyExtension(file.relativePath);
    const output = `cards/${stem}${ext}`;
    await mkdir(path.join(publicDir, "cards"), { recursive: true });
    await copyFile(file.absolutePath, path.join(publicDir, output));
    results[file.relativePath] = {
      status: "fallback",
      display: "contain",
      output,
      width: null,
      height: null,
      detection: {
        method: "no-python",
        confidence: 0,
        review: true,
        note: "پردازش خودکار تصویر انجام نشد؛ تصویر اصلی بدون برش نمایش داده می‌شود.",
      },
    };
    warnings.push(
      `${file.relativePath}: Python/OpenCV در دسترس نبود؛ تصویر بدون برش کپی شد.`,
    );
  }
  return results;
}

async function removeStale(directory, expected) {
  const absolute = path.join(publicDir, directory);
  let entries;
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const rel = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      await removeStale(rel, expected);
    } else if (!expected.has(rel)) {
      await unlink(path.join(publicDir, rel));
    }
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderReport({ cards, summary, missing, unsupported, warnings, generatedAt }) {
  const rows = cards
    .map((card) => {
      const detection = card.detection ?? {};
      const review = detection.review;
      const confidence =
        typeof detection.confidence === "number"
          ? `${(detection.confidence * 100).toFixed(0)}%`
          : "—";
      return `
      <article class="card ${review ? "review" : "ok"}">
        <div class="compare">
          <figure><img src="../public/${escapeHtml(card.original)}" alt="" loading="lazy"><figcaption>اصلی</figcaption></figure>
          <figure><img src="../public/${escapeHtml(card.image)}" alt="" loading="lazy"><figcaption>پردازش‌شده</figcaption></figure>
        </div>
        <h3 dir="auto">${escapeHtml(card.title)}</h3>
        <p class="meta"><span class="badge ${review ? "bad" : "good"}">${review ? "نیازمند بازبینی" : "تشخیص مطمئن"}</span>
        <span>${escapeHtml(detection.method ?? "—")}</span> · <span>${confidence}</span></p>
        <p class="path">${escapeHtml(card.relativePath)}</p>
        ${card.description ? "" : '<p class="missing">توضیح آموزشی ثبت نشده است.</p>'}
      </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>گزارش پردازش تصاویر — فلش‌کارت هماتولوژی</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px; background: #f6f4ef; color: #1d2422; font-family: Tahoma, sans-serif; }
  h1 { margin: 0 0 6px; font-size: 24px; }
  h2 { margin-top: 32px; font-size: 18px; }
  .sub { color: #5c6763; margin: 0 0 20px; }
  .stats { display: flex; flex-wrap: wrap; gap: 10px; }
  .stat { background: #fff; border: 1px solid #e0dbd1; border-radius: 10px; padding: 10px 14px; }
  .stat b { display: block; font-size: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; margin-top: 16px; }
  .card { background: #fff; border: 1px solid #e0dbd1; border-radius: 12px; padding: 12px; }
  .card.review { border-color: #c9a45c; }
  .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  figure { margin: 0; }
  img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #141a19; border-radius: 8px; display: block; }
  figcaption { font-size: 11px; color: #6b7570; text-align: center; margin-top: 4px; }
  h3 { font-size: 14px; margin: 10px 0 6px; word-break: break-word; }
  .meta { font-size: 12px; color: #5c6763; margin: 0; display: flex; gap: 6px; align-items: center; }
  .badge { padding: 2px 7px; border-radius: 999px; font-size: 11px; }
  .badge.good { background: #e3f0ed; color: #0a5753; }
  .badge.bad { background: #f6e9d3; color: #8a5a12; }
  .path { font-size: 11px; color: #8a938f; direction: ltr; text-align: left; word-break: break-all; margin: 6px 0 0; }
  .missing { font-size: 12px; color: #9a5b2c; margin: 6px 0 0; }
  ul { line-height: 1.9; }
  code { direction: ltr; unicode-bidi: embed; }
</style>
</head>
<body>
<h1>گزارش پردازش تصاویر میکروسکوپ</h1>
<p class="sub">ساخته‌شده در ${escapeHtml(generatedAt)} — برای بررسی برش‌ها و موارد نامطمئن.</p>
<div class="stats">
  <div class="stat"><b>${summary.total}</b>تصویر</div>
  <div class="stat"><b>${summary.circleCropped}</b>برش دایره‌ای</div>
  <div class="stat"><b>${summary.needsReview}</b>نیازمند بازبینی</div>
  <div class="stat"><b>${summary.described}</b>دارای توضیح</div>
  <div class="stat"><b>${summary.missingDescriptions}</b>بدون توضیح</div>
</div>
${unsupported.length ? `<h2>فایل‌های پشتیبانی‌نشده</h2><ul>${unsupported.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join("")}</ul>` : ""}
${missing.length ? `<h2>تصاویر بدون توضیح آموزشی</h2><ul>${missing.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join("")}</ul>` : ""}
${warnings.length ? `<h2>هشدارها</h2><ul>${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>` : ""}
<h2>همه تصاویر</h2>
<div class="grid">${rows}</div>
</body>
</html>`;
}

async function main() {
  await mkdir(generatedDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });

  const descriptions = await readJson(
    path.join(root, "src", "data", "descriptions.fa.json"),
    {},
  );
  const categories = await readJson(
    path.join(root, "src", "data", "categories.fa.json"),
    [],
  );
  const categoryLabels = new Map(categories.map((item) => [item.id, item.label]));

  let files = [];
  try {
    files = await walk(inputDir);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    log("input/ does not exist yet; generating an empty catalog.");
  }
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en"));

  const supported = [];
  const unsupported = [];
  for (const file of files) {
    const ext = path.extname(file.relativePath).toLowerCase();
    if (SUPPORTED.has(ext)) supported.push(file);
    else if (UNSUPPORTED_IMAGE.has(ext)) unsupported.push(file.relativePath);
  }

  const manifest = {
    files: supported.map((file) => ({
      relativePath: file.relativePath,
      outputStem: stableOutStem(file.relativePath),
    })),
  };
  const manifestPath = path.join(cacheDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  const warnings = [];
  for (const rel of unsupported) {
    warnings.push(`${rel}: این قالب تصویر پشتیبانی نمی‌شود؛ به JPG، PNG، WEBP یا AVIF تبدیل کنید.`);
  }

  let results = {};
  let processing = {
    generatedAt: null,
    summary: { total: supported.length, processed: 0, circleCropped: 0, needsReview: 0, errors: 0 },
  };
  const resultPath = path.join(reportsDir, "image-processing.json");
  const python = supported.length ? pickPython() : null;

  if (supported.length && python) {
    log(`Processing ${supported.length} image(s) with ${python} + OpenCV…`);
    const run = spawnSync(
      python,
      [
        path.join("scripts", "process-images.py"),
        "--input",
        "input",
        "--out",
        "public",
        "--manifest",
        toPosix(path.relative(root, manifestPath)),
        "--result",
        toPosix(path.relative(root, resultPath)),
        "--cache",
        ".cache/image-processing.json",
      ],
      { cwd: root, stdio: "inherit" },
    );
    try {
      const processed = JSON.parse(await readFile(resultPath, "utf8"));
      results = processed.results ?? {};
      processing = processed;
      if (run.status !== 0) {
        warnings.push("پردازش برخی تصاویر با خطا مواجه شد؛ جزئیات در گزارش آمده است.");
      }
    } catch {
      log("Python processing did not produce a result file; using the fallback.");
      results = await prepareFallback(supported, warnings);
    }
  } else if (supported.length) {
    log("");
    log("⚠ Python/OpenCV not available — copying images without cropping.");
    log("  Install with: pip install -r requirements.txt");
    log("");
    results = await prepareFallback(supported, warnings);
  }

  const cards = [];
  for (const file of supported) {
    const stem = stableOutStem(file.relativePath);
    const title = path.basename(file.relativePath).replace(/\.[^.]+$/, "");
    const key = descriptionKey(title);
    const description = descriptions[key] ?? null;
    const processed = results[file.relativePath];
    const extension = copyExtension(file.relativePath);
    const original = `originals/${stem}${extension}`;
    await mkdir(path.join(publicDir, "originals"), { recursive: true });
    await copyFile(file.absolutePath, path.join(publicDir, original));

    let image = processed?.output ?? null;
    let display = processed?.display ?? "contain";
    if (!image) {
      image = `cards/${stem}${extension}`;
      await mkdir(path.join(publicDir, "cards"), { recursive: true });
      await copyFile(file.absolutePath, path.join(publicDir, image));
      display = "contain";
    }

    const categoryIds = Array.isArray(description?.categories)
      ? description.categories.filter((id) => categoryLabels.has(id))
      : [];
    const categoryText = categoryIds.map((id) => categoryLabels.get(id)).join(" ");
    const searchText = normalizeSearch(
      [
        title,
        description?.nameFa ?? "",
        description?.summary ?? "",
        ...(description?.keyFeatures ?? []),
        ...(description?.tags ?? []),
        categoryText,
        file.relativePath,
      ].join(" "),
    );

    cards.push({
      id: `${stem}`,
      title,
      relativePath: file.relativePath,
      image,
      original,
      width: processed?.width ?? null,
      height: processed?.height ?? null,
      display,
      detection: processed?.detection ?? {
        method: "none",
        confidence: 0,
        review: true,
        note: "این تصویر پردازش نشده است.",
      },
      description,
      descriptionKey: key,
      categoryIds,
      searchText,
    });
  }

  const missing = cards.filter((card) => !card.description).map((card) => card.relativePath);
  const needsReview = cards.filter((card) => card.detection?.review).length;
  const described = cards.length - missing.length;
  const orphanDescriptions = Object.keys(descriptions).filter(
    (key) => !cards.some((card) => card.descriptionKey === key),
  );

  const catalog = {
    generatedAt: new Date().toISOString(),
    total: cards.length,
    described,
    missingDescriptions: missing,
    cards,
  };
  await writeFile(
    path.join(generatedDir, "catalog.json"),
    `${JSON.stringify(catalog, null, 2)}\n`,
    "utf8",
  );

  const expected = new Set();
  for (const card of cards) {
    expected.add(card.image);
    expected.add(card.original);
    // Clean files left in public/ root by older versions of the pipeline.
    for (const ext of [".webp", ".jpg", ".jpeg", ".png", ".avif"]) {
      await rm(path.join(publicDir, `${card.id}${ext}`), { force: true });
    }
  }
  await removeStale("cards", expected);
  await removeStale("originals", expected);
  await rm(manifestPath, { force: true });

  const summary = {
    total: cards.length,
    processed: processing.summary?.processed ?? cards.length,
    circleCropped: processing.summary?.circleCropped ?? 0,
    needsReview,
    described,
    missingDescriptions: missing.length,
    unsupported: unsupported.length,
    errors: processing.summary?.errors ?? 0,
  };

  const report = {
    generatedAt: catalog.generatedAt,
    summary,
    unsupported,
    missingDescriptions: missing,
    orphanDescriptions,
    warnings,
    cards: cards.map((card) => ({
      id: card.id,
      title: card.title,
      relativePath: card.relativePath,
      display: card.display,
      description: Boolean(card.description),
      detection: card.detection,
    })),
  };
  await writeFile(
    path.join(reportsDir, "catalog-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(reportsDir, "image-review.html"),
    renderReport({
      cards,
      summary,
      missing,
      unsupported,
      warnings,
      generatedAt: catalog.generatedAt,
    }),
    "utf8",
  );

  log("");
  log("Catalog generated");
  log(`  images:               ${cards.length}`);
  log(`  circle crops:         ${summary.circleCropped}`);
  log(`  fallback (contain):   ${cards.length - summary.circleCropped}`);
  log(`  need visual review:   ${needsReview}`);
  log(`  with description:     ${described}`);
  log(`  missing description:  ${missing.length}`);
  log(`  unsupported files:    ${unsupported.length}`);
  log(`  report:               reports/image-review.html`);
  if (missing.length) {
    log("");
    log("Images without an educational description:");
    for (const rel of missing) log(`  - ${rel}`);
  }
  if (orphanDescriptions.length) {
    log("");
    log("Descriptions not matched to any image (check the keys):");
    for (const key of orphanDescriptions) log(`  - ${key}`);
  }
  for (const warning of warnings) log(`⚠ ${warning}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
