import type { Point } from '../domain/battle.ts';

export function bindBattlePointer(options: {
  canvas: HTMLCanvasElement; map: HTMLCanvasElement; isBattle: () => boolean;
  blocked: readonly HTMLElement[]; scale: () => number; world: (x: number, y: number) => Point | null;
  order: (button: number, point: Point) => void; message: (message: string) => void;
}) {
  let pointer: { x: number; y: number } | null = null;
  const clear = () => { pointer = null; };
  const move = (event: PointerEvent) => {
    const target = event.target;
    if (!options.isBattle() || event.pointerType !== 'mouse' || event.buttons ||
      (target instanceof Element && target.closest('button,input,select,textarea,a,dialog,[role="button"],[contenteditable="true"]')) ||
      (target instanceof Node && options.blocked.some(element => element.contains(target))) ||
      (target instanceof HTMLCanvasElement && target !== options.canvas)) { clear(); return; }
    const rect = options.canvas.getBoundingClientRect();
    pointer = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null;
  };
  const out = (event: PointerEvent) => { if (!event.relatedTarget) clear(); };
  const order = (event: PointerEvent) => {
    if (!options.isBattle() || (event.button !== 0 && event.button !== 2)) return;
    const rect = options.canvas.getBoundingClientRect();
    const point = options.world((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    if (point) options.order(event.button, point); else options.message('该位置无法设定海面指令');
  };
  const mapOrder = (event: PointerEvent) => {
    if (!options.isBattle() || (event.button !== 0 && event.button !== 2)) return;
    const rect = options.map.getBoundingClientRect(), scale = options.scale();
    options.order(event.button, { x: ((event.clientX - rect.left) / rect.width * 220 - 110) * scale,
      y: 0.5, z: ((event.clientY - rect.top) / rect.height * 150 - 75) * scale });
  };
  const context = (event: MouseEvent) => { if (options.isBattle()) event.preventDefault(); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerdown', clear);
  window.addEventListener('pointerout', out); window.addEventListener('blur', clear);
  options.canvas.addEventListener('pointerdown', order); options.map.addEventListener('pointerdown', mapOrder);
  for (const surface of [options.canvas, options.map]) surface.addEventListener('contextmenu', context);
  function dispose(): void {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerdown', clear);
    window.removeEventListener('pointerout', out); window.removeEventListener('blur', clear);
    options.canvas.removeEventListener('pointerdown', order); options.map.removeEventListener('pointerdown', mapOrder);
    for (const surface of [options.canvas, options.map]) surface.removeEventListener('contextmenu', context);
  }
  return { read: () => pointer, clear, dispose };
}
