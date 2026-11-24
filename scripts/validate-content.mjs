#!/usr/bin/env node
/**
 * Validate medical content and the generated catalog.
 *
 * Structural problems (bad schema, broken URLs, duplicate ids, missing files)
 * fail the check. A newly added image without a description is only a warning:
 * the card must still be usable.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const errors = [];
const warnings = [];

async function readJson(relativePath) {
  const absolute = path.join(root, relativePath);
  try {
    return JSON.parse(await readFile(absolute, "utf8"));
  } catch (error) {
    errors.push(`${relativePath}: ${error.code === "ENOENT" ? "فایل یافت نشد" : error.message}`);
    return null;
  }
}

function checkText(value, label, minimum = 1) {
  if (typeof value !== "string" || value.trim().length < minimum) {
    errors.push(`${label}: متن معتبر نیست`);
    return false;
  }
  return true;
}

const descriptions = await readJson("src/data/descriptions.fa.json");
const categories = await readJson("src/data/categories.fa.json");
const catalog = await readJson("src/generated/catalog.json");

const categoryIds = new Set((categories ?? []).map((item) => item.id));

if (descriptions) {
  const keys = Object.keys(descriptions);
  if (!keys.length) errors.push("descriptions.fa.json خالی است");

  for (const [key, item] of Object.entries(descriptions)) {
    const label = `توضیح «${key}»`;
    if (!/^[a-z0-9-]+$/.test(key)) {
      errors.push(`${label}: کلید باید فقط شامل حروف کوچک لاتین، عدد و خط تیره باشد`);
    }
    checkText(item.nameFa, `${label}: nameFa`, 2);
    checkText(item.summary, `${label}: summary`, 40);
    checkText(item.diagnosticSignificance, `${label}: diagnosticSignificance`, 20);

    if (!Array.isArray(item.keyFeatures) || item.keyFeatures.length < 2 || item.keyFeatures.length > 5) {
      errors.push(`${label}: keyFeatures باید بین ۲ تا ۵ مورد باشد`);
    } else {
      item.keyFeatures.forEach((feature, index) =>
        checkText(feature, `${label}: keyFeatures[${index}]`, 8),
      );
    }

    if (!Array.isArray(item.categories) || item.categories.length === 0) {
      errors.push(`${label}: حداقل یک دسته‌بندی لازم است`);
    } else {
      for (const id of item.categories) {
        if (!categoryIds.has(id)) errors.push(`${label}: دسته‌بندی نامعتبر «${id}»`);
      }
    }

    if (!Array.isArray(item.sources) || item.sources.length === 0) {
      errors.push(`${label}: دست‌کم یک منبع لازم است`);
    } else {
      for (const source of item.sources) {
        checkText(source.title, `${label}: عنوان منبع`, 5);
        if (typeof source.url !== "string" || !/^https:\/\/\S+$/.test(source.url)) {
          errors.push(`${label}: نشانی منبع باید https باشد`);
        }
      }
    }

    if (item.tags !== undefined && !Array.isArray(item.tags)) {
      errors.push(`${label}: tags باید آرایه باشد`);
    }
  }
}

if (catalog) {
  if (!Array.isArray(catalog.cards)) {
    errors.push("catalog.cards آرایه نیست");
  } else {
    if (catalog.total !== catalog.cards.length) {
      errors.push("catalog.total با تعداد کارت‌ها هم‌خوان نیست");
    }
    const ids = new Set();
    for (const card of catalog.cards) {
      const label = `کارت «${card.title ?? card.id}»`;
      if (!card.id || typeof card.id !== "string") errors.push(`${label}: شناسه ندارد`);
      if (ids.has(card.id)) errors.push(`${label}: شناسه تکراری است`);
      ids.add(card.id);

      checkText(card.title, `${label}: عنوان`);
      checkText(card.relativePath, `${label}: relativePath`);
      if (!["circle", "contain"].includes(card.display)) {
        errors.push(`${label}: display نامعتبر است`);
      }

      for (const field of ["image", "original"]) {
        if (typeof card[field] !== "string") {
          errors.push(`${label}: ${field} تعیین نشده است`);
          continue;
        }
        try {
          await stat(path.join(root, "public", card[field]));
        } catch {
          errors.push(`${label}: فایل ${field} (${card[field]}) وجود ندارد`);
        }
      }

      if (card.description) {
        const key = card.descriptionKey;
        if (!descriptions?.[key]) {
          errors.push(`${label}: توضیح متصل شده در descriptions.fa.json وجود ندارد`);
        }
        if (!Array.isArray(card.categoryIds)) {
          errors.push(`${label}: categoryIds آرایه نیست`);
        }
      } else {
        warnings.push(`«${card.relativePath}» هنوز توضیح آموزشی ندارد (کارت نمایش داده می‌شود).`);
      }
    }

    if (descriptions) {
      for (const key of Object.keys(descriptions)) {
        if (!catalog.cards.some((card) => card.descriptionKey === key)) {
          warnings.push(`توضیح «${key}» به هیچ تصویری متصل نشده است.`);
        }
      }
    }
  }
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);
for (const error of errors) console.error(`✖ ${error}`);

if (errors.length) {
  console.error(`\n${errors.length} خطا یافت شد.`);
  process.exitCode = 1;
} else {
  console.log(
    `\nمحتوا معتبر است: ${catalog?.cards?.length ?? 0} کارت، ` +
      `${Object.keys(descriptions ?? {}).length} توضیح، ${warnings.length} هشدار.`,
  );
}
