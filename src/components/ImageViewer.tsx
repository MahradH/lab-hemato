import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import type { ViewerSource, ViewerState } from "../types";
import { assetUrl } from "../utils/asset";
import { faNum } from "../utils/number";

interface ImageViewerProps {
  state: ViewerState;
  onClose: () => void;
}

const MAX_SCALE = 5;
const MIN_SCALE = 1;

export function ImageViewer({ state, onClose }: ImageViewerProps) {
  const [source, setSource] = useState<ViewerSource>(state.source);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  const src = assetUrl(source === "original" ? state.card.original : state.card.image);
  const status =
    loadedSrc === src ? "ready" : failedSrc === src ? "error" : "loading";

  const resetZoom = useCallback(() => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  }, []);

  const changeScale = useCallback((next: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    setScale(clamped);
    if (clamped <= MIN_SCALE) setOffset({ x: 0, y: 0 });
  }, []);

  const zoomIn = () => changeScale(scale + 0.5);
  const zoomOut = () => changeScale(scale - 0.5);

  // Wheel zoom needs a non-passive native listener so the page cannot scroll.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      changeScale(scale - event.deltaY * 0.002);
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [scale, changeScale]);

  // Lock page scroll and restore focus on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setScale((current) => Math.min(MAX_SCALE, current + 0.5));
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setScale((current) => {
          const next = Math.max(MIN_SCALE, current - 0.5);
          if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
          return next;
        });
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        resetZoom();
        return;
      }
      if (event.key === "Tab") {
        const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href]",
        );
        if (!nodes || nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, resetZoom]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && scale <= 1) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 1) {
      dragRef.current = {
        x: event.clientX,
        y: event.clientY,
        ox: offset.x,
        oy: offset.y,
      };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale,
      };
      dragRef.current = null;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (pointers.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      changeScale(
        (pinchRef.current.scale * distance) /
          Math.max(1, pinchRef.current.distance),
      );
      return;
    }

    if (dragRef.current && scale > 1) {
      setOffset({
        x: dragRef.current.ox + (event.clientX - dragRef.current.x),
        y: dragRef.current.oy + (event.clientY - dragRef.current.y),
      });
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      dragRef.current = null;
      pinchRef.current = null;
    } else if (pointers.current.size === 1) {
      const [point] = [...pointers.current.values()];
      dragRef.current = {
        x: point.x,
        y: point.y,
        ox: offset.x,
        oy: offset.y,
      };
      pinchRef.current = null;
    }
  };

  const handleDoubleClick = () => {
    changeScale(scale > 1 ? 1 : 2.5);
  };

  const chooseSource = (next: ViewerSource) => {
    setSource(next);
    resetZoom();
  };

  const title = state.showTitle ? state.card.title : "نمایش تصویر";

  return createPortal(
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label={state.showTitle ? `نمایش تصویر ${state.card.title}` : "نمایش تصویر"}
      ref={dialogRef}
    >
      <div className="viewer-toolbar">
        <button
          type="button"
          className="viewer-btn"
          onClick={onClose}
          aria-label="بستن نمایش تصویر"
          title="بستن"
          ref={closeRef}
        >
          <X size={20} aria-hidden="true" />
        </button>

        <div className="viewer-title">
          {state.showTitle ? <bdi>{title}</bdi> : <span>نمایش تصویر</span>}
        </div>

        <div className="viewer-actions">
          <button
            type="button"
            className="viewer-btn"
            onClick={zoomOut}
            disabled={scale <= MIN_SCALE}
            aria-label="کوچک‌نمایی"
            title="کوچک‌نمایی"
          >
            <ZoomOut size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="viewer-btn"
            onClick={zoomIn}
            disabled={scale >= MAX_SCALE}
            aria-label="بزرگ‌نمایی"
            title="بزرگ‌نمایی"
          >
            <ZoomIn size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="viewer-btn"
            onClick={resetZoom}
            aria-label="بازنشانی بزرگ‌نمایی"
            title="بازنشانی بزرگ‌نمایی"
          >
            <RotateCcw size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        className="viewer-stage"
        ref={stageRef}
        data-zoomed={scale > 1}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        {status === "loading" ? (
          <span className="viewer-loading" aria-live="polite">
            در حال بارگذاری تصویر…
          </span>
        ) : null}
        {status === "error" ? (
          <span className="viewer-error">تصویر بارگذاری نشد.</span>
        ) : (
          <img
            className="viewer-image"
            src={src}
            alt={
              state.showTitle
                ? `تصویر میکروسکوپی ${state.card.title}`
                : "تصویر میکروسکوپی"
            }
            draggable={false}
            onLoad={() => {
              setLoadedSrc(src);
              setFailedSrc(null);
            }}
            onError={() => setFailedSrc(src)}
            style={{
              opacity: status === "ready" ? 1 : 0,
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            }}
          />
        )}
      </div>

      <div className="viewer-footer">
        <div className="viewer-source" role="group" aria-label="نوع تصویر">
          <button
            type="button"
            aria-pressed={source === "processed"}
            onClick={() => chooseSource("processed")}
          >
            تصویر پردازش‌شده
          </button>
          <button
            type="button"
            aria-pressed={source === "original"}
            onClick={() => chooseSource("original")}
          >
            تصویر کامل
          </button>
        </div>

        <span className="viewer-zoom-label">{faNum(Math.round(scale * 100))}٪</span>
        <span className="viewer-pan-hint">
          {scale > 1
            ? "برای جابه‌جایی بکشید"
            : "برای بزرگ‌نمایی دوبار لمس کنید"}
        </span>
      </div>
    </div>,
    document.body,
  );
}
