import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  executeAppAction: (actionData: {
    bundleId: string;
    intention: "activate" | "minimize";
  }) => {
    ipcRenderer.send("execute-app-action", actionData);
  },
  getFrontmostBundleId: () => ipcRenderer.sendSync("get-frontmost-bundle-id"),
  off: <T = unknown>(
    channel: string,
    callback: (event: unknown, data: T) => void,
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcRenderer.removeListener(channel, callback as any);
  },
  on: <T = unknown>(
    channel: string,
    callback: (event: unknown, data: T) => void,
  ) => {
    ipcRenderer.on(channel, (_event, ...args) => {
      callback(_event, args[0] as T);
    });
  },
  send: (channel: string, data?: unknown) => {
    ipcRenderer.send(channel, data);
  },
});
