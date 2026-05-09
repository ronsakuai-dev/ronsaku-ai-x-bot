/**
 * main.ts - エントリポイント
 *
 * 実行フロー:
 * 1. Sheets 取得 → 承認済 AND 未投稿 AND 投稿予定 <= 現在+5分 のレコードを取得
 * 2. 取得0件 → 終了(exit 0)
 * 3. ランダム遅延 0〜120秒(検知回避)
 * 4. Playwright でX投稿
 * 5. Sheets を投稿済に更新
 * 6. 連続失敗3回で circuit breaker 発動
 */

import { getPendingRows, markAsPosted } from "./sheets-client";
import { postToX } from "./x-poster";
import { SheetRow } from "./types";

const CIRCUIT_BREAKER_THRESHOLD = 3;
const MAX_RANDOM_DELAY_MS = 120_000; // 120秒

function log(level: "INFO" | "WARN" | "ERROR", message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): Promise<void> {
  const delay = Math.floor(Math.random() * MAX_RANDOM_DELAY_MS);
  log("INFO", `ランダム遅延 ${Math.round(delay / 1000)} 秒...`);
  return sleep(delay);
}

async function run(): Promise<void> {
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) {
    log("ERROR", "環境変数 SHEET_ID が設定されていません");
    process.exit(1);
  }

  // 1. 投稿対象行を取得
  log("INFO", "Sheets から投稿対象行を取得中...");
  let pendingRows: SheetRow[];
  try {
    pendingRows = await getPendingRows(sheetId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", `Sheets の取得に失敗しました: ${msg}`);
    process.exit(1);
  }

  // 2. 対象なし → 正常終了
  if (pendingRows.length === 0) {
    log("INFO", "投稿対象なし。終了します。");
    process.exit(0);
  }

  log("INFO", `投稿対象: ${pendingRows.length} 件`);

  // 3. ランダム遅延
  await randomDelay();

  // 4 & 5. 各行を投稿
  let consecutiveFailures = 0;

  for (const row of pendingRows) {
    if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      log(
        "ERROR",
        `circuit breaker 発動: 連続${CIRCUIT_BREAKER_THRESHOLD}回失敗のため全停止します`
      );
      process.exit(1);
    }

    log(
      "INFO",
      `投稿開始 (行${row.rowIndex}): [${row.timeSlot}] ${row.text.substring(0, 30)}...`
    );

    const result = await postToX(row);

    if (result.success) {
      consecutiveFailures = 0;
      log("INFO", `投稿成功: ${result.tweetUrl ?? "(URL不明)"}`);

      try {
        await markAsPosted(sheetId, row.rowIndex, result.tweetUrl ?? "");
        log("INFO", `Sheets 更新完了 (行${row.rowIndex})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log("WARN", `Sheets の更新に失敗しました (行${row.rowIndex}): ${msg}`);
        // Sheets 更新失敗は投稿自体は成功しているので続行
      }
    } else {
      consecutiveFailures++;
      log(
        "ERROR",
        `投稿失敗 (行${row.rowIndex}): ${result.error ?? "不明なエラー"} [連続失敗: ${consecutiveFailures}/${CIRCUIT_BREAKER_THRESHOLD}]`
      );
      if (result.screenshotPath) {
        log("ERROR", `スクリーンショット保存: ${result.screenshotPath}`);
      }
    }

    // 複数件ある場合は投稿間に追加遅延
    if (pendingRows.indexOf(row) < pendingRows.length - 1) {
      const interval = Math.floor(Math.random() * 30_000) + 10_000; // 10〜40秒
      log("INFO", `次の投稿まで ${Math.round(interval / 1000)} 秒待機...`);
      await sleep(interval);
    }
  }

  // circuit breaker に到達していなければ成功
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    log("ERROR", "circuit breaker 発動: 異常終了します");
    process.exit(1);
  }

  log("INFO", "全投稿処理が完了しました");
  process.exit(0);
}

run().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[FATAL] 予期しないエラー: ${msg}`);
  process.exit(1);
});
