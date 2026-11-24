import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ImageOff, SearchX, Star } from "lucide-react";
import catalogData from "./generated/catalog.json";
import categoriesData from "./data/categories.fa.json";
import { EmptyState } from "./components/EmptyState";
import { FlashcardView } from "./components/FlashcardView";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { ImageViewer } from "./components/ImageViewer";
import { QuizView } from "./components/QuizView";
import { Toolbar } from "./components/Toolbar";
import { useHighlights } from "./hooks/useHighlights";
import { useTheme } from "./hooks/useTheme";
import type {
  Card,
  Catalog,
  Category,
  FilterMode,
  Mode,
  ViewerSource,
  ViewerState,
} from "./types";
import { assetUrl } from "./utils/asset";
import { normalizeSearch } from "./utils/search";

const catalog = catalogData as unknown as Catalog;
const allCategories = categoriesData as Category[];

interface ToastMessage {
  id: number;
  text: string;
}

export default function App() {
  const [mode, setMode] = useState<Mode>("flashcards");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  // The reveal state is tied to a card id, so changing cards hides the answer
  // without an effect.
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const { theme, toggleTheme } = useTheme();
  const { highlighted, toggle: toggleHighlight } = useHighlights();

  const cards = catalog.cards;
  const normalizedQuery = useMemo(() => normalizeSearch(query), [query]);

  const categoryLabels = useMemo(
    () => new Map(allCategories.map((item) => [item.id, item.label])),
    [],
  );
  const availableCategories = useMemo(
    () =>
      allCategories.filter((item) =>
        cards.some((card) => card.categoryIds.includes(item.id)),
      ),
    [cards],
  );

  const filtered = useMemo(
    () =>
      cards.filter((card) => {
        if (filter === "highlighted" && !highlighted.has(card.id)) return false;
        if (category !== "all" && !card.categoryIds.includes(category)) {
          return false;
        }
        if (normalizedQuery && !card.searchText.includes(normalizedQuery)) {
          return false;
        }
        return true;
      }),
    [cards, filter, highlighted, category, normalizedQuery],
  );

  const total = filtered.length;
  const safeIndex = total > 0 ? Math.min(index, total - 1) : 0;
  const card = filtered[safeIndex] ?? null;
  const revealed = Boolean(card && revealedCardId === card.id);
  const highlightedCount = cards.filter((item) => highlighted.has(item.id)).length;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const goNext = useCallback(() => {
    setIndex(total > 0 ? (safeIndex + 1) % total : 0);
    setRevealedCardId(null);
  }, [safeIndex, total]);

  const goPrev = useCallback(() => {
    setIndex(total > 0 ? (safeIndex - 1 + total) % total : 0);
    setRevealedCardId(null);
  }, [safeIndex, total]);

  const handleToggleReveal = useCallback(() => {
    if (!card) return;
    setRevealedCardId((current) => (current === card.id ? null : card.id));
  }, [card]);

  const handleToggleHighlight = useCallback(
    (id: string) => {
      const wasHighlighted = highlighted.has(id);
      toggleHighlight(id);
      setToast({
        id: Date.now(),
        text: wasHighlighted
          ? "کارت از هایلایت‌ها حذف شد."
          : "کارت به هایلایت‌ها اضافه شد.",
      });
    },
    [highlighted, toggleHighlight],
  );

  const handleQueryChange = useCallback((next: string) => {
    setQuery(next);
    setIndex(0);
    setRevealedCardId(null);
  }, []);

  const handleFilterChange = useCallback((next: FilterMode) => {
    setFilter(next);
    setIndex(0);
    setRevealedCardId(null);
  }, []);

  const handleCategoryChange = useCallback((next: string) => {
    setCategory(next);
    setIndex(0);
    setRevealedCardId(null);
  }, []);

  const clearFilters = useCallback(() => {
    setQuery("");
    setCategory("all");
    setFilter("all");
    setIndex(0);
    setRevealedCardId(null);
  }, []);

  const handleModeChange = useCallback((next: Mode) => {
    setMode(next);
    setViewer(null);
  }, []);

  const handleOpenViewer = useCallback(
    (source: ViewerSource) => {
      if (!card) return;
      setViewer({ card, source, showTitle: revealed });
    },
    [card, revealed],
  );

  const handleOpenQuizViewer = useCallback((quizCard: Card, showTitle: boolean) => {
    setViewer({ card: quizCard, source: "processed", showTitle });
  }, []);

  useEffect(() => {
    if (mode !== "flashcards" || viewer) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const onInteractive = Boolean(target?.closest("button, a"));

      if (event.code === "Space" && !onInteractive) {
        event.preventDefault();
        setRevealedCardId((current) =>
          current === card?.id ? null : (card?.id ?? null),
        );
        return;
      }
      if (event.key === "Enter" && !onInteractive) {
        event.preventDefault();
        setRevealedCardId((current) =>
          current === card?.id ? null : (card?.id ?? null),
        );
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goNext();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goPrev();
        return;
      }
      if (event.code === "KeyH" && card) {
        event.preventDefault();
        handleToggleHighlight(card.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, viewer, card, goNext, goPrev, handleToggleHighlight]);

  // Preload the neighbouring images so navigation feels immediate.
  useEffect(() => {
    if (mode !== "flashcards" || total < 2 || !card) return;
    const neighbours = [
      filtered[(safeIndex + 1) % total],
      filtered[(safeIndex - 1 + total) % total],
    ].filter((item): item is Card => Boolean(item));

    for (const neighbour of neighbours) {
      const image = new Image();
      image.src = assetUrl(neighbour.image);
    }
  }, [mode, card, filtered, safeIndex, total]);

  const emptyHighlighted = filter === "highlighted" && highlightedCount === 0;

  let content: ReactNode;
  if (cards.length === 0) {
    content = (
      <EmptyState
        icon={<ImageOff size={26} />}
        title="تصویری پیدا نشد"
        description="فایل‌های JPG، PNG، WEBP یا AVIF را در پوشه input/ قرار دهید و کاتالوگ را دوباره بسازید تا کارت‌ها ساخته شوند."
      />
    );
  } else if (emptyHighlighted) {
    content = (
      <EmptyState
        icon={<Star size={26} />}
        title="هنوز کارتی هایلایت نشده است"
        description="با زدن نشان ستاره روی هر کارت، آن را برای مرور دوباره نشان کنید. هایلایت‌ها پس از بستن مرورگر نیز باقی می‌مانند."
        actionLabel="نمایش همه تصاویر"
        onAction={() => handleFilterChange("all")}
      />
    );
  } else if (!card) {
    content = (
      <EmptyState
        icon={<SearchX size={26} />}
        title="نتیجه‌ای یافت نشد"
        description="جستجو یا فیلترهای فعلی هیچ کارتی را برنمی‌گردانند. عبارت دیگری را امتحان کنید یا فیلترها را پاک کنید."
        actionLabel="پاک کردن جستجو و فیلترها"
        onAction={clearFilters}
      />
    );
  } else {
    content = (
      <FlashcardView
        card={card}
        index={safeIndex}
        total={total}
        revealed={revealed}
        isHighlighted={highlighted.has(card.id)}
        categoryLabels={categoryLabels}
        onToggleReveal={handleToggleReveal}
        onPrev={goPrev}
        onNext={goNext}
        onToggleHighlight={() => handleToggleHighlight(card.id)}
        onOpenViewer={handleOpenViewer}
      />
    );
  }

  return (
    <>
      <a className="skip-link" href="#main">
        پرش به محتوای اصلی
      </a>

      <Header
        mode={mode}
        onModeChange={handleModeChange}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main id="main" className="main">
        <div className="container">
          {mode === "flashcards" ? (
            <>
              {cards.length > 0 ? (
                <Toolbar
                  query={query}
                  onQueryChange={handleQueryChange}
                  filter={filter}
                  onFilterChange={handleFilterChange}
                  category={category}
                  onCategoryChange={handleCategoryChange}
                  categories={availableCategories}
                  totalCount={cards.length}
                  highlightedCount={highlightedCount}
                  filteredCount={total}
                />
              ) : null}
              <div className="view-area">{content}</div>
            </>
          ) : (
            <QuizView cards={cards} onOpenViewer={handleOpenQuizViewer} />
          )}
        </div>
      </main>

      <Footer />

      {viewer ? (
        <ImageViewer key={viewer.card.id} state={viewer} onClose={() => setViewer(null)} />
      ) : null}

      {toast ? (
        <div className="toast" role="status" aria-live="polite" key={toast.id}>
          {toast.text}
        </div>
      ) : null}
    </>
  );
}
