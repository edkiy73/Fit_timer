// Types of contracts/_approve.mjs for the app («Что подтверждает партнёр»).
export declare const APPROVE_POINTS: readonly ['profile', 'posts', 'comments', 'likes', 'follows', 'links', 'communities', 'events', 'chats', 'private'];
export type ApprovePoint = typeof APPROVE_POINTS[number];
export declare const SWITCHABLE: readonly ['profile', 'posts', 'comments', 'likes', 'follows', 'links', 'communities', 'events', 'chats'];
export declare const OLD_MODE: readonly ApprovePoint[];
export declare const KIND_POINT: Readonly<Record<string, ApprovePoint>>;
