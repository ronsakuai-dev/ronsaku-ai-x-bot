/**
 * Google Sheets 1行分のデータ型
 * 列定義:
 *   A: 投稿予定日時 (ISO 8601)
 *   B: 時間帯 (朝/昼/夜)
 *   C: カテゴリ
 *   D: 本文 (140字以内)
 *   E: 画像URL (任意)
 *   F: 承認 (TRUE/FALSE)
 *   G: 投稿済 (TRUE/FALSE)
 *   H: 投稿後URL
 *   I: いいね数
 *   J: RT数
 */
export interface SheetRow {
  rowIndex: number;       // Sheetsの実際の行番号 (1始まり)
  scheduledAt: Date;      // 列A: 投稿予定日時
  timeSlot: string;       // 列B: 朝/昼/夜
  category: string;       // 列C: カテゴリ
  text: string;           // 列D: 本文
  imageUrl: string | null; // 列E: 画像URL
  approved: boolean;      // 列F: 承認
  posted: boolean;        // 列G: 投稿済
  postedUrl: string | null; // 列H: 投稿後URL
}

export interface PostResult {
  success: boolean;
  tweetUrl?: string;
  error?: string;
}

export interface AuthState {
  cookies: CookieEntry[];
  origins: OriginEntry[];
}

export interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

export interface OriginEntry {
  origin: string;
  localStorage: LocalStorageEntry[];
}

export interface LocalStorageEntry {
  name: string;
  value: string;
}

/** circuit breaker 用の状態ファイル型 */
export interface CircuitBreakerState {
  consecutiveFailures: number;
  lastFailedAt: string | null;
  tripped: boolean;
}
