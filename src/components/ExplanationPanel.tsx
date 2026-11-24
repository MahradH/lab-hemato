import {
  AlertTriangle,
  BookOpen,
  ExternalLink,
  Info,
  Lightbulb,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { CardDescription } from "../types";

interface ExplanationPanelProps {
  description: CardDescription | null;
}

export function ExplanationPanel({ description }: ExplanationPanelProps) {
  if (!description) {
    return (
      <div className="notice">
        <Info size={18} aria-hidden="true" />
        <div>
          <strong>توضیح آموزشی این یافته هنوز ثبت نشده است.</strong>
          <p>
            تصویر و نام کارت در دسترس است؛ متن آموزشی پس از بررسی منابع معتبر
            افزوده خواهد شد.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="explanation">
      {description.needsReview ? (
        <div className="notice notice--warning">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>این توضیح نیازمند بازبینی است.</strong>
            <p>
              یافته یا نام فایل در منابع استاندارد به‌صورت قطعی تعریف نشده است؛
              متن با احتیاط و به‌عنوان راهنمای مطالعه ارائه شده است.
            </p>
          </div>
        </div>
      ) : null}

      <section className="desc-section">
        <h3>
          <BookOpen size={15} aria-hidden="true" />
          معرفی
        </h3>
        <p>{description.summary}</p>
      </section>

      {description.keyFeatures.length > 0 ? (
        <section className="desc-section">
          <h3>
            <Sparkles size={15} aria-hidden="true" />
            ویژگی‌های کلیدی
          </h3>
          <ul className="feature-list">
            {description.keyFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="desc-section">
        <h3>
          <Lightbulb size={15} aria-hidden="true" />
          نکته تشخیصی
        </h3>
        <p>{description.diagnosticSignificance}</p>
      </section>

      {description.differentialDiagnosis ? (
        <section className="desc-section">
          <h3>
            <ShieldAlert size={15} aria-hidden="true" />
            نکته افتراقی
          </h3>
          <p>{description.differentialDiagnosis}</p>
        </section>
      ) : null}

      {description.sources.length > 0 ? (
        <details className="sources">
          <summary>منابع</summary>
          <ul>
            {description.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  <span dir="ltr" lang="en">
                    {source.title}
                  </span>
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
