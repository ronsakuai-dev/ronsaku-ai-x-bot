import { chromium, BrowserContext, Page, Locator } from "playwright";
// playwright-extra と stealth plugin は CommonJS require で読み込む
// (型定義が不完全なためやむを得ず require を使用)
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const { chromium: chromiumExtra } = require("playwright-extra") as { chromium: any };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthPlugin = require("puppeteer-extra-plugin-stealth") as () => unknown;

import * as path from "path";
import * as fs from "fs";
import { SheetRow, PostResult } from "./types";
import { loadAuth } from "./auth-loader";

// ------- 定数 -------
const X_HOME = "https://x.com/home";
const X_COMPOSE_URL = "https://x.com/compose/tweet";

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
];

// ------- ユーティリティ -------

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 人間らしいタイピングをシミュレート
 */
async function humanType(locator: Locator, text: string): Promise<void> {
  await locator.click();
  await sleep(randomInt(200, 500));
  // pressSequentially は locator-aware で contenteditable(DraftJS等)への入力反映が安定する
  await locator.pressSequentially(text, { delay: randomInt(60, 110) });
}

/**
 * ランダムなマウス移動で人間らしさを演出
 */
async function randomMouseMovement(page: Page): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const x = randomInt(100, viewport.width - 100);
  const y = randomInt(100, viewport.height - 100);
  await page.mouse.move(x, y, { steps: randomInt(5, 15) });
  await sleep(randomInt(100, 300));
}

// ------- ブラウザ起動 -------

async function launchBrowser(headless: boolean): Promise<BrowserContext> {
  // stealth plugin を playwright-extra に適用
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (chromiumExtra as any).use(StealthPlugin());

  const viewport = randomItem(VIEWPORTS);
  const userAgent = randomItem(USER_AGENTS);

  const browser = await chromiumExtra.launch({
    headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
    ],
  });

  const context = await browser.newContext({
    viewport,
    userAgent,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });

  // navigator.webdriver を undefined に (ブラウザ内スクリプトとして文字列で渡す)
  await context.addInitScript(`
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  `);

  return context;
}

// ------- ログイン状態確認 -------

async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto(X_HOME, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await sleep(randomInt(2500, 4000));

  // 未ログインだと /login や /i/flow/login にリダイレクトされる
  const url = page.url();
  if (url.includes("/login") || url.includes("/i/flow")) {
    return false;
  }

  // ログイン要素のいずれかが見つかればOK(タイミング差を吸収)
  const composeBtn = page.locator('[data-testid="SideNav_NewTweet_Button"]');
  const profileLink = page.locator('[data-testid="AppTabBar_Profile_Link"]');
  try {
    await composeBtn.or(profileLink).first().waitFor({ state: "visible", timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

// ------- 画像アップロード -------

async function uploadImage(page: Page, imageUrl: string): Promise<void> {
  // 画像をダウンロードして一時ファイルとして保存
  const response = await page.context().request.get(imageUrl);
  const buffer = await response.body();
  const tmpPath = path.join("/tmp", `x-bot-img-${Date.now()}.jpg`);
  fs.writeFileSync(tmpPath, buffer);

  const fileInput = page.locator('input[data-testid="fileInput"]');
  await fileInput.setInputFiles(tmpPath);
  await sleep(randomInt(2000, 4000)); // アップロード待機

  // 一時ファイル削除
  fs.unlinkSync(tmpPath);
}

// ------- ツイート差分検証用 -------

/**
 * @ronsaku_ai のプロフィールから「最新(=ID最大)のツイートhref」を取得する
 * - 投稿前後で比較し、差分があれば投稿成功と判定するために使用
 * - 必ず article 要素が出るまで待ってから取得
 */
async function getLatestTweetHref(context: BrowserContext): Promise<string> {
  const page = await context.newPage();
  try {
    await page.goto(`https://x.com/ronsaku_ai`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    try {
      await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15_000 });
    } catch {
      return "";
    }
    await sleep(1500);
    const links = page.locator('article[data-testid="tweet"] a[href*="/status/"]');
    const count = await links.count();
    let latest = "";
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute("href");
      if (href && /\/status\/\d+$/.test(href.split("?")[0] ?? "") && (!latest || href > latest)) {
        latest = href;
      }
    }
    return latest;
  } finally {
    await page.close();
  }
}

// ------- 投稿実行 -------

/**
 * X に投稿して投稿URLを返す
 */
async function saveScreenshot(page: Page | null, prefix: string): Promise<string> {
  if (!page) return "";
  const filePath = `/tmp/x-bot-${prefix}-${Date.now()}.png`;
  try {
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  } catch {
    return "";
  }
}

export async function postToX(row: SheetRow): Promise<PostResult> {
  const isCI = process.env.CI === "true";
  const context = await launchBrowser(isCI);
  let page: Page | null = null;

  try {
    await loadAuth(context);
    page = await context.newPage();

    // ログイン確認
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      return {
        success: false,
        error: "X へのログインが確認できませんでした。Cookie が失効している可能性があります。npm run login を再実行してください。",
      };
    }

    await randomMouseMovement(page);
    await sleep(randomInt(500, 1500));

    // compose 画面に移動
    await page.goto(X_COMPOSE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(randomInt(1000, 2000));

    // テキストエリアを探す(複数マッチする可能性があるため first を使用)
    const tweetBox = page.locator('[data-testid="tweetTextarea_0"]').first();
    await tweetBox.waitFor({ state: "visible", timeout: 15_000 });

    await randomMouseMovement(page);
    await sleep(randomInt(300, 800));

    // テキスト入力(人間風タイピング)
    await humanType(tweetBox, row.text);
    await sleep(randomInt(500, 1500));

    // 画像アップロード(任意)
    if (row.imageUrl) {
      await uploadImage(page, row.imageUrl);
    }

    await randomMouseMovement(page);
    await sleep(randomInt(500, 1000));

    // 投稿実行: 通常クリック → force → JS直接click → キーボードの順でフォールバック
    const submitButton = page.locator('[data-testid="tweetButton"]').first();
    await submitButton.waitFor({ state: "visible", timeout: 10_000 });
    const shortcutModifier = process.platform === "darwin" ? "Meta" : "Control";
    try {
      await submitButton.click({ timeout: 5_000 });
    } catch {
      try {
        await submitButton.click({ force: true, timeout: 5_000 });
      } catch {
        try {
          // JavaScript経由でDOMのclick()を直接呼ぶ(オーバーレイ無視)
          await submitButton.evaluate((el) => (el as unknown as { click: () => void }).click());
        } catch {
          // 最終手段: Twitter公式ショートカット (macOS=Cmd+Enter, Linux/Win=Ctrl+Enter)
          await tweetBox.focus();
          await sleep(randomInt(200, 500));
          await page.keyboard.press(`${shortcutModifier}+Enter`);
        }
      }
    }

    // 投稿確定待機
    await sleep(randomInt(4000, 6000));

    // 投稿確定の検証: composeダイアログが閉じている = テキストエリアが消えていることを確認
    // 投稿成功すると tweetTextarea_0 は DOM から消える / hidden になる
    const stillVisible = await tweetBox.isVisible().catch(() => false);
    if (stillVisible) {
      // テキストエリアがまだ見える = 投稿失敗(モーダルが閉じていない)
      const screenshotPath = await saveScreenshot(page, "compose-not-closed");
      return {
        success: false,
        error: "投稿後も compose ダイアログが閉じておらず、投稿が確定していません",
        screenshotPath,
      };
    }

    // プロフィールページから最新ツイートURLを取得 (best effort: 取れなくても成功扱い)
    let tweetUrl = "https://x.com/ronsaku_ai";
    try {
      const href = await getLatestTweetHref(context);
      if (href) tweetUrl = `https://x.com${href.split("?")[0]}`;
    } catch {
      /* URL取得失敗は致命的ではない */
    }

    return {
      success: true,
      tweetUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const screenshotPath = await saveScreenshot(page, "exception");
    return {
      success: false,
      error: message,
      screenshotPath,
    };
  } finally {
    await context.browser()?.close();
  }
}

// headful モード用エクスポート (login.ts から使う)
export { launchBrowser, chromium };
