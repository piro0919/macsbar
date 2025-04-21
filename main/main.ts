import { execFileSync, execSync, spawn } from "child_process";
import { app, BrowserWindow, ipcMain, screen } from "electron";
import * as path from "path";

type AppBounds = { height: number; width: number; x: number; y: number };
type App = {
  bounds: AppBounds[];
  bundleIdentifier: null | string;
  iconPath: string;
  isActive: boolean;
  name: string;
};

// シングルインスタンスロックを取得
const gotLock = app.requestSingleInstanceLock();
// ウィンドウの参照を保持する配列
const windows: BrowserWindow[] = [];

let startMenuWindow: BrowserWindow | null = null;

/**
 * アプリケーションのウィンドウを作成する関数
 */
function createWindow() {
  const displays = screen.getAllDisplays();
  const isDev = !app.isPackaged;

  displays.forEach((display, index) => {
    const {
      bounds: { height, width, x, y },
    } = display;
    const dockHeight = 24;
    const win = new BrowserWindow({
      alwaysOnTop: true,
      focusable: false,
      frame: false,
      hasShadow: false,
      height: dockHeight,
      resizable: false,
      roundedCorners: false,
      skipTaskbar: true,
      transparent: true,
      vibrancy: "sidebar",
      visualEffectState: "active",
      webPreferences: {
        backgroundThrottling: true,
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.resolve(__dirname, "./preload.js"),
        spellcheck: false,
        webSecurity: false,
      },
      width,
      x,
      y: y + height - dockHeight,
    });

    // ウィンドウ参照を配列に保存
    windows.push(win);

    // アプリの読み込みURL
    const url = isDev
      ? "http://localhost:5173"
      : `file://${path.resolve(__dirname, "../index.html")}`;

    // 開発モードの場合、最初のウィンドウにDevToolsを表示
    if (isDev && index === 0) {
      win.webContents.openDevTools({ mode: "detach" });
    }

    // URLの読み込みとエラー処理
    win.loadURL(url).catch((err) => {
      console.error("Failed to load URL:", err);
    });

    win.webContents.on("did-finish-load", () => {
      const appList = getRunningAppNames();
      const appsOnThisDisplay = appList.filter((app) =>
        app.bounds.some((b) => {
          const centerX = b.x + b.width / 2;
          const centerY = b.y + b.height / 2;

          return (
            centerX >= x &&
            centerX <= x + width &&
            centerY >= y &&
            centerY <= y + height
          );
        }),
      );

      win.webContents.send("app-list", appsOnThisDisplay);
    });

    // ウィンドウが閉じられたときのイベント処理
    win.on("closed", () => {
      // 閉じられたウィンドウの参照を配列から削除
      const windowIndex = windows.indexOf(win);

      if (windowIndex !== -1) {
        windows.splice(windowIndex, 1);
      }
    });
  });
}

function createStartMenuWindow() {
  const isDev = !app.isPackaged;

  startMenuWindow = new BrowserWindow({
    alwaysOnTop: true,
    frame: false,
    hasShadow: true,
    height: 400,
    resizable: false,
    roundedCorners: false,
    show: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.resolve(__dirname, "./startmenu-preload.js"),
    },
    width: 300,
    x: 100, // Will be overridden dynamically
    y: 100,
  });

  const url = isDev
    ? "http://localhost:5173/start-menu"
    : `file://${path.resolve(__dirname, "../start-menu.html")}`;

  startMenuWindow.loadURL(url).catch((err) => {
    console.error("Failed to load StartMenu URL:", err);
  });
}

type WindowBounds = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type AppInfo = {
  bounds: WindowBounds[];
  bundleIdentifier: null | string;
  iconPath: null | string;
  isActive: boolean;
  name: string;
};

function getRunningAppNames(): AppInfo[] {
  try {
    const result = execFileSync(
      app.isPackaged
        ? path.join(process.resourcesPath, "swift-bin", "app_observer")
        : path.resolve(__dirname, "../../swift-bin/app_observer"),
    );

    return JSON.parse(result.toString()) as AppInfo[];
  } catch (err) {
    console.error("Failed to get app list from Swift CLI:", err);

    return [];
  }
}

/**
 * macOS用のDock非表示処理を行う関数
 */
function hideDockOnMacOS() {
  if (process.platform === "darwin") {
    app.dock?.hide();

    // 自動起動時の追加処理
    const loginItemSettings = app.getLoginItemSettings();
    const launchedAtLogin =
      loginItemSettings.wasOpenedAsHidden || loginItemSettings.wasOpenedAtLogin;

    if (launchedAtLogin) {
      console.log("Application was launched at login");
    }
  }
}

function controlAppWithAppleScript(
  bundleId: string,
  action: "activate" | "minimize",
) {
  // Finderの場合は特別処理
  if (bundleId === "com.apple.finder") {
    const appName = "Finder";

    try {
      let script;

      if (action === "activate") {
        script = `
          tell application "${appName}"
            reopen
            activate
          end tell
        `;
      } else if (action === "minimize") {
        script = `
          tell application "System Events"
            tell process "${appName}"
              set visible to false
            end tell
          end tell
        `;
      }

      execSync(`osascript -e '${script}'`);
      console.log(`Successfully ${action}d ${appName} via AppleScript`);

      return true;
    } catch (err) {
      console.error(`Failed to ${action} ${appName} via AppleScript:`, err);

      return false;
    }
  }

  // Finder以外のアプリの場合は直接Swiftの実装にフォールバック
  return false;
}

// シングルインスタンスロックを確認
if (!gotLock) {
  console.log("Another instance is already running. Exiting...");
  app.quit();
} else {
  // 初期化処理
  // macOS用のDock非表示処理
  hideDockOnMacOS();

  // アプリ起動完了時の処理
  app
    .whenReady()
    // eslint-disable-next-line promise/always-return
    .then(() => {
      // 起動完了後にDock非表示を再確認（macOSのみ）
      hideDockOnMacOS();

      // ウィンドウ作成
      createWindow();
      createStartMenuWindow();
      startAppMonitor(windows);
    })
    .catch((err) => {
      console.error("Failed to initialize application:", err);
    });

  // すべてのウィンドウが閉じられたときの処理
  app.on("window-all-closed", () => {
    // macOS以外ではアプリを終了する
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  // アプリがアクティブになったときの処理（macOS特有）
  app.on("activate", () => {
    // ウィンドウが一つも開かれていない場合、新しいウィンドウを作成
    if (windows.length === 0) {
      createWindow();
    }
  });

  // アプリ終了時の処理
  app.on("quit", () => {
    console.log("Application is quitting...");
  });

  ipcMain.on(
    "execute-app-action",
    (
      _event: Electron.IpcMainEvent,
      data: {
        bundleId: string;
        intention: "activate" | "minimize";
      },
    ) => {
      // まずAppleScriptで試す
      const success = controlAppWithAppleScript(data.bundleId, data.intention);

      // 失敗した場合のみSwiftのapp_observerを使用
      if (!success) {
        try {
          const args = [
            "--execute",
            data.bundleId,
            "--intention",
            data.intention,
          ];

          execFileSync(
            app.isPackaged
              ? path.join(process.resourcesPath, "swift-bin", "app_observer")
              : path.resolve(__dirname, "../../swift-bin/app_observer"),
            args,
          );
        } catch (err) {
          console.error("Failed to execute app action with app_observer:", err);
        }
      }
    },
  );

  ipcMain.on("get-frontmost-bundle-id", (event) => {
    try {
      const result = execSync(
        "osascript -e 'tell application \"System Events\" to get the bundle identifier of first application process whose frontmost is true'",
      )
        .toString()
        .trim();

      event.returnValue = result || null;
    } catch {
      event.returnValue = null;
    }
  });

  ipcMain.on("toggle-start-menu", () => {
    if (!startMenuWindow) return;

    if (startMenuWindow.isVisible()) {
      startMenuWindow.hide();
    } else {
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);
      const targetWindow = windows.find((win) => {
        const bounds = win.getBounds();

        return (
          bounds.x === display.bounds.x &&
          bounds.y === display.bounds.y + display.bounds.height - bounds.height
        );
      });
      const barBounds = targetWindow?.getBounds() ?? display.bounds;
      const height = 400;
      const width = 300;
      const x = barBounds.x;
      const y = barBounds.y - height;

      startMenuWindow.setBounds({ height, width, x, y });
      targetWindow?.moveTop();
      startMenuWindow.show();
    }
  });
}

export function startAppMonitor(windows: BrowserWindow[]) {
  const monitorPath = app.isPackaged
    ? path.join(process.resourcesPath, "swift-bin", "app_observer")
    : path.resolve(__dirname, "../../swift-bin/app_observer");
  const lastSentJsonMap = new Map<number, string>();
  const proc = spawn(monitorPath, ["--watch"]);

  let buffer = "";

  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk: string) => {
    buffer += chunk;

    let boundary = buffer.indexOf("\n");

    while (boundary !== -1) {
      const line = buffer.slice(0, boundary).trim();

      buffer = buffer.slice(boundary + 1);
      boundary = buffer.indexOf("\n");

      if (line.length === 0) continue;

      try {
        const apps = JSON.parse(line) as App[];

        for (const win of windows) {
          const winBounds = win.getBounds();
          const winDisplay = screen.getDisplayMatching(winBounds);
          const filteredApps = apps.filter((app) =>
            app.bounds.some((b) => {
              const appDisplay = screen.getDisplayMatching(b);

              return appDisplay.id === winDisplay.id;
            }),
          );
          const winId = win.id;
          const json = JSON.stringify(filteredApps);

          if (lastSentJsonMap.get(winId) !== json) {
            lastSentJsonMap.set(winId, json);
            win.webContents.send("app-list", filteredApps);
          }
        }
      } catch (err) {
        console.error("Invalid JSON from monitor_apps:", err);
        console.error("Payload:", line);
      }
    }
  });

  proc.stderr.on("data", (data) => {
    console.error("[monitor_apps stderr]", data.toString());
  });

  proc.on("error", (err) => {
    console.error("Failed to start monitor_apps:", err);
  });
}
