import { useEffect, useState } from "react";

interface PreviewState {
  src: string;
  x: number;
  y: number;
}

type ShowFn = (src: string, x: number, y: number) => void;
type HideFn = () => void;

let globalShow: ShowFn = () => {};
let globalHide: HideFn = () => {};

export function showPreview(src: string, x: number, y: number) {
  globalShow(src, x, y);
}

export function hidePreview() {
  globalHide();
}

export function HoverPreview() {
  const [preview, setPreview] = useState<PreviewState | null>(null);

  useEffect(() => {
    globalShow = (src, x, y) => setPreview({ src, x, y });
    globalHide = () => setPreview(null);
    return () => {
      globalShow = () => {};
      globalHide = () => {};
    };
  }, []);

  if (!preview) return null;

  const w = 320;
  const h = 447;
  const pad = 16;
  let left = preview.x + pad;
  let top = preview.y - h / 2;

  if (left + w > window.innerWidth) left = preview.x - w - pad;
  if (top < pad) top = pad;
  if (top + h > window.innerHeight - pad) top = window.innerHeight - pad - h;

  return (
    <div
      className="fixed z-50 pointer-events-none rounded-lg overflow-hidden shadow-2xl"
      style={{ left, top, width: w, height: h }}
    >
      <img src={preview.src} alt="" className="w-full h-full object-cover" />
    </div>
  );
}
