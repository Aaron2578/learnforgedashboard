import { lazy } from "react";

export function lazyWithRetry(componentImport) {
  return lazy(async () => {
    const storageKey = "learnforge-module-reload-ts";

    // Attempt load with retry
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const module = await componentImport();
        // Clear flag on successful load
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch (_) {}
        return module;
      } catch (err) {
        if (attempt === 0) {
          // Wait 600ms before retry in case Vite/HMR is rebuilding
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      }
    }

    // If retry failed, check if we haven't reloaded recently (< 10 seconds ago)
    const lastReload = parseInt(window.sessionStorage.getItem(storageKey) || "0", 10);
    const now = Date.now();
    if (!lastReload || now - lastReload > 10000) {
      try {
        window.sessionStorage.setItem(storageKey, String(now));
      } catch (_) {}
      window.location.reload();
      return new Promise(() => {}); // prevent throw while reloading
    }

    // Final fallback attempt
    return await componentImport();
  });
}
