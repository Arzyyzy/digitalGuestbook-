/**
 * EnhancedCanvas.tsx — XHB/Xibo Signage Edition
 *
 * Prinsip utama untuk XHB custom mainboard player:
 *  - ZERO CSS transform / scale / translate
 *  - Canvas size dari offsetWidth/offsetHeight (bukan getBoundingClientRect)
 *    karena XHB sering fake viewport di getBoundingClientRect
 *  - touch-action: none di SEMUA elemen, injected di level document juga
 *  - Triple event: touchstart + pointerdown + mousedown, deduplicated
 *  - position: fixed untuk toolbar (bukan absolute di dalam wrapper)
 *  - Tidak ada backdrop-filter, grid, conic-gradient, vh
 */

import {
  useRef, useEffect, useState, useCallback,
  forwardRef, useImperativeHandle,
} from 'react';
import { createPortal } from 'react-dom';
import { Pen, Eraser, Undo2, Trash2, Send, ChevronLeft, ChevronRight } from 'lucide-react';
import { EventType } from '../contexts/GuestbookContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool = 'pen' | 'eraser';

export interface EnhancedCanvasHandle {
  reset: () => void;
  isEmpty: () => boolean;
  getImageData: () => string;
}

interface EnhancedCanvasProps {
  theme?: EventType;
  frameUrl?: string | null;
  onSubmit: (imageData: string) => void;
  isEnded?: boolean;
  variant?: 'kiosk' | 'display';
  onDrawStart?: () => void;
  onUserActivity?: () => void;
  onClear?: () => void;
  className?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SIZES: { value: number; label: string }[] = [
  { value: 2,  label: 'XS' },
  { value: 5,  label: 'S'  },
  { value: 9,  label: 'M'  },
  { value: 15, label: 'L'  },
];

const COLORS = [
  '#1a0a00', '#2C1810', '#722F37', '#1e3a8a',
  '#2D5A27', '#4C1D95', '#C9A84C', '#4B5563',
];

const THEME = {
  wedding:    { accent: '#D4AF37', bg: '#FFFEF9', hint: 'Tulis pesan & nama Anda di sini…',   submit: 'Kirim Ucapan', ink: '#2C1810' },
  graduation: { accent: '#1e3a8a', bg: '#FAFCFF', hint: 'Tulis ucapan wisuda Anda di sini…',  submit: 'Kirim Ucapan', ink: '#1e3a8a' },
  corporate:  { accent: '#334155', bg: '#FAFAFA', hint: 'Tulis pesan korporat Anda di sini…', submit: 'Kirim Pesan',  ink: '#1f2937' },
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export const EnhancedCanvas = forwardRef<EnhancedCanvasHandle, EnhancedCanvasProps>(
  ({
    theme = 'wedding',
    frameUrl = null,
    onSubmit,
    isEnded = false,
    variant = 'kiosk',
    onDrawStart,
    onUserActivity,
    onClear,
    className = '',
  }, ref) => {

    const cfg      = THEME[theme];
    const isKiosk  = variant === 'kiosk';

    // Refs
    const canvasRef       = useRef<HTMLCanvasElement>(null);
    const wrapperRef      = useRef<HTMLDivElement>(null);
    const ctxRef          = useRef<CanvasRenderingContext2D | null>(null);
    const isDrawingRef    = useRef(false);
    const lastPosRef      = useRef<{ x: number; y: number } | null>(null);
    const pointerActiveRef = useRef(false); // deduplicate touch vs pointer
    const toolbarIdleTimer = useRef<number | null>(null);

    // State
    const [ready,            setReady]            = useState(false);
    const [tool,             setTool]             = useState<Tool>('pen');
    const [brushSize,        setBrushSize]        = useState(5);
    const [color,            setColor]            = useState(cfg.ink);
    const [history,          setHistory]          = useState<ImageData[]>([]);
    const [hasContent,       setHasContent]       = useState(false);
    const [submitting,       setSubmitting]       = useState(false);
    const [showSuccess,      setShowSuccess]      = useState(false);
    const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
    const [toolbarIdle,      setToolbarIdle]      = useState(false);
    const [portalReady,      setPortalReady]      = useState(false);
    // Toolbar position — default top-left, away from frame decorations
    const [tbX, setTbX] = useState(20);
    const [tbY, setTbY] = useState(80);
    const [tbDragging, setTbDragging] = useState(false);
    const tbDragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

    useEffect(() => { setPortalReady(true); }, []);
    useEffect(() => { setColor(THEME[theme].ink); }, [theme]);

    // ── GLOBAL touch-action injection ─────────────────────────────────────────
    // XHB intercepts touch before canvas if any ancestor has default touch-action.
    // Inject at document level as the safest guarantee.
    useEffect(() => {
      const id = 'xhb-touch-fix';
      if (!document.getElementById(id)) {
        const s = document.createElement('style');
        s.id = id;
        s.textContent = `
          *, *::before, *::after { -ms-touch-action: none !important; touch-action: none !important; }
          html, body, #root { overflow: hidden !important; width: 100% !important; height: 100% !important; }
        `;
        document.head.appendChild(s);
      }
      return () => document.getElementById(id)?.remove();
    }, []);

    // ── Canvas init ────────────────────────────────────────────────────────────
    // Use offsetWidth/offsetHeight — XHB often returns 0 from getBoundingClientRect
    const initCanvas = useCallback(() => {
      const canvas  = canvasRef.current;
      const wrapper = wrapperRef.current;
      if (!canvas || !wrapper) return false;

      // XHB fix: prefer offsetWidth over getBoundingClientRect
      let w = wrapper.offsetWidth;
      let h = wrapper.offsetHeight;

      // Last resort fallback
      if (!w || !h) {
        w = window.innerWidth;
        h = window.innerHeight;
        console.warn('[Canvas] offsetWidth=0, using window dims:', w, h);
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x for perf
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width  = w + 'px';
      canvas.style.height = h + 'px';

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { console.error('[Canvas] No 2D context'); return false; }
      ctxRef.current = ctx;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';

      if (isKiosk) {
        ctx.clearRect(0, 0, w, h);
      } else {
        ctx.fillStyle = cfg.bg;
        ctx.fillRect(0, 0, w, h);
      }

      console.log('[Canvas] Init OK:', w + 'x' + h, '@ DPR', dpr);
      return true;
    }, [cfg.bg, isKiosk]);

    useEffect(() => {
      if (initCanvas()) { setReady(true); return; }

      // Retry with ResizeObserver (XHB sometimes needs a frame to lay out)
      let alive = true;
      const ro = new ResizeObserver(() => {
        if (!alive) return;
        if (initCanvas()) { setReady(true); alive = false; ro.disconnect(); }
      });
      if (wrapperRef.current) ro.observe(wrapperRef.current);

      // Hard timeout fallback — 800ms after mount
      const tid = setTimeout(() => {
        if (!alive) return;
        if (initCanvas()) { setReady(true); }
        alive = false;
        ro.disconnect();
      }, 800);

      return () => { alive = false; clearTimeout(tid); ro.disconnect(); };
    }, [initCanvas]);

    // ── Tool application ───────────────────────────────────────────────────────
    const applyTool = useCallback(() => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = isKiosk ? 'destination-out' : 'source-over';
        ctx.strokeStyle = isKiosk ? 'rgba(0,0,0,1)' : cfg.bg;
        ctx.lineWidth   = brushSize * 3;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
        ctx.lineWidth   = brushSize;
      }
    }, [tool, color, brushSize, cfg.bg, isKiosk]);
    const applyToolRef = useRef(applyTool);
    useEffect(() => { applyToolRef.current = applyTool; }, [applyTool]);

    // ── Toolbar idle ───────────────────────────────────────────────────────────
    const resetToolbarIdle = useCallback(() => {
      setToolbarIdle(false);
      if (toolbarIdleTimer.current) clearTimeout(toolbarIdleTimer.current);
      toolbarIdleTimer.current = window.setTimeout(() => setToolbarIdle(true), 8000);
    }, []);
    useEffect(() => () => { if (toolbarIdleTimer.current) clearTimeout(toolbarIdleTimer.current); }, []);

    const signalActivity = useCallback(() => {
      onUserActivity?.();
      resetToolbarIdle();
    }, [onUserActivity, resetToolbarIdle]);

    // ── Position helper ───────────────────────────────────────────────────────
    // XHB sometimes has coordinate offset when transforms exist on ancestors.
    // We read canvas.getBoundingClientRect only for coordinate mapping (not sizing).
    const getPos = (e: Event, canvas: HTMLCanvasElement): { x: number; y: number } | null => {
      // Use offsetLeft/offsetTop for XHB coordinate offset fix
      const rect = canvas.getBoundingClientRect();

      if ('touches' in e) {
        const te = e as TouchEvent;
        const t  = te.touches[0] ?? te.changedTouches?.[0];
        if (!t) return null;
        return { x: t.clientX - rect.left, y: t.clientY - rect.top };
      }
      const pe = e as PointerEvent | MouseEvent;
      return { x: pe.clientX - rect.left, y: pe.clientY - rect.top };
    };

    // ── Native event listeners ────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !ready) return;

      // Explicitly set on the element too (belt & suspenders)
      canvas.style.touchAction    = 'none';
      canvas.style.userSelect     = 'none';
      (canvas.style as any).webkitUserSelect = 'none';
      (canvas.style as any).msTouchAction   = 'none';

      const onStart = (e: Event) => {
        if (e.cancelable) e.preventDefault();
        if (!ctxRef.current || isEnded) return;
        const pos = getPos(e, canvas);
        if (!pos) return;

        const snap = ctxRef.current.getImageData(0, 0, canvas.width, canvas.height);
        setHistory(prev => [...prev.slice(-19), snap]);
        applyToolRef.current();
        ctxRef.current.beginPath();
        ctxRef.current.moveTo(pos.x, pos.y);
        isDrawingRef.current = true;
        lastPosRef.current   = pos;
        if (!hasContent) { setHasContent(true); onDrawStart?.(); }
        signalActivity();
        console.log('[Canvas] START', pos.x.toFixed(0), pos.y.toFixed(0));
      };

      const onMove = (e: Event) => {
        if (e.cancelable) e.preventDefault();
        if (!isDrawingRef.current || !ctxRef.current) return;
        const pos = getPos(e, canvas);
        if (!pos) return;
        // Skip identical coords (XHB duplicate events)
        if (lastPosRef.current) {
          if (Math.abs(pos.x - lastPosRef.current.x) < 0.5 &&
              Math.abs(pos.y - lastPosRef.current.y) < 0.5) return;
        }
        ctxRef.current.lineTo(pos.x, pos.y);
        ctxRef.current.stroke();
        lastPosRef.current = pos;
        signalActivity();
      };

      const onEnd = (e: Event) => {
        if (e.cancelable) e.preventDefault();
        ctxRef.current?.closePath();
        isDrawingRef.current = false;
        lastPosRef.current   = null;
        setTimeout(() => { pointerActiveRef.current = false; }, 50);
      };

      // Pointer capture — keeps pointermove firing even when finger leaves canvas
      const onPointerDown = (e: Event) => {
        pointerActiveRef.current = true;
        try { canvas.setPointerCapture((e as PointerEvent).pointerId); } catch {}
        onStart(e);
      };

      // Touch (XHB older / Android WebView)
      const onTouchStart = (e: Event) => { if (!pointerActiveRef.current) onStart(e); };
      const onTouchMove  = (e: Event) => { if (!pointerActiveRef.current) onMove(e); };
      const onTouchEnd   = (e: Event) => { if (!pointerActiveRef.current) onEnd(e); };

      const opts: AddEventListenerOptions = { passive: false };

      canvas.addEventListener('touchstart',   onTouchStart, opts);
      canvas.addEventListener('touchmove',    onTouchMove,  opts);
      canvas.addEventListener('touchend',     onTouchEnd,   opts);
      canvas.addEventListener('touchcancel',  onTouchEnd,   opts);

      canvas.addEventListener('pointerdown',  onPointerDown,  opts);
      canvas.addEventListener('pointermove',  onMove as EventListener, opts);
      canvas.addEventListener('pointerup',    onEnd  as EventListener, opts);
      canvas.addEventListener('pointerleave', onEnd  as EventListener, opts);
      canvas.addEventListener('pointercancel',onEnd  as EventListener, opts);

      // Mouse fallback
      canvas.addEventListener('mousedown',  onStart as EventListener);
      canvas.addEventListener('mousemove',  onMove  as EventListener);
      canvas.addEventListener('mouseup',    onEnd   as EventListener);
      canvas.addEventListener('mouseleave', onEnd   as EventListener);

      return () => {
        canvas.removeEventListener('touchstart',   onTouchStart);
        canvas.removeEventListener('touchmove',    onTouchMove);
        canvas.removeEventListener('touchend',     onTouchEnd);
        canvas.removeEventListener('touchcancel',  onTouchEnd);
        canvas.removeEventListener('pointerdown',  onPointerDown);
        canvas.removeEventListener('pointermove',  onMove as EventListener);
        canvas.removeEventListener('pointerup',    onEnd  as EventListener);
        canvas.removeEventListener('pointerleave', onEnd  as EventListener);
        canvas.removeEventListener('pointercancel',onEnd  as EventListener);
        canvas.removeEventListener('mousedown',    onStart as EventListener);
        canvas.removeEventListener('mousemove',    onMove  as EventListener);
        canvas.removeEventListener('mouseup',      onEnd   as EventListener);
        canvas.removeEventListener('mouseleave',   onEnd   as EventListener);
      };
    }, [ready, isEnded, hasContent, onDrawStart, signalActivity]);

    // ── Canvas ops ─────────────────────────────────────────────────────────────
    const clearCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx    = ctxRef.current;
      if (!canvas || !ctx) return;
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      if (isKiosk) { ctx.clearRect(0, 0, w, h); }
      else         { ctx.fillStyle = cfg.bg; ctx.fillRect(0, 0, w, h); }
      setHistory([]);
      setHasContent(false);
      onClear?.();
      signalActivity();
    }, [cfg.bg, isKiosk, onClear, signalActivity]);

    const undo = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx    = ctxRef.current;
      if (!canvas || !ctx || history.length === 0) return;
      ctx.putImageData(history[history.length - 1], 0, 0);
      setHistory(prev => prev.slice(0, -1));
      if (history.length <= 1) { setHasContent(false); onClear?.(); }
    }, [history, onClear]);

    const isCanvasEmpty = useCallback((): boolean => {
      const canvas = canvasRef.current;
      const ctx    = ctxRef.current;
      if (!canvas || !ctx || !ready) return true;
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      if (isKiosk) {
        for (let i = 3; i < d.length; i += 4) if (d[i] > 5) return false;
        return true;
      }
      // non-kiosk: compare against bg colour
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = 1;
      const tc = tmp.getContext('2d')!;
      tc.fillStyle = cfg.bg; tc.fillRect(0, 0, 1, 1);
      const [r, g, b] = tc.getImageData(0, 0, 1, 1).data;
      for (let i = 0; i < d.length; i += 4)
        if (Math.abs(d[i]-r)>5 || Math.abs(d[i+1]-g)>5 || Math.abs(d[i+2]-b)>5) return false;
      return true;
    }, [ready, cfg.bg, isKiosk]);

    const getComposite = useCallback(async (): Promise<string> => {
      const canvas = canvasRef.current;
      if (!canvas) return '';
      if (!frameUrl) return canvas.toDataURL('image/png');
      const c = document.createElement('canvas');
      c.width = canvas.width; c.height = canvas.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0);
      try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image(); i.crossOrigin = 'anonymous';
          i.onload = () => res(i); i.onerror = rej; i.src = frameUrl;
        });
        ctx.drawImage(img, 0, 0, c.width, c.height);
      } catch {}
      return c.toDataURL('image/png');
    }, [frameUrl]);

    const handleSubmit = useCallback(async () => {
      if (submitting || isEnded || isCanvasEmpty()) return;
      setSubmitting(true);
      const data = await getComposite();
      onSubmit(data);
      setShowSuccess(true);
      setTimeout(async () => { clearCanvas(); setShowSuccess(false); setSubmitting(false); }, 2500);
    }, [submitting, isEnded, isCanvasEmpty, getComposite, onSubmit, clearCanvas]);

    useImperativeHandle(ref, () => ({
      reset: clearCanvas,
      isEmpty: isCanvasEmpty,
      getImageData: () => canvasRef.current?.toDataURL('image/png') ?? '',
    }), [clearCanvas, isCanvasEmpty]);

    // ── Toolbar drag ──────────────────────────────────────────────────────────
    const onTbMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('button,input,label')) return;
      tbDragRef.current = { sx: e.clientX, sy: e.clientY, ox: tbX, oy: tbY };
      setTbDragging(true);
    }, [tbX, tbY]);

    useEffect(() => {
      if (!tbDragging || !tbDragRef.current) return;
      const mm = (e: MouseEvent) => {
        if (!tbDragRef.current) return;
        setTbX(Math.max(0, Math.min(tbDragRef.current.ox + e.clientX - tbDragRef.current.sx, window.innerWidth  - 260)));
        setTbY(Math.max(0, Math.min(tbDragRef.current.oy + e.clientY - tbDragRef.current.sy, window.innerHeight - 100)));
      };
      const mu = () => { setTbDragging(false); tbDragRef.current = null; };
      window.addEventListener('mousemove', mm);
      window.addEventListener('mouseup',   mu);
      return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
    }, [tbDragging]);

    // ── Toolbar UI ────────────────────────────────────────────────────────────
    const btnBase: React.CSSProperties = {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: 'none', cursor: 'pointer', touchAction: 'none',
    };

    const toolbar = (
      <div
        onMouseDown={onTbMouseDown}
        style={{
          position:   'fixed',
          top:        tbY,
          left:       tbX,
          zIndex:     9999,
          width:      248,
          touchAction:'none',
          opacity:    toolbarIdle ? 0.55 : 1,
          transition: tbDragging ? 'none' : 'opacity 0.4s',
          cursor:     tbDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        {toolbarCollapsed ? (
          <button
            type="button"
            onClick={() => setToolbarCollapsed(false)}
            style={{
              ...btnBase, width: 48, height: 48, borderRadius: 14,
              background: 'rgba(15,10,0,0.9)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            <ChevronRight style={{ width: 18, height: 18 }} />
          </button>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 10, padding: 12,
            borderRadius: 18, background: 'rgba(15,10,0,0.92)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}>
            {/* Colors */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COLORS.map(c => (
                <button key={c} type="button"
                  onClick={() => { setColor(c); setTool('pen'); signalActivity(); }}
                  style={{
                    ...btnBase, width: 30, height: 30, borderRadius: '50%', background: c,
                    border: color === c && tool === 'pen' ? '2.5px solid #fff' : '1.5px solid rgba(255,255,255,0.2)',
                    boxShadow: color === c && tool === 'pen' ? `0 0 0 1.5px ${c}` : 'none',
                  }}
                />
              ))}
              <label style={{
                position: 'relative', display: 'inline-flex',
                width: 30, height: 30, borderRadius: '50%', background: color,
                border: '1.5px solid rgba(255,255,255,0.25)', cursor: 'pointer',
                overflow: 'hidden', touchAction: 'none',
              }}>
                <input type="color" value={color}
                  onChange={e => { setColor(e.target.value); setTool('pen'); signalActivity(); }}
                  style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                />
              </label>
            </div>

            {/* Pen / Eraser */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {([['pen', Pen, 'Pena'], ['eraser', Eraser, 'Penghapus']] as const).map(([t, Icon, label]) => (
                <button key={t} type="button" onClick={() => { setTool(t); signalActivity(); }} aria-label={label}
                  style={{
                    ...btnBase, width: 38, height: 38, borderRadius: 12,
                    background: tool === t ? '#fff' : 'rgba(255,255,255,0.12)',
                    color:      tool === t ? '#111' : 'rgba(255,255,255,0.8)',
                    boxShadow:  tool === t ? '0 2px 8px rgba(0,0,0,0.25)' : 'none',
                  }}
                >
                  <Icon style={{ width: 16, height: 16 }} />
                </button>
              ))}
            </div>

            {/* Brush sizes */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {SIZES.map(s => (
                <button key={s.value} type="button" onClick={() => { setBrushSize(s.value); signalActivity(); }}
                  aria-label={'Ukuran ' + s.label}
                  style={{
                    ...btnBase, width: 34, height: 34, borderRadius: '50%',
                    background: brushSize === s.value ? '#fff' : 'rgba(255,255,255,0.12)',
                    border: brushSize === s.value ? 'none' : '1.5px solid rgba(255,255,255,0.2)',
                  }}
                >
                  <span style={{
                    display: 'block', borderRadius: '50%',
                    width:  Math.min(s.value * 1.4 + 4, 18),
                    height: Math.min(s.value * 1.4 + 4, 18),
                    background: brushSize === s.value ? '#111' : '#fff',
                  }} />
                </button>
              ))}
            </div>

            {/* Undo / Clear */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {([
                [undo,       Undo2,  'Undo',        history.length === 0],
                [clearCanvas, Trash2, 'Hapus semua', false],
              ] as [() => void, any, string, boolean][]).map(([fn, Icon, label, dis]) => (
                <button key={label} type="button" onClick={fn} disabled={dis} aria-label={label}
                  style={{
                    ...btnBase, width: 38, height: 38, borderRadius: 12,
                    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.85)',
                    opacity: dis ? 0.35 : 1, cursor: dis ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Icon style={{ width: 16, height: 16 }} />
                </button>
              ))}
            </div>

            {/* Submit */}
            <button type="button" onClick={handleSubmit}
              disabled={!hasContent || submitting || isEnded}
              style={{
                ...btnBase, gap: 6, height: 42, borderRadius: 20, padding: '0 16px',
                background: 'linear-gradient(135deg,#D4AF37,#F4D03F)',
                color: '#1a0e00', fontWeight: 700, fontSize: 13,
                whiteSpace: 'nowrap', width: '100%',
                opacity: !hasContent || submitting || isEnded ? 0.35 : 1,
                cursor:  !hasContent || submitting || isEnded ? 'not-allowed' : 'pointer',
                boxShadow: '0 3px 12px rgba(212,175,55,0.4)',
              }}
            >
              <Send style={{ width: 14, height: 14 }} />
              {submitting ? 'Mengirim…' : cfg.submit}
            </button>

            {/* Collapse */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setToolbarCollapsed(true)} aria-label="Sembunyikan"
                style={{
                  ...btnBase, width: 34, height: 34, borderRadius: 10,
                  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.65)',
                }}
              >
                <ChevronLeft style={{ width: 15, height: 15 }} />
              </button>
            </div>
          </div>
        )}
      </div>
    );

    // ── Render ────────────────────────────────────────────────────────────────
    return (
      <div
        className={className}
        style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
      >
        {/* Canvas wrapper — offsetWidth/offsetHeight source of truth */}
        <div
          ref={wrapperRef}
          style={{
            position:    'absolute',
            inset:       0,
            overflow:    'hidden',
            touchAction: 'none',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              display:      'block',
              // width/height set programmatically by initCanvas
              background:   isKiosk ? 'transparent' : cfg.bg,
              touchAction:  'none',
              pointerEvents:'auto',
              userSelect:   'none',
              cursor:       isEnded ? 'not-allowed' : tool === 'eraser' ? 'cell' : 'crosshair',
            }}
          />

          {/* Hint */}
          {!hasContent && (
            <div style={{
              position: 'absolute', top: 16, left: 20,
              fontSize: 14, fontStyle: 'italic', fontFamily: 'serif',
              color: 'rgba(180,155,100,0.55)',
              pointerEvents: 'none', userSelect: 'none',
            }}>
              {cfg.hint}
            </div>
          )}

          {/* Ended overlay */}
          {isEnded && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ textAlign: 'center', color: '#fff' }}>
                <div style={{ fontSize: 42, marginBottom: 8 }}>🎊</div>
                <p style={{ fontSize: 18, fontFamily: 'serif', margin: 0 }}>Acara Telah Selesai</p>
                <p style={{ fontSize: 13, margin: '4px 0 0', opacity: 0.65 }}>Terima kasih atas partisipasi Anda</p>
              </div>
            </div>
          )}

          {/* Success flash */}
          {showSuccess && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(212,175,55,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>✨</div>
                <p style={{ fontSize: 18, fontFamily: 'serif', color: '#2C1810', margin: 0 }}>Ucapan Terkirim!</p>
              </div>
            </div>
          )}
        </div>

        {/* Kiosk toolbar via portal */}
        {!isEnded && variant === 'kiosk' && portalReady
          ? createPortal(toolbar, document.body)
          : !isEnded && variant === 'kiosk' && toolbar}
      </div>
    );
  }
);

EnhancedCanvas.displayName = 'EnhancedCanvas';