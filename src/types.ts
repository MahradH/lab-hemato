export interface Source {
  title: string;
  url: string;
}

export interface CardDescription {
  nameFa?: string;
  summary: string;
  keyFeatures: string[];
  diagnosticSignificance: string;
  differentialDiagnosis?: string;
  categories?: string[];
  tags?: string[];
  sources: Source[];
  needsReview?: boolean;
}

export interface DetectionInfo {
  method?: string;
  confidence?: number;
  review?: boolean;
  note?: string;
  center?: [number, number] | null;
  radius?: number | null;
  crop?: [number, number, number, number] | null;
  fraction?: number;
  consistency?: number;
  fill?: number;
  contrast?: number;
}

export interface Card {
  id: string;
  title: string;
  relativePath: string;
  image: string;
  original: string;
  width: number | null;
  height: number | null;
  display: "circle" | "contain";
  detection: DetectionInfo;
  description: CardDescription | null;
  descriptionKey: string;
  categoryIds: string[];
  searchText: string;
}

export interface Catalog {
  generatedAt: string;
  total: number;
  described: number;
  missingDescriptions: string[];
  cards: Card[];
}

export interface Category {
  id: string;
  label: string;
}

export type Mode = "flashcards" | "quiz";
export type FilterMode = "all" | "highlighted";
export type ViewerSource = "processed" | "original";

export interface ViewerState {
  card: Card;
  source: ViewerSource;
  showTitle: boolean;
}

export interface QuizQuestion {
  card: Card;
  options: Card[];
}
