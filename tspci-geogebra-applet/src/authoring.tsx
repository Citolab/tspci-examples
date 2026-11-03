import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import Applet from "./applet";
import { AppletSettings, AppletSource, GgbApi, listen, materialIdFrom, readValues } from "./ggb";
import { textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the author loads a material from geogebra.org or starts empty,
// builds the applet with every tool GeoGebra has, and Done writes it to data-ggb-base64.

const button = "rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40";

/** The names of the objects the response reads that the applet has. */
const reported = (api: GgbApi) => {
  const v = readValues(api);
  return [
    v.correct !== null && "correct",
    v.candidateResponse !== null && "answer",
    v.score !== null && "score",
    v.maxscore !== null && "maxscore",
  ].filter(Boolean) as string[];
};

const Authoring = ({ initial, initialMaterialId, settings, language, onApi, onChange }: {
  initial: AppletSource;
  initialMaterialId: string;
  /** The candidate's settings; the author gets every tool. */
  settings: AppletSettings;
  language: string;
  onApi: (api: GgbApi | null) => void;
  onChange: () => void;
}) => {
  const t = textsFor(language);
  const [source, setSource] = useState<AppletSource>(initial);
  /** Goes up on every load, so "Start empty" twice starts empty twice. */
  const [round, setRound] = useState(0);
  const start = (next: AppletSource) => {
    setSource(next);
    setRound((n) => n + 1);
    onChange();
  };
  const [idText, setIdText] = useState(initialMaterialId);
  const [invalid, setInvalid] = useState(false);
  const [names, setNames] = useState<string[] | null>(null);
  const stop = useRef<() => void>(() => { });

  const full = useMemo<AppletSettings>(() => ({
    ...settings,
    showToolBar: true,
    showMenuBar: true,
    showAlgebraInput: true,
    allowStyleBar: true,
    enableRightClick: true,
    enableUndoRedo: true,
    showZoomButtons: true,
    enableShiftDragZoom: true,
  }), [JSON.stringify(settings)]);

  useEffect(() => () => stop.current(), []);

  const load = (e: Event) => {
    e.preventDefault();
    const id = materialIdFrom(idText);
    setInvalid(!id);
    if (id) start({ materialId: id });
  };

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <form className="flex flex-wrap items-end gap-2" onSubmit={load}>
        <label className="flex min-w-64 flex-1 flex-col gap-1">
          <span className="font-medium">{t.materialId}</span>
          <input type="text" value={idText} data-testid="material-id" placeholder="abcd1234"
            aria-describedby="material-hint" aria-invalid={invalid}
            className="rounded-md border border-slate-300 px-2 py-1.5"
            onInput={(e) => setIdText((e.target as HTMLInputElement).value)} />
        </label>
        <button type="submit" className={button} title={t.replaceWarning} data-testid="load">{t.load}</button>
        <button type="button" className={button} title={t.replaceWarning} data-testid="empty"
          onClick={() => start(null)}>{t.startEmpty}</button>
      </form>
      <p id="material-hint" className={`m-0 text-xs ${invalid ? "text-red-600" : "text-slate-500"}`}>
        {invalid ? t.invalidId : t.materialHint}
      </p>
      <p className="m-0 text-xs text-slate-500">{t.authoringHint}</p>

      <Applet key={round} settings={full} source={source} texts={t} label={t.region}
        onReady={(api) => {
          onApi(api);
          setNames(reported(api));
          stop.current = listen(api, () => {
            setNames(reported(api));
            onChange();
          });
        }}
        onGone={() => {
          stop.current();
          onApi(null);
          setNames(null);
        }} />

      {names && <p className="m-0 text-slate-600" data-testid="reported">{t.found(names)}</p>}
    </div>
  );
};

export default Authoring;
