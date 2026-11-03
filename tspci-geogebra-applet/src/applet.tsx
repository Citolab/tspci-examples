import { useEffect, useRef, useState } from "preact/hooks";
import { AppletSettings, AppletSource, GgbApi, createFrame, injectApplet } from "./ggb";
import { Texts } from "./texts";

// One GeoGebra applet with its loading and error states. A new `source` (or a new key) starts a new applet.

const Applet = ({ settings, source, texts, label, onReady, onGone }: {
  settings: AppletSettings;
  source: AppletSource;
  texts: Texts;
  /** The accessible name of the region around the applet. */
  label: string;
  onReady: (api: GgbApi) => void;
  /** The applet is removed (a new one comes, or the component goes). */
  onGone?: () => void;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let api: GgbApi | null = null;
    let stop = () => { };
    setStatus("loading");
    // a fresh frame per applet (ggb.ts createFrame)
    const frame = createFrame(label);
    host.current.replaceChildren(frame);
    injectApplet(frame, settings, source)
      .then((loaded) => {
        if (cancelled) {
          loaded.stop();
          return;
        }
        api = loaded.api;
        stop = loaded.stop;
        setStatus("ready");
        onReady(loaded.api);
      })
      .catch(() => !cancelled && setStatus("failed"));
    return () => {
      cancelled = true;
      stop();
      if (api) {
        onGone?.();
        try { api.remove(); } catch { /* gone already */ }
      }
      frame.remove();
    };
  }, [attempt, source, JSON.stringify(settings)]);

  return (
    <section aria-label={label} aria-busy={status === "loading"}
      className={`relative w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)]`}
      style={{ maxWidth: `${settings.width + 2}px`, minHeight: status === "ready" ? undefined : `${Math.min(settings.height, 320)}px` }}>
      <div ref={host} data-testid="applet" className={status === "ready" ? "" : "pointer-events-none"} hidden={status === "failed"} />
      {status === "loading" && (
        <div role="status" data-testid="loading"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90 text-sm text-slate-600">
          <span aria-hidden="true" className="size-8 animate-spin rounded-full border-4 border-slate-200 border-t-violet-600" />
          {texts.loading}
        </div>
      )}
      {status === "failed" && (
        <div role="alert" data-testid="error"
          className="flex min-h-[inherit] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-700">
          <p className="m-0 max-w-sm">{texts.failed}</p>
          <button type="button" data-testid="retry" onClick={() => setAttempt((n) => n + 1)}
            className="rounded-md bg-violet-600 px-4 py-1.5 font-medium text-white hover:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
            {texts.tryAgain}
          </button>
        </div>
      )}
    </section>
  );
};

export default Applet;
