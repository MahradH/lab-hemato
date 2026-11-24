import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Maximize2,
  ScanLine,
  Star,
} from "lucide-react";
import type { Card, ViewerSource } from "../types";
import { assetUrl } from "../utils/asset";
import { faNum } from "../utils/number";
import { ExplanationPanel } from "./ExplanationPanel";
import { SmartImage } from "./SmartImage";

interface FlashcardViewProps {
  card: Card;
  index: number;
  total: number;
  revealed: boolean;
  isHighlighted: boolean;
  categoryLabels: Map<string, string>;
  onToggleReveal: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleHighlight: () => void;
  onOpenViewer: (source: ViewerSource) => void;
}

export function FlashcardView({
  card,
  index,
  total,
  revealed,
  isHighlighted,
  categoryLabels,
  onToggleReveal,
  onPrev,
  onNext,
  onToggleHighlight,
  onOpenViewer,
}: FlashcardViewProps) {
  const description = card.description;
  const categories = card.categoryIds
    .map((id) => categoryLabels.get(id))
    .filter((label): label is string => Boolean(label));
  const reviewImage = Boolean(card.detection?.review);

  return (
    <article
      className="study-layout"
      aria-label={`کارت ${faNum(index + 1)} از ${faNum(total)}`}
    >
      <section className="stage-card" data-revealed={revealed}>
        <div className="stage">
          <button
            type="button"
            className="stage-trigger"
            onClick={onToggleReveal}
            aria-pressed={revealed}
            aria-label={revealed ? "پنهان کردن پاسخ" : "نمایش پاسخ"}
          >
            <SmartImage
              key={card.image}
              src={assetUrl(card.image)}
              alt={
                revealed
                  ? `تصویر میکروسکوپی ${card.title}`
                  : "تصویر میکروسکوپی؛ برای مشاهده پاسخ روی تصویر بزنید"
              }
              eager
            />
            <span
              className={`reveal-hint ${revealed ? "reveal-hint--revealed" : ""}`}
            >
              {revealed ? (
                <>
                  <EyeOff size={14} aria-hidden="true" />
                  برای پنهان کردن پاسخ دوباره لمس کنید
                </>
              ) : (
                <>
                  <Eye size={14} aria-hidden="true" />
                  برای مشاهده پاسخ، تصویر را لمس کنید
                </>
              )}
            </span>
          </button>

          <div className="stage-actions">
            <button
              type="button"
              className="stage-action"
              onClick={onToggleHighlight}
              aria-pressed={isHighlighted}
              aria-label={isHighlighted ? "حذف از هایلایت‌ها" : "افزودن به هایلایت‌ها"}
              title={isHighlighted ? "حذف از هایلایت‌ها" : "افزودن به هایلایت‌ها"}
            >
              <Star
                size={18}
                fill={isHighlighted ? "currentColor" : "none"}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className="stage-action"
              onClick={() => onOpenViewer("processed")}
              aria-label="بزرگ‌نمایی تصویر"
              title="بزرگ‌نمایی تصویر"
            >
              <Maximize2 size={18} aria-hidden="true" />
            </button>
          </div>

          {isHighlighted ? (
            <span className="stage-flag">
              <Star size={11} fill="currentColor" aria-hidden="true" />
              هایلایت‌شده
            </span>
          ) : null}
        </div>

        <div className="stage-meta">
          <span className="counter">
            کارت <strong>{faNum(index + 1)}</strong> از {faNum(total)}
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() => onOpenViewer("original")}
          >
            <ScanLine size={15} aria-hidden="true" />
            مشاهده تصویر کامل
          </button>
        </div>

        <div className="card-nav">
          <button type="button" className="nav-button" onClick={onPrev}>
            <ChevronRight size={17} aria-hidden="true" />
            قبلی
          </button>
          <button
            type="button"
            className="nav-button nav-button--primary"
            onClick={onToggleReveal}
            aria-pressed={revealed}
          >
            {revealed ? (
              <EyeOff size={17} aria-hidden="true" />
            ) : (
              <Eye size={17} aria-hidden="true" />
            )}
            {revealed ? "پنهان کردن پاسخ" : "نمایش پاسخ"}
          </button>
          <button type="button" className="nav-button" onClick={onNext}>
            بعدی
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
        </div>

        <p className="shortcut-hint">
          میان‌بر: <kbd>Space</kbd> نمایش پاسخ · <kbd>→</kbd> قبلی ·{" "}
          <kbd>←</kbd> بعدی · <kbd>H</kbd> هایلایت
        </p>
      </section>

      <section className="info-panel">
        <div className="answer-card">
          <span className="eyebrow">
            {revealed ? "یافته شناسایی‌شده" : "کارت مطالعه"}
          </span>

          {revealed ? (
            <div className="answer-revealed">
              <h2 className="answer-title">
                <bdi>{card.title}</bdi>
              </h2>
              {description?.nameFa ? (
                <p className="answer-fa">{description.nameFa}</p>
              ) : null}

              {categories.length > 0 || description?.needsReview || reviewImage ? (
                <div className="badge-row">
                  {categories.map((label) => (
                    <span key={label} className="badge">
                      {label}
                    </span>
                  ))}
                  {description?.needsReview ? (
                    <span className="badge badge--gold">
                      <AlertTriangle size={12} aria-hidden="true" />
                      محتوای نیازمند بازبینی
                    </span>
                  ) : null}
                  {reviewImage ? (
                    <span className="badge badge--gold">
                      برش تصویر نیازمند بازبینی
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="answer-hidden">
              <span className="answer-hidden__icon" aria-hidden="true">
                <LockKeyhole size={20} />
              </span>
              <div>
                <strong>پاسخ پنهان است</strong>
                <p>
                  ابتدا تصویر را با دقت بررسی کنید؛ سپس روی آن بزنید یا دکمه
                  «نمایش پاسخ» را انتخاب کنید.
                </p>
              </div>
            </div>
          )}
        </div>

        {revealed ? (
          <div className="explanation-card">
            <ExplanationPanel description={description} />
            {reviewImage && card.detection?.note ? (
              <p className="processing-note">{card.detection.note}</p>
            ) : null}
          </div>
        ) : (
          <div className="explanation-locked">
            <CheckCircle2 size={17} aria-hidden="true" />
            پس از نمایش پاسخ، توضیح آموزشی و ویژگی‌های کلیدی این یافته اینجا
            ظاهر می‌شود.
          </div>
        )}
      </section>
    </article>
  );
}
