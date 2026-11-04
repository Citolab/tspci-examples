// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Volcanismepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

declare module "*.css" {
  const content: string;
  export = content;
}

declare module "*.svg" {
  const content: string;
  export = content;
}

declare module "qtiCustomInteractionContext" {
  const register: {register: (PortableInteraction) => void};
  export = register;
}