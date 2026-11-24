import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ImageOff,
  Maximize2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { Card, QuizQuestion } from "../types";
import { assetUrl } from "../utils/asset";
import { buildQuestion } from "../utils/quiz";
import { ExplanationPanel } from "./ExplanationPanel";
import { EmptyState } from "./EmptyState";
import { SmartImage } from "./SmartImage";

const OPTION_KEYS = ["الف", "ب", "پ"];

interface QuizViewProps {
  cards: readonly Card[];
  onOpenViewer: (card: Card, showTitle: boolean) => void;
}

export function QuizView({ cards, onOpenViewer }: QuizViewProps) {
  const [question, setQuestion] = useState<QuizQuestion | null>(() =>
    buildQuestion(cards),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const quizTopRef = useRef<HTMLDivElement>(null);
  const answered = selectedId !== null;

  useEffect(() => {
    // On narrow screens the feedback starts below the options; bring it into
    // view so the next action is immediately reachable. On wide screens the
    // two-column layout keeps it visible next to the image.
    if (!answered) return;
    if (!window.matchMedia("(max-width: 999px)").matches) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    feedbackRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  }, [answered]);

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={<ImageOff size={26} />}
        title="تصویری برای آزمون وجود ندارد"
        description="برای ساخت آزمون، دست‌کم یک تصویر میکروسکوپی در پوشه input/ قرار دهید و کاتالوگ را دوباره بسازید."
      />
    );
  }

  if (!question) {
    return (
      <EmptyState
        icon={<ImageOff size={26} />}
        title="ساخت سؤال ممکن نشد"
        description="مجموعه تصاویر خالی است. صفحه را دوباره بارگذاری کنید."
      />
    );
  }

  const isCorrect = answered && selectedId === question.card.id;

  const nextQuestion = () => {
    setQuestion(buildQuestion(cards, question.card.id));
    setSelectedId(null);
    if (window.matchMedia("(max-width: 999px)").matches) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      quizTopRef.current?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
    }
  };

  return (
    <div className="quiz-wrap" ref={quizTopRef}>
      <div className="quiz-head">
        <h2>آزمون تشخیص چشمی</h2>
        <p>
          {cards.length >= 3
            ? "یک تصویر، سه گزینه؛ بدون زمان و بدون نمره."
            : "یک تصویر و گزینه‌های موجود؛ بدون زمان و بدون نمره."}
        </p>
      </div>

      <div className="quiz-card">
        <div className="stage quiz-stage">
          <button
            type="button"
            className="stage-trigger"
            onClick={() => onOpenViewer(question.card, answered)}
            aria-label="بزرگ‌نمایی تصویر میکروسکوپی"
          >
            <SmartImage
              key={question.card.image}
              src={assetUrl(question.card.image)}
              alt={
                answered
                  ? `تصویر میکروسکوپی ${question.card.title}`
                  : "تصویر میکروسکوپی برای آزمون"
              }
              eager
            />
          </button>
          <div className="stage-actions">
            <button
              type="button"
              className="stage-action"
              onClick={() => onOpenViewer(question.card, answered)}
              aria-label="بزرگ‌نمایی تصویر"
              title="بزرگ‌نمایی تصویر"
            >
              <Maximize2 size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="quiz-body">
          <div className="options" role="group" aria-label="گزینه‌های پاسخ">
            {question.options.map((option, optionIndex) => {
              let state: "correct" | "wrong" | "muted" | undefined;
              if (answered) {
                if (option.id === question.card.id) state = "correct";
                else if (option.id === selectedId) state = "wrong";
                else state = "muted";
              }

              return (
                <button
                  type="button"
                  key={option.id}
                  className="option"
                  data-state={state}
                  disabled={answered}
                  onClick={() => setSelectedId(option.id)}
                >
                  <span className="option-key" aria-hidden="true">
                    {OPTION_KEYS[optionIndex] ?? optionIndex + 1}
                  </span>
                  <bdi className="option-title">{option.title}</bdi>
                  {state === "correct" ? (
                    <CheckCircle2
                      size={19}
                      className="option-icon"
                      aria-label="پاسخ درست"
                    />
                  ) : null}
                  {state === "wrong" ? (
                    <XCircle
                      size={19}
                      className="option-icon"
                      aria-label="پاسخ نادرست"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          {answered ? (
            <div
              ref={feedbackRef}
              className={`feedback ${
                isCorrect ? "feedback--success" : "feedback--error"
              }`}
              role="status"
              aria-live="polite"
            >
              <div className="feedback-head">
                <span className="feedback-icon" aria-hidden="true">
                  {isCorrect ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
                </span>
                <div>
                  <strong>{isCorrect ? "پاسخ درست است" : "پاسخ نادرست است"}</strong>
                  <p>
                    {isCorrect
                      ? "این یافته را به‌درستی شناسایی کردید."
                      : "پاسخ درست را ببینید و ویژگی‌های کلیدی آن را مرور کنید."}
                  </p>
                  <div className="feedback-answer">
                    پاسخ درست: <bdi>{question.card.title}</bdi>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="button button--primary quiz-next"
                onClick={nextQuestion}
              >
                <RefreshCw size={17} aria-hidden="true" />
                سؤال بعدی
              </button>

              <ExplanationPanel description={question.card.description} />
            </div>
          ) : (
            <p className="quiz-prompt">
              نام یافته را از میان گزینه‌ها انتخاب کنید.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
