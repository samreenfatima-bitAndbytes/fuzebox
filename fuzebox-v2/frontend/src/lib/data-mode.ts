const KEY = "fuzebox_data_mode";

export type DataMode = "live" | "demo";

export function readDataMode(): DataMode {
  if (typeof window === "undefined") return "live";
  try {
    const v = localStorage.getItem(KEY);
    return v === "demo" ? "demo" : "live";
  } catch {
    return "live";
  }
}

export function writeDataMode(mode: DataMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}
