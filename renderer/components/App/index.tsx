import isEqual from "lodash.isequal";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import menuIcon from "../../assets/menu-icon.png";
import styles from "./style.module.css";

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

export default function App(): React.JSX.Element {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [lockedApp, setLockedApp] = useState<null | string>(null);
  const [previousStates, setPreviousStates] = useState<
    Record<string, { isActive: boolean; isMinimized: boolean }>
  >({});
  const lockedAppRef = useRef(lockedApp);
  const previousStatesRef = useRef(previousStates);
  // 前回のアプリリストを保持するための参照を追加
  const previousAppsRef = useRef<AppInfo[]>([]);

  useEffect(() => {
    lockedAppRef.current = lockedApp;
    previousStatesRef.current = previousStates;
  }, [lockedApp, previousStates]);

  useEffect(() => {
    const handler = (_event: unknown, appList: AppInfo[]) => {
      // 前回のアプリリストと新しいアプリリストを比較
      if (!isEqual(appList, previousAppsRef.current)) {
        setApps(appList);
        // 前回のアプリリストを更新
        previousAppsRef.current = JSON.parse(JSON.stringify(appList));
      }

      const currentMap: Record<
        string,
        { isActive: boolean; isMinimized: boolean }
      > = {};

      for (const app of appList) {
        if (app.bundleIdentifier) {
          currentMap[app.bundleIdentifier] = {
            isActive: app.isActive,
            isMinimized: app.isMinimized,
          };
        }
      }

      // 現在の状態マップと前の状態マップが異なる場合のみ更新
      if (!isEqual(currentMap, previousStatesRef.current)) {
        if (lockedAppRef.current) {
          const prev = previousStatesRef.current[lockedAppRef.current];
          const curr = currentMap[lockedAppRef.current];

          if (
            prev &&
            curr &&
            (prev.isActive !== curr.isActive ||
              prev.isMinimized !== curr.isMinimized)
          ) {
            setLockedApp(null);
          }
        }

        setPreviousStates(currentMap);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.api.on("app-list", handler as any);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.api.off("app-list", handler as any);
    };
  }, []);

  const handleAppClick = useCallback(
    (app: AppInfo) => {
      if (!app.bundleIdentifier || lockedApp === app.bundleIdentifier) return;

      if (lockedApp !== app.bundleIdentifier) {
        setLockedApp(app.bundleIdentifier);
      }

      const intention = app.isActive ? "minimize" : "activate";

      window.api.executeAppAction({
        bundleId: app.bundleIdentifier,
        intention,
      });

      setTimeout(() => {
        const prev = previousStatesRef.current[app.bundleIdentifier!];
        const curr = previousStatesRef.current[app.bundleIdentifier!]; // use latest snapshot

        if (
          prev &&
          curr &&
          (prev.isActive !== curr.isActive ||
            prev.isMinimized !== curr.isMinimized)
        ) {
          setLockedApp((current) =>
            current === app.bundleIdentifier ? null : current,
          );
        }
      }, 1500);
    },
    [lockedApp],
  );
  const AppItem = memo(function AppItem({
    app,
    handleAppClick,
    lockedApp,
  }: {
    app: AppInfo;
    handleAppClick: (app: AppInfo) => void;
    lockedApp: null | string;
  }) {
    return (
      <div
        className={`${styles.appItem}
          ${app.isActive ? styles.active : ""}
          ${!app.isActive && app.isMinimized ? styles.minimized : ""}
          ${lockedApp === app.bundleIdentifier ? styles.disabled : ""}
        `}
        key={app.bundleIdentifier ?? app.name}
        onClick={() => handleAppClick(app)}
        onMouseDown={(e) => e.preventDefault()}
      >
        {app.iconPath && (
          <img
            alt={`${app.name} icon`}
            className={styles.appIcon}
            src={app.iconPath ?? ""}
          />
        )}
        <span className={styles.appName}>{app.name}</span>
      </div>
    );
  });

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
