"use client";

interface ModeTabsProps {
  activeMode: "live" | "prep";
  onModeChange: (mode: "live" | "prep") => void;
}

export function ModeTabs({ activeMode, onModeChange }: ModeTabsProps) {
  return (
    <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
      <button
        onClick={() => onModeChange("live")}
        className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
          activeMode === "live"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-600 hover:text-gray-900"
        }`}
      >
        Live
      </button>
      <button
        onClick={() => onModeChange("prep")}
        className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
          activeMode === "prep"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-600 hover:text-gray-900"
        }`}
      >
        Prep
      </button>
    </div>
  );
}
