// Types of contracts/_plates.mjs for the app (src/ paints the same plate the server names).
export declare const PLATE_KEYS: readonly ['lilac', 'rose', 'sea', 'amber', 'moss', 'coal'];
export type PlateKey = typeof PLATE_KEYS[number];
export declare function articlePlate(id: string): PlateKey;
