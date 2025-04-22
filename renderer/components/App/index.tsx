import isEqual from "lodash.isequal";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import menuIcon from "../../assets/menu-icon.png";
import styles from "./style.module.css";

// 定数
const TIMEOUT_DURATION = 1500;

// 型定義
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
  isMinimized: boolean;
  name: string;
};

type AppState = {
  isActive: boolean;
  isMinimized: boolean;
};

// AppItemコンポーネント - メモ化とDOMへの直接操作
const AppItem = memo(function AppItem({
  app,
  handleAppClick,
  lockedApp,
}: {
  app: AppInfo;
  handleAppClick: (app: AppInfo) => void;
  lockedApp: null | string;
}) {
  const itemRef = useRef<HTMLDivElement>(null);
  // クリック時の即時フィードバック
  const handleClick = useCallback(() => {
    // すぐにUI反応を見せる（楽観的UI更新）
    if (
      itemRef.current &&
      app.bundleIdentifier &&
      lockedApp !== app.bundleIdentifier
    ) {
      // クリック時に即座にクラスを切り替えて視覚的なフィードバックを与える
      if (app.isActive) {
        itemRef.current.classList.remove(styles.active);

        if (!app.isMinimized) {
          itemRef.current.classList.add(styles.minimized);
        }
      } else {
        itemRef.current.classList.add(styles.active);
        itemRef.current.classList.remove(styles.minimized);
      }

      // 実際のアプリ操作を呼び出す
      handleAppClick(app);
    }
  }, [app, handleAppClick, lockedApp]);

  // マウント時とプロパティ変更時にDOM要素のクラスを正しく更新
  useEffect(() => {
    if (itemRef.current) {
      // クラスを一度クリアして、現在の状態に基づいて再設定
      const element = itemRef.current;
      const classesToCheck = [styles.active, styles.minimized, styles.disabled];

      classesToCheck.forEach((cls) => {
        element.classList.remove(cls);
      });

      if (app.isActive) {
        element.classList.add(styles.active);
      }

      if (!app.isActive && app.isMinimized) {
        element.classList.add(styles.minimized);
      }

      if (lockedApp === app.bundleIdentifier) {
        element.classList.add(styles.disabled);
      }
    }
  }, [app.isActive, app.isMinimized, lockedApp, app.bundleIdentifier]);

  return (
    <div
      className={styles.appItem}
      key={app.bundleIdentifier ?? app.name}
      onClick={handleClick}
      onMouseDown={(e) => e.preventDefault()}
      ref={itemRef}
    >
      {app.iconPath && (
        <img
          alt={`${app.name} icon`}
          className={styles.appIcon}
          src={app.iconPath}
        />
      )}
      <span className={styles.appName}>{app.name}</span>
    </div>
  );
});

// メインコンポーネント
export default function App(): React.JSX.Element {
  // 状態管理
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [lockedApp, setLockedApp] = useState<null | string>(null);
  const [appStates, setAppStates] = useState<Record<string, AppState>>({});
  // 参照
  const lockedAppRef = useRef(lockedApp);
  const appStatesRef = useRef(appStates);
  const previousAppsRef = useRef<AppInfo[]>([]);

  // 参照の更新
  useEffect(() => {
    lockedAppRef.current = lockedApp;
    appStatesRef.current = appStates;
  }, [lockedApp, appStates]);

  // アプリクリック処理 - 即時UI反応と非同期処理の分離
  const handleAppClick = useCallback((app: AppInfo) => {
    if (!app.bundleIdentifier || lockedAppRef.current === app.bundleIdentifier)
      return;

    setLockedApp(app.bundleIdentifier);

    // ここではUIの更新は行わない。AppItemで楽観的UI更新を実装
    const intention = app.isActive ? "minimize" : "activate";

    window.api.executeAppAction({
      bundleId: app.bundleIdentifier,
      intention,
    });

    // タイムアウトベースの処理
    setTimeout(() => {
      const bundleId = app.bundleIdentifier!;
      // eslint-disable-next-line security/detect-object-injection
      const prev = appStatesRef.current[bundleId];
      // eslint-disable-next-line security/detect-object-injection
      const curr = appStatesRef.current[bundleId];

      if (
        prev &&
        curr &&
        (prev.isActive !== curr.isActive ||
          prev.isMinimized !== curr.isMinimized)
      ) {
        setLockedApp((current) => (current === bundleId ? null : current));
      }
    }, TIMEOUT_DURATION);
  }, []);

  // アプリリストの監視 - 差分更新の最適化
  useEffect(() => {
    const handler = (_event: unknown, appList: AppInfo[]) => {
      // 変更がない場合は早期リターン
      if (isEqual(appList, previousAppsRef.current)) return;

      // アプリの追加/削除/順序変更のみに対応する更新
      const newApps = [...appList];

      setApps(newApps);
      previousAppsRef.current = newApps;

      // 状態マップの効率的な更新
      const newStates = appList.reduce(
        (acc, app) => {
          if (app.bundleIdentifier) {
            acc[app.bundleIdentifier] = {
              isActive: app.isActive,
              isMinimized: app.isMinimized,
            };
          }

          return acc;
        },
        {} as Record<string, AppState>,
      );

      // 状態変更があった場合のみ更新
      if (!isEqual(newStates, appStatesRef.current)) {
        if (lockedAppRef.current) {
          const prev = appStatesRef.current[lockedAppRef.current];
          const curr = newStates[lockedAppRef.current];

          if (
            prev &&
            curr &&
            (prev.isActive !== curr.isActive ||
              prev.isMinimized !== curr.isMinimized)
          ) {
            setLockedApp(null);
          }
        }

        setAppStates(newStates);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.api.on("app-list", handler as any);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.api.off("app-list", handler as any);
    };
  }, []);

  return (
    <div className={styles.container}>
      <div
        onClick={() => {
          window.api.send("toggle-start-menu");
        }}
        className={styles.startButton}
      >
        <div className={styles.startButtonInner}>
          <img alt="menu-icon" className={styles.image} src={menuIcon} />
        </div>
      </div>
      {apps.map((app) => (
        <AppItem
          app={app}
          handleAppClick={handleAppClick}
          key={app.bundleIdentifier ?? app.name}
          lockedApp={lockedApp}
        />
      ))}
    </div>
  );
}
