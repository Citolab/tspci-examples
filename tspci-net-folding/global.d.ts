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
// @types/three 0.180 names the WebGPU texture type, which the dom lib of this TypeScript does not have
interface GPUTexture {}
