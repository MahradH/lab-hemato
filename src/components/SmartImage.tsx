import { useState } from "react";
import { ImageOff } from "lucide-react";

interface SmartImageProps {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
}

type Status = "loading" | "ready" | "error";

export function SmartImage({ src, alt, className, eager = false }: SmartImageProps) {
  const [status, setStatus] = useState<Status>("loading");

  return (
    <span className={`smart-image ${className ?? ""}`.trim()}>
      {status === "loading" ? (
        <span className="image-skeleton" aria-hidden="true" />
      ) : null}

      {status !== "error" ? (
        <img
          src={src}
          alt={alt}
          className={`smart-image__img ${status === "ready" ? "is-ready" : ""}`}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
        />
      ) : (
        <span className="image-error" role="img" aria-label="تصویر بارگذاری نشد">
          <ImageOff size={24} aria-hidden="true" />
          تصویر بارگذاری نشد
        </span>
      )}
    </span>
  );
}
