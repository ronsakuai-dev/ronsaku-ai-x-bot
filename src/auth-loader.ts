import * as fs from "fs";
import * as path from "path";
import { BrowserContext } from "playwright";

const AUTH_FILE = path.resolve(process.cwd(), ".auth.json");

/**
 * .auth.json が存在するか確認する
 */
export function authFileExists(): boolean {
  return fs.existsSync(AUTH_FILE);
}

/**
 * BrowserContext に .auth.json のストレージ状態を適用する
 * Playwright の storageState 形式に対応
 */
export async function loadAuth(context: BrowserContext): Promise<void> {
  if (!authFileExists()) {
    throw new Error(
      `.auth.json が見つかりません。先に 'npm run login' を実行してください。`
    );
  }

  const rawJson = fs.readFileSync(AUTH_FILE, "utf-8");

  // storageState の内容は context 生成時に渡すのが正しいが、
  // ここでは cookie を動的に追加する方式で対応
  const state = JSON.parse(rawJson) as {
    cookies?: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires: number;
      httpOnly: boolean;
      secure: boolean;
      sameSite: string;
    }>;
  };

  if (state.cookies && state.cookies.length > 0) {
    await context.addCookies(
      state.cookies.map((c) => ({
        ...c,
        sameSite: (c.sameSite as "Strict" | "Lax" | "None") ?? "Lax",
      }))
    );
  }
}

export { AUTH_FILE };
