declare module "pixelmatch" {
  export default function pixelmatch(
    img1: Uint8Array | Uint8ClampedArray | Buffer,
    img2: Uint8Array | Uint8ClampedArray | Buffer,
    output: Uint8Array | Uint8ClampedArray | Buffer | null,
    width: number,
    height: number,
    options?: {
      threshold?: number;
      alpha?: number;
      includeAA?: boolean;
      diffColor?: [number, number, number];
      diffColorAlt?: [number, number, number];
      diffMask?: boolean;
      aaColor?: [number, number, number];
    },
  ): number;
}
