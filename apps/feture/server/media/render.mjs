// @ts-check
/** Pre-rendered image variants for the prelaunch storage (S3 §6). Runs only in the queue worker.
 * sharp drops EXIF/GPS and other metadata unless asked to keep it; `rotate()` applies the camera
 * orientation first so nothing depends on the stripped tag.
 * @typedef {{name: 'thumb' | 'card' | 'full' | 'blur', width: number, blur?: number}} VariantSpec
 * @typedef {{width: number, height: number, variants: {name: VariantSpec['name'], bytes: Uint8Array}[]}} Rendered
 * @typedef {{render: (bytes: Uint8Array) => Promise<Rendered>}} Renderer
 */

/** @type {VariantSpec[]} */
export const VARIANTS = [
  { name: 'thumb', width: 240 },
  { name: 'card', width: 720 },
  { name: 'full', width: 1600 },
  { name: 'blur', width: 360, blur: 30 },
];

/** @returns {Renderer} */
export function createSharpRenderer() {
  return {
    async render(bytes) {
      const sharp = (await import('sharp')).default;
      const input = Buffer.from(bytes);
      const meta = await sharp(input, { failOn: 'error', limitInputPixels: 50e6 }).rotate().metadata();
      // After rotate() the stored width/height may be swapped for portrait photos taken sideways.
      const swap = (meta.orientation ?? 1) >= 5;
      const width = /** @type {number} */ (swap ? meta.height : meta.width);
      const height = /** @type {number} */ (swap ? meta.width : meta.height);
      const variants = [];
      for (const v of VARIANTS) {
        let img = sharp(input, { failOn: 'error', limitInputPixels: 50e6 }).rotate().resize({ width: v.width, withoutEnlargement: true });
        if (v.blur) img = img.blur(v.blur);
        variants.push({ name: v.name, bytes: new Uint8Array(await img.webp({ quality: 82 }).toBuffer()) });
      }
      return { width, height, variants };
    },
  };
}
