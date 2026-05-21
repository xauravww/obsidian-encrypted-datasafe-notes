// ⚠ WARNING: Do NOT change the structure of these SVGs.
// updateRibbonIcon() in main.ts relies on:
//   - Exactly 2 <path> elements per SVG
//   - path[0] = lock body (never modified)
//   - path[1] = shackle (stroke-dasharray toggled by updateRibbonIcon)
// Changing the number of paths or their order will BREAK icon rendering.

export const lockSVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export const unlockSVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="4 4" stroke-dashoffset="-4" stroke-linejoin="round"/>
</svg>`;
