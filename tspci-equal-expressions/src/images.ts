import apple from "./images/apple.svg";
import pear from "./images/pear.svg";
import iceCream from "./images/ice-cream.svg";
import { Texts } from "./texts";
import { slot } from "@citolab/tspci/media";

/** The images an author can choose from (data-image); the bundler inlines them as data: URLs. */
export const PRESETS = { apple, pear, iceCream };
export type Preset = keyof typeof PRESETS;

export type ImageChoice = { src: string; name: string };

/**
 * The <img> of the image slot in qti-interaction-markup: an authoring system with a media bank puts the author's image
 * there, marked data-pci-slot="image" (the PCI authoring profile); an <img> without the mark, as in an item written by
 * hand, also works.
 */
export const imageFromMarkup = (dom: HTMLElement): ImageChoice | null => {
  const img = (slot("image", dom) as HTMLImageElement | null) ?? dom.querySelector("img");
  return img?.getAttribute("src") ? { src: img.src, name: img.alt } : null;
};

/**
 * The image that stands for the unknown number: an own image goes first (the one in the markup, then the uploaded one,
 * data-custom-image), then the chosen preset (an unknown or empty choice: the apple).
 */
export const chooseImage = (
  properties: { image: string; customImage: string; imageName: string },
  markup: ImageChoice | null,
  t: Texts
): ImageChoice => {
  const named = (src: string, fallback: string) => ({ src, name: properties.imageName?.trim() || fallback });
  if (markup) return named(markup.src, markup.name || t.names.custom);
  if (properties.customImage?.trim()) return named(properties.customImage.trim(), t.names.custom);
  const preset: Preset = properties.image in PRESETS ? (properties.image as Preset) : "apple";
  return named(PRESETS[preset], t.names[preset]);
};
