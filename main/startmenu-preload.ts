// startmenu-preload.ts
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("startMenuAPI", {
  // 必要になれば後で追加
});
