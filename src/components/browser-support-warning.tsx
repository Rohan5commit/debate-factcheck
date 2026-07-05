"use client";

export function BrowserSupportWarning() {
  return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <div className="flex items-start gap-3">
        <span className="text-yellow-600 text-lg">⚠</span>
        <div>
          <h3 className="text-sm font-medium text-yellow-800">
            Browser Not Supported
          </h3>
          <p className="text-sm text-yellow-700 mt-1">
            Speech recognition is not supported in your browser. Please use
            Chrome or Edge for live speech fact-checking, or try Prep mode with
            text/PDF uploads.
          </p>
          <div className="mt-3">
            <p className="text-xs text-yellow-600">
              Supported browsers: Chrome, Edge, Safari (iOS 14.5+)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
