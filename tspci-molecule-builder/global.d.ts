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

// @types/three 0.180 mentions WebGPU's GPUTexture (ExternalTexture); the PCI uses WebGL only and lib "dom" has no WebGPU
interface GPUTexture {}
