"use client";

import { useSyncExternalStore, useCallback } from "react";
import {
  getLogs,
  subscribeLogs,
  clearLogs,
  exportLogsJson,
  type DebugEntry,
} from "@/lib/debug-log";

export function useDebugLog(): {
  logs: DebugEntry[];
  clear: () => void;
  exportJson: () => string;
} {
  const logs = useSyncExternalStore(subscribeLogs, getLogs, getLogs);
  const clear = useCallback(() => clearLogs(), []);
  const exportJson = useCallback(() => exportLogsJson(), []);
  return { logs, clear, exportJson };
}
