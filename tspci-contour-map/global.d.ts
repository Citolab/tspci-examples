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

// three 0.180 types mention WebGPU textures; this PCI uses WebGL only
interface GPUTexture {}
