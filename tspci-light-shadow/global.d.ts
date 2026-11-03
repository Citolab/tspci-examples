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
// @types/three 0.180 names WebGPU types that lib "dom" of TypeScript does not have yet
interface GPUTexture {}
