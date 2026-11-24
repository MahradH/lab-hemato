#!/usr/bin/env python3
"""
Microscope field-of-view detection and cropping.

Input images are phone photographs taken through a microscope eyepiece.  The
useful area is usually a bright circular field surrounded by a dark microscope
body or a room background.  This script locates that circle with thresholding,
contour analysis, a distance transform, Hough circles and a radial edge fit,
scores the result, and only crops when the detection is trustworthy.  Uncertain
images are preserved untouched.

It is normally invoked by scripts/generate-catalog.mjs with a manifest, and can
also be run stand-alone:

    python3 scripts/process-images.py --input input --out public
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".avif"}
DETECTION_MAX_SIDE = 900
OUTPUT_MAX_SIDE = 1400
CROP_SAFETY = 1.09
MASK_GROW = 1.005
MIN_CONFIDENCE = 0.55
MIN_EDGE_FRACTION = 0.52
MIN_CONSISTENCY = 0.45
MIN_FILL = 0.72
MIN_CONTRAST = 0.22


def log(message: str) -> None:
    print(message, flush=True)


def norm_rel(path: str) -> str:
    return path.replace(os.sep, "/")


def stable_out_stem(rel: str) -> str:
    stem = Path(rel).stem
    ascii_part = "".join(
        ch.lower() if ch.isalnum() else "-" for ch in stem if ch.isascii()
    )
    ascii_part = "-".join(part for part in ascii_part.split("-") if part)
    if not ascii_part:
        ascii_part = "card"
    digest = hashlib.sha1(rel.encode("utf-8")).hexdigest()[:6]
    return f"{ascii_part[:48]}-{digest}"


def read_image(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode in ("RGBA", "LA", "P"):
            rgba = image.convert("RGBA")
            background = Image.new("RGB", rgba.size, (255, 255, 255))
            background.paste(rgba, mask=rgba.split()[-1])
            return np.array(background)
        return np.array(image.convert("RGB"))


def circle_mask(shape, cx: float, cy: float, r: float) -> np.ndarray:
    h, w = shape[:2]
    yy, xx = np.ogrid[:h, :w]
    return ((xx - cx) ** 2 + (yy - cy) ** 2) <= r * r


def fit_circle(points: np.ndarray):
    if len(points) < 24:
        return None
    x = points[:, 0]
    y = points[:, 1]
    a = np.column_stack([x, y, np.ones_like(x)])
    b = x * x + y * y
    try:
        solution, *_ = np.linalg.lstsq(a, b, rcond=None)
    except np.linalg.LinAlgError:
        return None
    cx = solution[0] / 2.0
    cy = solution[1] / 2.0
    r2 = solution[2] + cx * cx + cy * cy
    if r2 <= 0:
        return None
    return float(cx), float(cy), float(math.sqrt(r2))


def radial_fit(gray: np.ndarray, cx: float, cy: float, r_hint: float):
    """Sample brightness around a candidate centre and locate the field rim."""
    h, w = gray.shape[:2]
    min_side = min(h, w)
    r_min = max(6.0, r_hint * 0.55)
    r_max = min(0.98 * max(h, w), r_hint * 1.62)
    if r_max <= r_min + 8:
        return None

    step = max(0.45, (r_max - r_min) / 340.0)
    radii = np.arange(r_min, r_max, step)
    n_angles = 240
    angles = np.arange(n_angles) * (2.0 * np.pi / n_angles)
    map_x = (cx + np.outer(radii, np.cos(angles))).astype(np.float32)
    map_y = (cy + np.outer(radii, np.sin(angles))).astype(np.float32)

    pad = 8
    padded = cv2.copyMakeBorder(gray, pad, pad, pad, pad, cv2.BORDER_REPLICATE)
    profiles = cv2.remap(
        padded,
        map_x + pad,
        map_y + pad,
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    ).astype(np.float32)
    # Smooth along the radius direction (rows), not across angles.
    profiles = cv2.GaussianBlur(profiles, (5, 1), 0)

    gradient = np.diff(profiles, axis=0)
    edge_index = np.argmin(gradient, axis=0)
    strengths = -gradient[edge_index, np.arange(n_angles)]
    valid = strengths > 11.0
    fraction = float(valid.mean())
    if fraction < 0.28:
        return None

    edge_radius = radii[edge_index]
    valid_radii = edge_radius[valid]
    if len(valid_radii) < 24:
        return None
    median_r = float(np.median(valid_radii))
    mad = float(np.median(np.abs(valid_radii - median_r)))
    if median_r < 4:
        return None

    keep = valid & (np.abs(edge_radius - median_r) <= max(2.5 * mad, 0.02 * median_r))
    if keep.sum() < 24:
        keep = valid
    points = np.column_stack(
        [cx + edge_radius[keep] * np.cos(angles[keep]), cy + edge_radius[keep] * np.sin(angles[keep])]
    )
    fitted = fit_circle(points)
    if fitted is None:
        return None
    fit_cx, fit_cy, fit_r = fitted
    if not (
        -0.15 * fit_r <= fit_cx <= w + 0.15 * fit_r
        and -0.15 * fit_r <= fit_cy <= h + 0.15 * fit_r
    ):
        return None

    residuals = np.sqrt((points[:, 0] - fit_cx) ** 2 + (points[:, 1] - fit_cy) ** 2)
    rms = float(np.sqrt(np.mean((residuals - fit_r) ** 2)))
    consistency = float(np.clip(1.0 - rms / max(0.07 * fit_r, 1.0), 0.0, 1.0))

    index_in = int(np.clip(round((0.80 * fit_r - r_min) / step), 0, len(radii) - 1))
    index_out = int(np.clip(round((1.14 * fit_r - r_min) / step), 0, len(radii) - 1))
    inside = float(np.median(profiles[index_in][valid]))
    outside = float(np.median(profiles[index_out][valid]))
    contrast = float(np.clip((inside - outside) / 55.0, 0.0, 1.0))

    threshold = (inside + outside) / 2.0
    mask = circle_mask(gray.shape, fit_cx, fit_cy, fit_r * 0.98)
    fill = float((gray[mask] > threshold).mean()) if mask.any() else 0.0
    fill = float(np.clip((fill - 0.55) / 0.40, 0.0, 1.0))

    radius_ratio = fit_r / min_side
    if 0.16 <= radius_ratio <= 0.50:
        radius_score = 1.0
    elif 0.09 <= radius_ratio < 0.16:
        radius_score = (radius_ratio - 0.09) / 0.07
    elif 0.50 < radius_ratio <= 0.62:
        radius_score = (0.62 - radius_ratio) / 0.12
    else:
        radius_score = 0.0

    strength_score = float(np.clip(float(np.median(strengths[valid])) / 45.0, 0.0, 1.0))
    confidence = (
        0.28 * fraction
        + 0.22 * consistency
        + 0.20 * fill
        + 0.15 * contrast
        + 0.10 * radius_score
        + 0.05 * strength_score
    )
    confidence = float(np.clip(confidence * (0.55 + 0.45 * strength_score), 0.0, 1.0))

    return {
        "cx": fit_cx,
        "cy": fit_cy,
        "r": fit_r,
        "confidence": confidence,
        "fraction": fraction,
        "consistency": consistency,
        "fill": fill,
        "contrast": contrast,
        "radiusScore": radius_score,
        "edgeStrength": strength_score,
        "rms": rms,
        "validAngles": int(valid.sum()),
    }


def candidate_centers(gray: np.ndarray):
    h, w = gray.shape[:2]
    min_side = min(h, w)
    candidates = []

    otsu, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = (gray > otsu).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:4]:
        area = cv2.contourArea(contour)
        if area < 0.03 * h * w:
            continue
        (cx, cy), _ = cv2.minEnclosingCircle(contour)
        r_area = math.sqrt(max(area, 1.0) / math.pi)
        if r_area > 0.04 * min_side:
            candidates.append((float(cx), float(cy), float(r_area), "threshold-mask"))

    distance = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    _, _, _, max_loc = cv2.minMaxLoc(distance)
    if max_loc is not None:
        dcx, dcy = float(max_loc[0]), float(max_loc[1])
        dr = float(distance[int(dcy), int(dcx)])
        if dr > 0.04 * min_side:
            candidates.append((dcx, dcy, dr * 1.55, "distance-transform"))

    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    hough = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=int(max(30, min_side * 0.15)),
        param1=110,
        param2=38,
        minRadius=int(min_side * 0.11),
        maxRadius=int(min_side * 0.62),
    )
    if hough is not None:
        for circle in hough[0][:6]:
            candidates.append(
                (float(circle[0]), float(circle[1]), float(circle[2]), "hough-circle")
            )

    unique = []
    for candidate in candidates:
        if all(
            math.hypot(candidate[0] - other[0], candidate[1] - other[1])
            > 0.05 * min_side
            for other in unique
        ):
            unique.append(candidate)
    return unique


def detect_field(rgb: np.ndarray):
    h, w = rgb.shape[:2]
    scale = min(1.0, DETECTION_MAX_SIDE / max(h, w))
    if scale < 1:
        small = cv2.resize(rgb, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    else:
        small = rgb
    gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    best = None
    best_method = ""
    for cx, cy, r_hint, method in candidate_centers(gray):
        fit = radial_fit(gray, cx, cy, r_hint)
        if fit is None:
            continue
        if best is None or fit["confidence"] > best["confidence"]:
            best = fit
            best_method = method

    if best is None:
        return None

    accepted = (
        best["confidence"] >= MIN_CONFIDENCE
        and best["fraction"] >= MIN_EDGE_FRACTION
        and best["consistency"] >= MIN_CONSISTENCY
        and best["fill"] >= MIN_FILL
        and best["contrast"] >= MIN_CONTRAST
    )
    best["accepted"] = bool(accepted)
    best["method"] = best_method
    best["scale"] = scale
    best["review"] = not accepted
    best["note"] = (
        ""
        if accepted
        else "تشخیص خودکار میدان میکروسکوپ با اطمینان کافی ممکن نبود؛ تصویر اصلی بدون برش حفظ شد."
    )
    return best


def crop_circle(rgb: np.ndarray, detection):
    h, w = rgb.shape[:2]
    cx = detection["cx"] / detection["scale"]
    cy = detection["cy"] / detection["scale"]
    radius = detection["r"] / detection["scale"]

    half = radius * CROP_SAFETY
    x0 = int(math.floor(cx - half))
    y0 = int(math.floor(cy - half))
    x1 = int(math.ceil(cx + half))
    y1 = int(math.ceil(cy + half))
    side = max(x1 - x0, y1 - y0)
    x1 = x0 + side
    y1 = y0 + side

    ix0, iy0 = max(0, x0), max(0, y0)
    ix1, iy1 = min(w, x1), min(h, y1)
    crop = rgb[iy0:iy1, ix0:ix1]
    # If the square crop runs past the photo, extend the nearest edge pixels.
    # A plain white/black fill would show up inside the circular field.
    top, left = iy0 - y0, ix0 - x0
    bottom, right = y1 - iy1, x1 - ix1
    if top or bottom or left or right:
        crop = cv2.copyMakeBorder(
            crop, top, bottom, left, right, cv2.BORDER_REPLICATE
        )
    canvas = crop

    out_side = min(side, OUTPUT_MAX_SIDE)
    if out_side != side:
        canvas = cv2.resize(canvas, (out_side, out_side), interpolation=cv2.INTER_AREA)

    scale_out = out_side / side
    mask_cx = (cx - x0) * scale_out
    mask_cy = (cy - y0) * scale_out
    mask_r = radius * MASK_GROW * scale_out
    mask = circle_mask((out_side, out_side), mask_cx, mask_cy, mask_r).astype(np.uint8) * 255
    feather = max(2, int(round(out_side * 0.0025)))
    mask = cv2.GaussianBlur(mask, (feather * 2 + 1, feather * 2 + 1), 0)

    rgba = cv2.cvtColor(canvas, cv2.COLOR_RGB2RGBA)
    rgba[:, :, 3] = mask
    return rgba, {
        "crop": [x0, y0, x1, y1],
        "center": [round(cx, 1), round(cy, 1)],
        "radius": round(radius, 1),
        "outSide": out_side,
    }


def contain_image(rgb: np.ndarray) -> np.ndarray:
    h, w = rgb.shape[:2]
    longest = max(h, w)
    if longest > OUTPUT_MAX_SIDE:
        factor = OUTPUT_MAX_SIDE / longest
        rgb = cv2.resize(rgb, None, fx=factor, fy=factor, interpolation=cv2.INTER_AREA)
    return rgb


def process_one(src: Path, output_stem: str, out_dir: Path):
    started = time.time()
    rgb = read_image(src)
    h, w = rgb.shape[:2]
    detection = detect_field(rgb)

    if detection is None:
        detection = {
            "accepted": False,
            "confidence": 0.0,
            "method": "none",
            "review": True,
            "note": "هیچ دایره‌ای برای میدان میکروسکوپ یافت نشد؛ تصویر اصلی بدون برش حفظ شد.",
            "fraction": 0.0,
            "consistency": 0.0,
            "fill": 0.0,
            "contrast": 0.0,
        }

    if detection["accepted"]:
        image, crop_info = crop_circle(rgb, detection)
        out_rel = f"cards/{output_stem}.webp"
        out_path = out_dir / out_rel
        out_path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(image).save(out_path, "WEBP", quality=90, method=6)
        out_w = out_h = crop_info["outSide"]
        display = "circle"
    else:
        image = contain_image(rgb)
        out_rel = f"cards/{output_stem}.jpg"
        out_path = out_dir / out_rel
        out_path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(image).save(out_path, "JPEG", quality=90, optimize=True)
        out_h, out_w = image.shape[:2]
        crop_info = {"crop": None, "center": None, "radius": None, "outSide": None}
        display = "contain"

    return {
        "status": "processed",
        "display": display,
        "output": norm_rel(str(out_path.relative_to(out_dir))),
        "width": int(out_w),
        "height": int(out_h),
        "detection": {
            "method": detection.get("method", "none"),
            "confidence": round(float(detection.get("confidence", 0.0)), 4),
            "review": bool(detection.get("review", True)),
            "fraction": round(float(detection.get("fraction", 0.0)), 4),
            "consistency": round(float(detection.get("consistency", 0.0)), 4),
            "fill": round(float(detection.get("fill", 0.0)), 4),
            "contrast": round(float(detection.get("contrast", 0.0)), 4),
            "center": crop_info["center"],
            "radius": crop_info["radius"],
            "crop": crop_info["crop"],
            "note": detection.get("note", ""),
        },
        "sourceWidth": int(w),
        "sourceHeight": int(h),
        "processingMs": int((time.time() - started) * 1000),
    }


def load_manifest(path: Path, input_dir: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    entries = []
    for item in data["files"]:
        rel = norm_rel(item["relativePath"])
        entries.append(
            {
                "relativePath": rel,
                "source": input_dir / rel,
                "outputStem": item["outputStem"],
            }
        )
    return entries


def discover(input_dir: Path):
    entries = []
    for src in sorted(input_dir.rglob("*")):
        if not src.is_file():
            continue
        rel = norm_rel(str(src.relative_to(input_dir)))
        if src.suffix.lower() not in SUPPORTED_EXTS:
            continue
        entries.append(
            {
                "relativePath": rel,
                "source": src,
                "outputStem": stable_out_stem(rel),
            }
        )
    return entries


def load_cache(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_cache(path: Path, cache: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default="input")
    parser.add_argument("--out", default="public")
    parser.add_argument("--manifest")
    parser.add_argument("--result", default="reports/image-processing.json")
    parser.add_argument("--cache", default=".cache/image-processing.json")
    parser.add_argument("--no-cache", action="store_true")
    args = parser.parse_args()

    input_dir = Path(args.input)
    out_dir = Path(args.out)
    result_path = Path(args.result)
    cache_path = Path(args.cache)
    if not input_dir.is_dir():
        log(f"input directory not found: {input_dir}")
        return 2

    entries = (
        load_manifest(Path(args.manifest), input_dir)
        if args.manifest
        else discover(input_dir)
    )
    cache = {} if args.no_cache else load_cache(cache_path)

    results = {}
    warnings = []
    for index, entry in enumerate(entries, 1):
        rel = entry["relativePath"]
        src = entry["source"]
        output_stem = entry["outputStem"]
        try:
            stat = src.stat()
            cached = cache.get(rel)
            output_rel = cached.get("output") if cached else None
            output_ok = bool(output_rel) and (out_dir / output_rel).exists()
            unchanged = (
                cached
                and cached.get("size") == stat.st_size
                and cached.get("mtimeNs") == stat.st_mtime_ns
                and cached.get("outputStem") == output_stem
                and output_ok
            )
            if unchanged:
                results[rel] = cached["result"]
                log(f"[{index}/{len(entries)}] cache   {rel}")
                continue

            log(f"[{index}/{len(entries)}] process {rel}")
            result = process_one(src, output_stem, out_dir)
            results[rel] = result
            cache[rel] = {
                "size": stat.st_size,
                "mtimeNs": stat.st_mtime_ns,
                "outputStem": output_stem,
                "output": result["output"],
                "result": result,
            }
        except Exception as error:  # keep the pipeline alive on one bad file
            warnings.append(f"{rel}: {type(error).__name__}: {error}")
            log(f"[{index}/{len(entries)}] ERROR   {rel}: {error}")
            results[rel] = {
                "status": "error",
                "display": "contain",
                "output": None,
                "error": f"{type(error).__name__}: {error}",
                "detection": {
                    "method": "none",
                    "confidence": 0.0,
                    "review": True,
                    "note": "پردازش تصویر با خطا مواجه شد.",
                },
            }

    processed = sum(1 for item in results.values() if item["status"] == "processed")
    circled = sum(1 for item in results.values() if item.get("display") == "circle")
    review = sum(1 for item in results.values() if item.get("detection", {}).get("review"))
    errors = sum(1 for item in results.values() if item["status"] == "error")

    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "summary": {
            "total": len(entries),
            "processed": processed,
            "circleCropped": circled,
            "needsReview": review,
            "errors": errors,
        },
        "warnings": warnings,
        "results": results,
    }
    result_path.parent.mkdir(parents=True, exist_ok=True)
    result_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if not args.no_cache:
        save_cache(cache_path, cache)

    log(
        f"done: {processed}/{len(entries)} processed, {circled} circle crops, "
        f"{review} need review, {errors} errors"
    )
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
