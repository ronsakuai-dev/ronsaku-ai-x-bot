import { google, sheets_v4 } from "googleapis";
import { SheetRow } from "./types";

const SHEET_NAME = "posts";
/** 投稿対象と判定する先読み時間 (ms) */
const LOOKAHEAD_MS = 5 * 60 * 1000; // 5分

function getSheets(): sheets_v4.Sheets {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? ".sa.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function parseBoolean(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.trim().toUpperCase() === "TRUE";
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.trim());
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Sheets から全行を取得し、投稿対象行を返す
 * 条件: 承認済 AND 未投稿 AND 投稿予定 <= 現在 + 5分
 */
export async function getPendingRows(sheetId: string): Promise<SheetRow[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${SHEET_NAME}!A2:J`,
  });

  const rows = res.data.values ?? [];
  const now = Date.now();
  const deadline = now + LOOKAHEAD_MS;
  const pending: SheetRow[] = [];

  rows.forEach((row, idx) => {
    const scheduledAt = parseDate(row[0] as string | undefined);
    if (!scheduledAt) return;

    const approved = parseBoolean(row[5] as string | undefined);
    const posted = parseBoolean(row[6] as string | undefined);

    if (!approved || posted) return;
    if (scheduledAt.getTime() > deadline) return;

    pending.push({
      rowIndex: idx + 2, // ヘッダー行(1)を除いて2始まり
      scheduledAt,
      timeSlot: (row[1] as string | undefined) ?? "",
      category: (row[2] as string | undefined) ?? "",
      text: (row[3] as string | undefined) ?? "",
      imageUrl: (row[4] as string | undefined) || null,
      approved,
      posted,
      postedUrl: (row[7] as string | undefined) || null,
    });
  });

  return pending;
}

/**
 * 投稿完了後に Sheets の G列(投稿済) と H列(URL) を更新する
 */
export async function markAsPosted(
  sheetId: string,
  rowIndex: number,
  tweetUrl: string
): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${SHEET_NAME}!G${rowIndex}:H${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [["TRUE", tweetUrl]],
    },
  });
}
