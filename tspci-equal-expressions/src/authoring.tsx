import { useRef, useState } from "preact/hooks";
import { ImageChoice } from "./images";
import { Tokens, Unknown, parse } from "./interaction";
import { Texts } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the author uploads an own image for the unknown number. It is
// stored in data-custom-image as a data: URL, so the item needs no separate file and works in every delivery system.
// An authoring system with a media bank can put an <img> in the markup instead (config.tspci.markup).

/** The image is shown at 40 px; 160 px keeps it sharp on a 4x screen. */
const MAX_SIDE = 160;
/** An SVG up to this size is kept as it is (it stays sharp); a larger one is drawn as a bitmap. */
const MAX_SVG = 48 * 1024;
const MAX_STORED = 96 * 1024;

export type Stored = { src: string; description: string };

const readAs = (file: File, as: "dataUrl" | "text") =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    as === "dataUrl" ? reader.readAsDataURL(file) : reader.readAsText(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("not an image"));
    img.src = src;
  });

const kb = (dataUrl: string) => Math.ceil(dataUrl.length / 1024);

/** Shrinks a picture to MAX_SIDE and stores it as PNG or WebP, whichever is smaller (both keep transparency). */
export async function storeImage(file: File, t: Texts): Promise<Stored> {
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  if (!isSvg && !file.type.startsWith("image/")) throw new Error(t.notAnImage);
  const original = await readAs(file, "dataUrl");
  const img = await loadImage(original).catch(() => {
    throw new Error(t.notAnImage);
  });
  if (isSvg && file.size <= MAX_SVG) {
    const src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(await readAs(file, "text"))))}`;
    return { src, description: t.storedSvg(kb(src)) };
  }
  const width = img.naturalWidth || MAX_SIDE;
  const height = img.naturalHeight || MAX_SIDE;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL("image/png");
  const webp = canvas.toDataURL("image/webp", 0.9); // a browser without WebP gives PNG again
  const src = webp.startsWith("data:image/webp") && webp.length < png.length ? webp : png;
  if (src.length > MAX_STORED) throw new Error(t.tooBig(kb(src)));
  return { src, description: t.stored(canvas.width, canvas.height, kb(src)) };
}

const Authoring = ({ initial, expression, language, t, onChange }: {
  initial: string;
  language: string;
  expression: string;
  t: Texts;
  onChange: (src: string) => void;
}) => {
  const [src, setSrc] = useState(initial);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const use = async (file: File | undefined) => {
    if (!file) return;
    try {
      const stored = await storeImage(file, t);
      setSrc(stored.src);
      setDescription(stored.description);
      setError("");
      onChange(stored.src);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const remove = () => {
    setSrc("");
    setDescription("");
    onChange("");
  };

  const image: ImageChoice = { src, name: t.names.custom };
  const parsed = parse(expression);
  const format = new Intl.NumberFormat(language, { maximumFractionDigits: 3, useGrouping: false });

  return (
    <div className="flex flex-col gap-4 p-5 font-sans text-slate-800">
      <h2 className="m-0 text-lg font-semibold">{t.ownImage}</h2>
      <div
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
          dragging ? "border-sky-500 bg-sky-50" : "border-slate-300 bg-slate-50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          use(e.dataTransfer?.files?.[0]);
        }}
      >
        {src ? (
          <img src={src} alt="" className="h-28 w-28 object-contain" />
        ) : (
          <svg className="h-12 w-12 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="2" />
            <path d="m21 16-5-5-9 9" />
          </svg>
        )}
        <p className="m-0 text-sm text-slate-600">
          {t.dropHere}{" "}
          <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-sky-700 underline underline-offset-2" onClick={() => fileInput.current?.click()}>
            {t.choose}
          </button>
        </p>
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => use((e.target as HTMLInputElement).files?.[0])} />
      </div>
      {error && <p role="alert" className="m-0 text-sm text-rose-600">{error}</p>}
      {src ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-sm text-slate-500">{description}</p>
            <button type="button" className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900" onClick={remove}>
              {t.remove}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.preview}</span>
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-2xl">
              {parsed.expression ? <Tokens tokens={parsed.expression.tokens} image={image} format={format} t={t} /> : <Unknown image={image} size="h-10 w-10" />}
            </div>
          </div>
          <p className="m-0 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{t.replaces}</p>
        </>
      ) : (
        <p className="m-0 text-sm text-slate-500">{t.empty}</p>
      )}
    </div>
  );
};

export default Authoring;
