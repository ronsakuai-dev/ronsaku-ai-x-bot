/**
 * scripts/login.ts - 初回ログインヘルパー
 *
 * 使い方:
 *   npm run login
 *
 * 実行するとヘッドフル(画面あり)でChromiumが起動します。
 * X.com にアクセスするので、手動でログインしてください。
 * ログイン完了後 Enterキーを押すと .auth.json が保存されます。
 * この .auth.json を base64 エンコードして GitHub Secrets に登録してください。
 */

import { chromium } from "playwright";
import * as path from "path";
import * as readline from "readline";

const AUTH_FILE = path.resolve(process.cwd(), ".auth.json");

function waitForEnter(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function login(): Promise<void> {
  console.log("=".repeat(60));
  console.log("論作AI X Bot - 初回ログインセットアップ");
  console.log("=".repeat(60));
  console.log("");
  console.log("Chromium が起動します。");
  console.log("X.com に @ronsaku_ai アカウントでログインしてください。");
  console.log("ログイン完了後、このターミナルに戻って Enter を押してください。");
  console.log("");

  const browser = await chromium.launch({
    headless: false, // 必ず画面あり
    slowMo: 100,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });

  const page = await context.newPage();
  await page.goto("https://x.com/login", { waitUntil: "domcontentloaded" });

  await waitForEnter("\nX.com へのログインが完了したら Enter を押してください...");

  // storage state を .auth.json として保存
  await context.storageState({ path: AUTH_FILE });
  console.log(`\n.auth.json を保存しました: ${AUTH_FILE}`);
  console.log("");
  console.log("次のステップ:");
  console.log("1. 下記コマンドで base64 エンコードしてクリップボードにコピー:");
  console.log(`   base64 -i .auth.json | pbcopy   (Mac)`);
  console.log(`   base64 .auth.json | clip         (Windows)`);
  console.log("2. GitHub の Settings > Secrets > Actions に移動");
  console.log("3. 'X_AUTH_JSON_B64' という名前で値を貼り付けて保存");
  console.log("");

  await browser.close();
  process.exit(0);
}

login().catch((err) => {
  console.error("エラー:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
