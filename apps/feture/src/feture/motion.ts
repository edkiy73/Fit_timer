/** Shared motion defaults; domain gestures are implemented with D02. */
export const motionTokens = {
  feedback: { duration: .16 },
  panel: { duration: .28, ease: [.2, .8, .2, 1] as [number, number, number, number] },
  screen: { duration: .32, ease: [.2, .8, .2, 1] as [number, number, number, number] },
  swipeReturn: { type: 'spring' as const, stiffness: 380, damping: 32 },
};
