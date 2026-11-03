import { DECIMALS, Nutrient, Product, Reference, SUB, UNIT, formatNumber, percentOf, perPortion, withEnergy } from "./nutrition";
import { Texts } from "./texts";

// A nutrition table as on EU packaging (Regulation 1169/2011): typical values per 100 g and per portion, with the
// percentage of the reference intake per portion. A real table: a screen reader reads it with its headers.

export const labelValue = (v: number | undefined, n: Nutrient, language: string) =>
  v === undefined ? "–" : `${formatNumber(v, language, DECIMALS[n], false)} ${UNIT[n]}`;

const energy = (v: { energyKj?: number; energyKcal?: number }, language: string) =>
  v.energyKj === undefined ? "–" : `${formatNumber(v.energyKj, language, 0)} kJ / ${formatNumber(v.energyKcal ?? 0, language, 0)} kcal`;

const NutritionLabel = ({ product, nutrients, reference, showPortion, language, texts, id }: {
  product: Product;
  /** the rows: energyKj stands for both energy units */
  nutrients: Nutrient[];
  reference: Reference;
  showPortion: boolean;
  language: string;
  texts: Texts;
  id?: string;
}) => {
  const per100 = withEnergy(product.per100);
  const portion = showPortion ? perPortion(product) : null;
  const ri = reference.values;
  const grams = formatNumber(product.portion, language, 1);
  const rows = nutrients.filter((n) => n !== "energyKcal");
  const pct = (v: number | undefined, n: Nutrient) => {
    if (v === undefined) return "";
    const p = percentOf(v, n, ri);
    return p === null ? "" : `${p}%`;
  };
  return (
    <table id={id} aria-label={`${texts.nutritionInformation}: ${product.name}`} className="nl-label w-full border-collapse text-[13px] leading-tight tabular-nums" data-testid={`label-${product.id}`}>
      <caption className="border-2 border-b-0 border-slate-900 bg-slate-900 px-2 py-1 text-left text-sm font-bold text-white">
        {texts.nutritionInformation}
      </caption>
      <thead>
        <tr className="border-x-2 border-b-4 border-slate-900">
          <th scope="col" className="px-2 py-1 text-left font-semibold">{texts.typicalValues}</th>
          <th scope="col" className="px-2 py-1 text-right font-semibold">{texts.per100}</th>
          {portion && <th scope="col" className="px-2 py-1 text-right font-semibold">{texts.perPortion(product.portionLabel, grams)}</th>}
          {portion && <th scope="col" className="px-2 py-1 text-right font-semibold"><abbr title={texts.reference} className="no-underline">{texts.ri}</abbr></th>}
        </tr>
      </thead>
      <tbody className="border-x-2 border-slate-900">
        {rows.map((n) => (
          <tr key={n} className={`border-b border-slate-300 ${n === "energyKj" ? "border-b-2 border-b-slate-900" : ""}`}>
            <th scope="row" className={`px-2 py-0.5 text-left font-normal ${SUB[n] ? "pl-5 text-slate-700" : "font-medium"}`}>{texts.nutrient[n]}</th>
            <td className="px-2 py-0.5 text-right whitespace-nowrap">{n === "energyKj" ? energy(per100, language) : labelValue(per100[n], n, language)}</td>
            {portion && <td className="px-2 py-0.5 text-right whitespace-nowrap">{n === "energyKj" ? energy(portion, language) : labelValue(portion[n], n, language)}</td>}
            {portion && <td className="px-2 py-0.5 text-right whitespace-nowrap">{pct(portion[n], n)}</td>}
          </tr>
        ))}
      </tbody>
      {portion && (
        <tfoot className="border-x-2 border-b-2 border-slate-900">
          <tr>
            <td colSpan={4} className="px-2 py-1 text-[11px] text-slate-600">
              {texts.riFootnote(texts.target[reference.group], ri.energyKj ? formatNumber(ri.energyKj, language, 0) : "", ri.energyKcal ? formatNumber(ri.energyKcal, language, 0) : "")}
            </td>
          </tr>
        </tfoot>
      )}
      {!portion && <tfoot className="border-x-2 border-b-2 border-slate-900"><tr><td colSpan={2} /></tr></tfoot>}
    </table>
  );
};

export default NutritionLabel;
