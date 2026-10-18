import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { usePWAInstall } from './usePWAInstall';

type Guide = {
  title: string;
  steps: string[];
};

function getInstallationGuide(isIOS: boolean): Guide {
  const ua = navigator.userAgent;
  const isIPadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  if (isIOS || isIPadDesktopMode) {
    return {
      title: 'Install Boss on iPhone or iPad',
      steps: [
        'Open this Boss website in Safari.',
        'Tap the Share icon (a square with an upward arrow).',
        'Choose Add to Home Screen, then tap Add.',
      ],
    };
  }
  if (/Android/i.test(ua)) {
    return {
      title: 'Install Boss on Android',
      steps: [
        'Open Boss in Google Chrome.',
        'Tap the three-dot menu in the upper-right corner.',
        'Choose Install app or Add to Home screen, then confirm.',
      ],
    };
  }
  if (/Edg\//i.test(ua)) {
    return {
      title: 'Install Boss on Microsoft Edge',
      steps: [
        'Click the three-dot menu (…) in the upper-right corner.',
        'Open Apps and choose Install this site as an app.',
        'Confirm the installation.',
      ],
    };
  }
  if (/Chrome\//i.test(ua)) {
    return {
      title: 'Install Boss on Google Chrome',
      steps: [
        'Look for an Install icon at the right of the browser address bar.',
        'Or open the three-dot menu and find Install page as app (often under Cast, save, and share).',
        'Confirm Install when asked.',
      ],
    };
  }
  if (/Macintosh/i.test(ua) && /Safari\//i.test(ua)) {
    return {
      title: 'Add Boss to your Mac Dock',
      steps: [
        'Open Boss in Safari.',
        'From the File menu, choose Add to Dock (on supported macOS versions).',
        'Confirm Add.',
      ],
    };
  }
  return {
    title: 'Add Boss to your device',
    steps: [
      'Open this site in Chrome, Edge, or Safari.',
      'Open the browser menu and look for Install app, Install page as app, or Add to Home Screen.',
      'If your browser does not offer installation, bookmark Boss for quick access.',
    ],
  };
}

/**
 * Show an install entry point whenever Boss is open in a browser.
 * Browsers decide whether native PWA installation is available, so fall back
 * to instructions rather than hiding the entry point.
 */
export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showGuide) return;
    closeButtonRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowGuide(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showGuide]);

  const closeGuide = () => {
    setShowGuide(false);
    // Allow the trigger to regain focus after the modal unmounts.
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleInstallClick = async () => {
    if (isInstallable && !isIOS) {
      try {
        const accepted = await install();
        if (accepted) return;
      } catch {
        // Prompt unavailable or failed: show a manual installation guide.
      }
    }
    setShowGuide(true);
  };

  // Once Boss is launched in its own installed window, the install button is unnecessary.
  if (isInstalled) return null;

  const guide = typeof navigator !== 'undefined'
    ? getInstallationGuide(isIOS)
    : { title: 'Install Boss', steps: [] };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleInstallClick}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400 transition cursor-pointer"
        title="Install Boss on this device"
        aria-haspopup="dialog"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        <span>Install Boss</span>
      </button>

      {showGuide && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeGuide(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="boss-install-guide-title"
            aria-describedby="boss-install-guide-description"
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl sm:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-400">Boss • App installation</p>
                <h2 id="boss-install-guide-title" className="text-lg font-bold">
                  {guide.title}
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close installation instructions"
                onClick={closeGuide}
                className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-teal-400"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p id="boss-install-guide-description" className="mb-4 text-sm text-slate-300">
              Your browser isn't showing an automatic install prompt right now. You can try these steps instead:
            </p>
            <ol className="space-y-3">
              {guide.steps.map((step, index) => (
                <li key={index} className="flex gap-3 text-sm text-slate-100">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-bold text-teal-300">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-5 text-xs text-slate-400">
              Installation options depend on your browser and device. Boss will still work through this website even if no install option is available.
            </p>
            <button
              type="button"
              onClick={closeGuide}
              className="mt-5 w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-teal-400"
            >
              Got it
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
