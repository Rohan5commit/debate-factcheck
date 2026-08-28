"use client";

import { useState, useEffect, useCallback } from "react";
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
  const [logs, setLogs] = useState<DebugEntry[]>(() => getLogs());

  useEffect(() => {
    return subscribeLogs(() => setLogs([...getLogs()]));
  }, []);

  const clear = useCallback(() => clearLogs(), []);
  const exportJson = useCallback(() => exportLogsJson(), []);
  return { logs, clear, exportJson };
}
