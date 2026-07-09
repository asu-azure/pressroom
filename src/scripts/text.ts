// Decode / scramble text effect (FUI flavor): characters randomize then resolve
// left-to-right into the final string over `duration` ms. Extracted from the
// portfolio's inline script so pages can import it.

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&/0123456789';

export function decode(el: HTMLElement, finalText: string, duration = 1100) {
  const start = performance.now();
  const len = finalText.length;
  function frame(now: number) {
    const p = Math.min(1, (now - start) / duration);
    const revealed = Math.floor(p * len);
    let out = '';
    for (let i = 0; i < len; i++) {
      if (i < revealed || finalText[i] === ' ') out += finalText[i];
      else out += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
    el.textContent = out;
    if (p < 1) requestAnimationFrame(frame);
    else el.textContent = finalText;
  }
  requestAnimationFrame(frame);
}
