export {};

type Intention = "activate" | "minimize";

declare global {
  interface Window {
    api: {
      send: (channel: string, data?: unknown) => void;
      on: (
        channel: string,
        callback: (event: unknown, ...args: unknown[]) => void,
      ) => void;
      off: (
        channel: string,
        callback: (event: unknown, ...args: unknown[]) => void,
      ) => void;
      executeAppAction: ({ bundleId: string, intention: Intention }) => void;
      getFrontmostBundleId: () => string | null; // Added method declaration
      toggleStartMenu: () => void; // Added method declaration for IPC
    };
  }
}
