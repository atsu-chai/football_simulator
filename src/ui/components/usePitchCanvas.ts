import { useEffect, useRef, useState } from 'react';
import { makeView, View, viewHeightFor } from '../../render/pitch';

/** 親要素の幅に合わせてキャンバスを調整する。縦長の画面ではピッチを縦向きにする。 */
export function usePitchCanvas(maxHeight?: number) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      if (!w) return;
      const portrait = window.innerWidth < 620;
      let h = viewHeightFor(w, portrait);
      if (maxHeight && !portrait) h = Math.min(h, maxHeight);
      const c = canvas.current!;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      c.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const v = makeView(w, h);
      viewRef.current = v;
      setView(v);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxHeight]);

  return { holder, canvas, view, viewRef };
}
