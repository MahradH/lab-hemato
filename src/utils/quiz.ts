import type { Card, QuizQuestion } from "../types";

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Build one quiz question. The correct card is picked randomly, avoiding the
 * previous card when possible. Options contain the correct title plus up to two
 * distinct wrong titles, in random order. With fewer than three distinct titles
 * all available options are used, never duplicated.
 */
export function buildQuestion(
  cards: readonly Card[],
  previousCardId?: string,
): QuizQuestion | null {
  if (cards.length === 0) return null;

  const pool =
    cards.length > 1 && previousCardId
      ? cards.filter((card) => card.id !== previousCardId)
      : cards;
  const card = pool[Math.floor(Math.random() * pool.length)];

  const byTitle = new Map<string, Card>();
  for (const candidate of shuffle(cards)) {
    if (!byTitle.has(candidate.title)) byTitle.set(candidate.title, candidate);
  }
  const wrong = shuffle(
    [...byTitle.values()].filter((candidate) => candidate.title !== card.title),
  ).slice(0, 2);

  return {
    card,
    options: shuffle([card, ...wrong]),
  };
}
