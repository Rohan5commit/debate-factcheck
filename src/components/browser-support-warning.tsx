"use client";

function detectBrowser(): { name: string; supported: boolean } {
  if (typeof window === "undefined") {
    return { name: "unknown", supported: false };
  }

  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes("comet") || ua.includes("perplexity")) {
    return { name: "Comet", supported: true };
  }

  if (ua.includes("edg/") || ua.includes("edge/")) {
    return { name: "Edge", supported: true };
  }

  if (ua.includes("chrome") && !ua.includes("edg/")) {
    return { name: "Chrome", supported: true };
  }

  if (ua.includes("safari") && !ua.includes("chrome")) {
    const versionMatch = ua.match(/version\/([\d.]+)/);
    const version = versionMatch ? parseFloat(versionMatch[1]) : 0;
    if (version >= 14.5) {
      return { name: "Safari", supported: true };
    }
    return { name: "Safari", supported: false };
  }

  if (ua.includes("firefox")) {
    return { name: "Firefox", supported: false };
  }

  return { name: "unknown", supported: false };
}

export function getBrowserInfo() {
  return detectBrowser();
}

export function BrowserSupportWarning() {
  const browser = detectBrowser();

  if (browser.supported) {
    return null;
  }

  return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <div className="flex items-start gap-3">
        <span className="text-yellow-600 text-lg">⚠</span>
        <div>
          <h3 className="text-sm font-medium text-yellow-800">
            Browser Not Supported for Live Mode
          </h3>
          <p className="text-sm text-yellow-700 mt-1">
            Speech recognition requires Chrome, Edge, or Comet browser. 
            Your current browser ({browser.name}) does not support the Web Speech API.
          </p>
          <div className="mt-3 space-y-1">
            <p className="text-xs text-yellow-600">
              <strong>Supported browsers:</strong> Chrome, Edge, Comet, Safari (iOS 14.5+)
            </p>
            <p className="text-xs text-yellow-600">
              <strong>Alternative:</strong> Use Prep mode to check text and PDF uploads
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
