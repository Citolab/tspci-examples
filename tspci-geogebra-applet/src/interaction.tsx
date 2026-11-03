import Applet from "./applet";
import { AppletSettings, AppletSource, GgbApi } from "./ggb";
import { Texts } from "./texts";

// The candidate works in the applet. index.tsx listens to it and reports what it says (ggb.ts readValues).

const Interaction = ({ settings, source, texts, onReady, onGone }: {
  settings: AppletSettings;
  source: AppletSource;
  texts: Texts;
  onReady: (api: GgbApi) => void;
  onGone: () => void;
}) => (
  <div className="flex max-w-full flex-col gap-3 font-sans text-slate-800">
    <Applet settings={settings} source={source} texts={texts} label={texts.region} onReady={onReady} onGone={onGone} />
  </div>
);

export default Interaction;
