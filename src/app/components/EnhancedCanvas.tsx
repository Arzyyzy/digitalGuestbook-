import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Pen, Eraser, Undo2, Trash2, Send } from 'lucide-react';
import { EventType } from '../contexts/GuestbookContext';

type Tool = 'pen' | 'eraser';

const SIZES = [
  { value: 2,  label: 'XS' },
  { value: 5,  label: 'S'  },
  { value: 9,  label: 'M'  },
  { value: 15, label: 'L'  },
];

const COLORS = [
  '#1a0a00',
  '#2C1810',
  '#722F37',
  '#1e3a8a',
  '#2D5A27',
  '#4C1D95',
  '#C9A84C',
  '#4B5563',
];

const THEME_CFG = {
  wedding: {
    borderColor: 'rgba(212,175,55,0.55)',
    glowColor:   'rgba(212,175,55,0.35)',
    btnGrad:     'linear-gradient(135deg,#D4AF37 0%,#F4D03F 100%)',
    btnShadow:   '0 4px 24px rgba(212,175,55,0.55)',
    defaultColor:'#2C1810',
    canvasBg:    '#FFFEF9',
    hint:        'Tulis pesan & nama Anda di sini…',
    submitLabel: 'Kirim Ucapan',
  },
  graduation: {
    borderColor: 'rgba(59,130,246,0.55)',
    glowColor:   'rgba(59,130,246,0.3)',
    btnGrad:     'linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%)',
    btnShadow:   '0 4px 24px rgba(30,58,138,0.55)',
    defaultColor:'#1e3a8a',
    canvasBg:    '#FAFCFF',
    hint:        'Tulis ucapan wisuda Anda di sini…',
    submitLabel: 'Kirim Ucapan',
  },
  corporate: {
    borderColor: 'rgba(100,200,255,0.45)',
    glowColor:   'rgba(100,200,255,0.25)',
    btnGrad:     'linear-gradient(135deg,#1e293b 0%,#334155 100%)',
    btnShadow:   '0 4px 24px rgba(100,200,255,0.35)',
    defaultColor:'#1f2937',
    canvasBg:    '#FAFAFA',
    hint:        'Tulis pesan korporat Anda di sini…',
    submitLabel: 'Kirim Pesan',
  },
} as const;

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
    const canvasRef           = useRef<HTMLCanvasElement>(null);
    const ctxRef              = useRef<CanvasRenderingContext2D | null>(null);
    const [canvasReady,       setCanvasReady]       = useState(false);
    const isDrawingRef        = useRef(false);
    const [history,           setHistory]           = useState<ImageData[]>([]);
    const [tool,              setTool]              = useState<Tool>('pen');
    const [brushSize,         setBrushSize]         = useState(5);
    const [color,             setColor]             = useState<string>(THEME_CFG[theme].defaultColor);
    const [canvasOpacity,     setCanvasOpacity]     = useState(1);
    const [isSubmitting,      setIsSubmitting]      = useState(false);
    const [showSuccess,       setShowSuccess]       = useState(false);
    const [hasContent,        setHasContent]        = useState(false);
    const [toolbarCollapsed,  setToolbarCollapsed]  = useState(false);
    const [toolbarIdle,       setToolbarIdle]       = useState(false);
    const [portalReady,       setPortalReady]       = useState(false);
    const [toolbarX,          setToolbarX]          = useState(20);
    const [toolbarY,          setToolbarY]          = useState(80);
    const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
    const toolbarIdleRef  = useRef<number | null>(null);
    const toolbarDragRef  = useRef<{ startX: number; startY: number; startToolbarX: number; startToolbarY: number } | null>(null);
    // ── FIX #1: Track last pointer position for Xibo pointer event coalescing ──
    const lastPosRef      = useRef<{ x: number; y: number } | null>(null);

    const cfg      = THEME_CFG[theme];
    const isKiosk  = variant === 'kiosk';
    const isDisplay = variant === 'display';

    useEffect(() => { setPortalReady(true); }, []);
    useEffect(() => { setColor(THEME_CFG[theme].defaultColor); }, [theme]);

    // ── Canvas init ──────────────────────────────────────────────────────────
    const initCanvas = useCallback((canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, forceWindowDims?: boolean): boolean => {
      let rect = canvas.getBoundingClientRect();

      if ((rect.width === 0 || rect.height === 0) && !forceWindowDims) {
        console.warn('[Canvas] getBoundingClientRect returned 0 dims, skipping init');
        return false;
      }

      if (forceWindowDims || rect.width === 0 || rect.height === 0) {
        console.log('[Canvas] Using window dimensions fallback');
        rect = {
          width: window.innerWidth, height: window.innerHeight,
          top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth,
          x: 0, y: 0, toJSON: () => ({}),
        };
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.round(rect.width  * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      canvas.style.width  = rect.width  + 'px';
      canvas.style.height = rect.height + 'px';

      if (isKiosk) {
        ctx.clearRect(0, 0, rect.width, rect.height);
      } else {
        ctx.fillStyle = cfg.canvasBg;
        ctx.fillRect(0, 0, rect.width, rect.height);
      }
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';
      console.log('[Canvas] Initialized: ' + rect.width + 'x' + rect.height + ' @ ' + dpr + 'x DPR');
      return true;
    }, [cfg.canvasBg, isKiosk]);

    const refreshToolbarIdle = useCallback(() => {
      setToolbarIdle(false);
      if (toolbarIdleRef.current) window.clearTimeout(toolbarIdleRef.current);
      toolbarIdleRef.current = window.setTimeout(() => setToolbarIdle(true), 8000);
    }, []);

    const signalActivity = useCallback(() => {
      onUserActivity?.();
      refreshToolbarIdle();
    }, [onUserActivity, refreshToolbarIdle]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { console.error('[Canvas] Failed to get 2D context'); return; }
      ctxRef.current = ctx;

      if (initCanvas(canvas, ctx)) { setCanvasReady(true); refreshToolbarIdle(); return; }

      let active = true;
      const ro = new ResizeObserver(() => {
        if (!active) return;
        if (initCanvas(canvas, ctx)) {
          setCanvasReady(true); setHistory([]); refreshToolbarIdle();
          active = false; ro.disconnect();
        }
      });
      ro.observe(canvas);

      const tid = setTimeout(() => {
        if (active) {
          if (initCanvas(canvas, ctx, true)) {
            setCanvasReady(true); setHistory([]); refreshToolbarIdle();
            active = false; ro.disconnect();
          }
        }
      }, 500);

      return () => { active = false; clearTimeout(tid); ro.disconnect(); };
    }, [theme, initCanvas, refreshToolbarIdle]);

    useEffect(() => {
      return () => { if (toolbarIdleRef.current) window.clearTimeout(toolbarIdleRef.current); };
    }, []);

    // ── Tool settings ────────────────────────────────────────────────────────
    const applyToolSettings = useCallback(() => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (tool === 'eraser') {
        if (isKiosk) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = cfg.canvasBg;
        }
        ctx.lineWidth = brushSize * 3;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
        ctx.lineWidth   = brushSize;
      }
    }, [tool, color, brushSize, cfg.canvasBg, isKiosk]);

    const applyToolSettingsRef = useRef(applyToolSettings);
    useEffect(() => { applyToolSettingsRef.current = applyToolSettings; }, [applyToolSettings]);

    // ── FIX #2: Native event listeners – the core Xibo fix ──────────────────
    //
    // ROOT CAUSE kenapa drawing tidak bekerja di Xibo:
    //
    // 1. touch-action CSS — Xibo/WebView intercept touch sebelum sampai ke canvas
    //    jika touch-action tidak di-set ke 'none' di SEMUA ancestor. Solusi:
    //    inject style global yang memaksa touch-action: none di html/body/root.
    //
    // 2. Pointer events vs Touch events — Xibo lama (Chromium < 70) hanya
    //    trigger TouchEvent, tidak PointerEvent. Solusi: daftarkan keduanya,
    //    tapi jika ada pointerdown, batalkan touchstart handler agar tidak
    //    double-fire. Deteksi lewat `window._xiboPointerActive`.
    //
    // 3. passive: false wajib untuk e.preventDefault() — tanpa ini browser
    //    modern memblock preventDefault() di touchmove dan scroll terjadi.
    //
    useEffect(() => {
      // ── GLOBAL STYLE INJECTION ──────────────────────────────────────────
      // Paksa touch-action: none di semua level agar Xibo tidak intercept
      const styleEl = document.createElement('style');
      styleEl.id = 'xibo-canvas-fix';
      styleEl.textContent = `
        html, body, #root { touch-action: none !important; overflow: hidden !important; }
        canvas { touch-action: none !important; }
      `;
      if (!document.getElementById('xibo-canvas-fix')) {
        document.head.appendChild(styleEl);
      }
      return () => { document.getElementById('xibo-canvas-fix')?.remove(); };
    }, []);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // ── FIX #3: canvas style wajib touch-action: none ──────────────────
      canvas.style.touchAction = 'none';
      canvas.style.userSelect  = 'none';
      (canvas.style as any).webkitUserSelect = 'none';
      (canvas.style as any).msUserSelect = 'none';

      // ── Helper: ambil koordinat dari semua event type ───────────────────
      const getPosFn = (e: Event): { x: number; y: number } | null => {
        const rect = canvas.getBoundingClientRect();
        // TouchEvent
        if ('touches' in e) {
          const te = e as TouchEvent;
          const touch = te.touches[0] ?? te.changedTouches?.[0];
          if (!touch) return null;
          return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
        }
        // PointerEvent or MouseEvent
        const pe = e as PointerEvent | MouseEvent;
        // ── FIX #4: Xibo sometimes sends pointerType='touch' but with button=0
        // Filter out hover-only pointermove (no button pressed)
        if ('pointerType' in pe && pe.type === 'pointermove' && !isDrawingRef.current) return null;
        return { x: pe.clientX - rect.left, y: pe.clientY - rect.top };
      };

      // Deteksi apakah browser support PointerEvents dengan benar
      // Xibo berbasis Chromium lama kadang punya pointer events tapi tidak reliable
      let usePointer = false;
      let useTouch   = false;
      try {
        // Test pointer event support
        if (typeof PointerEvent !== 'undefined' && window.navigator.pointerEnabled !== false) {
          usePointer = true;
        }
        if (typeof TouchEvent !== 'undefined') {
          useTouch = true;
        }
      } catch { /* ignore */ }

      console.log('[Canvas] Event strategy: pointer=' + usePointer + ' touch=' + useTouch);

      const onStart = (e: Event) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        if (!ctxRef.current || !canvasReady || isEnded) {
          console.log('[Canvas] onStart blocked: ready=' + canvasReady + ' ended=' + isEnded);
          return;
        }
        const pos = getPosFn(e);
        if (!pos) { console.warn('[Canvas] onStart: no pos'); return; }

        console.log('[Canvas] Draw START at', pos.x.toFixed(0), pos.y.toFixed(0));
        applyToolSettingsRef.current();
        const imageData = ctxRef.current.getImageData(0, 0, canvas.width, canvas.height);
        setHistory(prev => [...prev.slice(-19), imageData]);
        ctxRef.current.beginPath();
        ctxRef.current.moveTo(pos.x, pos.y);
        lastPosRef.current = pos;
        isDrawingRef.current = true;
        if (!hasContent) { setHasContent(true); onDrawStart?.(); }
        signalActivity();
      };

      const onMove = (e: Event) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        if (!isDrawingRef.current || !ctxRef.current) return;
        const pos = getPosFn(e);
        if (!pos) return;

        // ── FIX #5: Xibo kadang kirim duplicate events di koordinat sama
        // Skip jika posisi identik (toleransi 0.5px)
        if (lastPosRef.current) {
          const dx = Math.abs(pos.x - lastPosRef.current.x);
          const dy = Math.abs(pos.y - lastPosRef.current.y);
          if (dx < 0.5 && dy < 0.5) return;
        }

        ctxRef.current.lineTo(pos.x, pos.y);
        ctxRef.current.stroke();
        lastPosRef.current = pos;
        signalActivity();
      };

      const onEnd = (e: Event) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        ctxRef.current?.closePath();
        isDrawingRef.current = false;
        lastPosRef.current   = null;
      };

      // ── Daftar listeners ─────────────────────────────────────────────────
      // Strategi: daftarkan SEMUA jenis, tapi track mana yang pertama fire
      // agar tidak double-draw.

      // ── FIX #6: De-duplicate touch vs pointer events ─────────────────────
      // Xibo lama: hanya touch events
      // Xibo baru: pointer events (tapi kadang juga kirim touch sebagai fallback)
      // Solusi: track apakah pointer sudah handle event ini, kalau iya skip touch.
      let pointerHandling = false;

      const wrappedPointerStart = (e: Event) => {
        pointerHandling = true;
        onStart(e);
      };
      const wrappedPointerMove = (e: Event) => { onMove(e); };
      const wrappedPointerEnd = (e: Event) => {
        setTimeout(() => { pointerHandling = false; }, 50);
        onEnd(e);
      };

      const wrappedTouchStart = (e: Event) => { if (!pointerHandling) onStart(e); };
      const wrappedTouchMove  = (e: Event) => { if (!pointerHandling) onMove(e); };
      const wrappedTouchEnd   = (e: Event) => { if (!pointerHandling) onEnd(e); };

      const opts = { passive: false } as AddEventListenerOptions;

      // Touch events (Xibo lama / Android WebView)
      canvas.addEventListener('touchstart',  wrappedTouchStart, opts);
      canvas.addEventListener('touchmove',   wrappedTouchMove,  opts);
      canvas.addEventListener('touchend',    wrappedTouchEnd,   opts);
      canvas.addEventListener('touchcancel', wrappedTouchEnd,   opts);

      // Pointer events (Xibo baru / modern WebView)
      canvas.addEventListener('pointerdown',  wrappedPointerStart, opts);
      canvas.addEventListener('pointermove',  wrappedPointerMove,  opts);
      canvas.addEventListener('pointerup',    wrappedPointerEnd,   opts);
      canvas.addEventListener('pointerleave', wrappedPointerEnd,   opts);
      canvas.addEventListener('pointercancel', wrappedPointerEnd,  opts);

      // Mouse events (fallback terakhir)
      canvas.addEventListener('mousedown',  onStart as EventListener);
      canvas.addEventListener('mousemove',  onMove  as EventListener);
      canvas.addEventListener('mouseup',    onEnd   as EventListener);
      canvas.addEventListener('mouseleave', onEnd   as EventListener);

      // ── FIX #7: setPointerCapture agar pointermove tidak drop saat jari
      // keluar batas canvas di Xibo ────────────────────────────────────────
      const capturePointer = (e: Event) => {
        try {
          const pe = e as PointerEvent;
          if (pe.pointerId !== undefined) {
            canvas.setPointerCapture(pe.pointerId);
          }
        } catch { /* not all Xibo versions support this */ }
      };
      canvas.addEventListener('pointerdown', capturePointer);

      console.log('[Canvas] All native listeners attached');

      return () => {
        canvas.removeEventListener('touchstart',   wrappedTouchStart);
        canvas.removeEventListener('touchmove',    wrappedTouchMove);
        canvas.removeEventListener('touchend',     wrappedTouchEnd);
        canvas.removeEventListener('touchcancel',  wrappedTouchEnd);
        canvas.removeEventListener('pointerdown',  wrappedPointerStart);
        canvas.removeEventListener('pointermove',  wrappedPointerMove);
        canvas.removeEventListener('pointerup',    wrappedPointerEnd);
        canvas.removeEventListener('pointerleave', wrappedPointerEnd);
        canvas.removeEventListener('pointercancel', wrappedPointerEnd);
        canvas.removeEventListener('mousedown',    onStart as EventListener);
        canvas.removeEventListener('mousemove',    onMove  as EventListener);
        canvas.removeEventListener('mouseup',      onEnd   as EventListener);
        canvas.removeEventListener('mouseleave',   onEnd   as EventListener);
        canvas.removeEventListener('pointerdown',  capturePointer);
        console.log('[Canvas] All native listeners removed');
      };
    }, [canvasReady, hasContent, isEnded, onDrawStart, signalActivity]);

    // ── Toolbar drag ─────────────────────────────────────────────────────────
    const handleToolbarMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if ((e.target as HTMLElement).closest('input')) return;
      toolbarDragRef.current = {
        startX: e.clientX, startY: e.clientY,
        startToolbarX: toolbarX, startToolbarY: toolbarY,
      };
      setIsDraggingToolbar(true);
    }, [toolbarX, toolbarY]);

    useEffect(() => {
      if (!isDraggingToolbar || !toolbarDragRef.current) return;
      const onMM = (e: MouseEvent) => {
        if (!toolbarDragRef.current) return;
        const dx = e.clientX - toolbarDragRef.current.startX;
        const dy = e.clientY - toolbarDragRef.current.startY;
        setToolbarX(Math.max(0, Math.min(toolbarDragRef.current.startToolbarX + dx, window.innerWidth  - 260)));
        setToolbarY(Math.max(0, Math.min(toolbarDragRef.current.startToolbarY + dy, window.innerHeight - 100)));
      };
      const onMU = () => { setIsDraggingToolbar(false); toolbarDragRef.current = null; };
      window.addEventListener('mousemove', onMM);
      window.addEventListener('mouseup',   onMU);
      return () => { window.removeEventListener('mousemove', onMM); window.removeEventListener('mouseup', onMU); };
    }, [isDraggingToolbar]);

    // ── Canvas operations ────────────────────────────────────────────────────
    const clearCanvas = useCallback(() => {
      signalActivity();
      const canvas = canvasRef.current;
      const ctx    = ctxRef.current;
      if (!ctx || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (isKiosk) {
        ctx.clearRect(0, 0, rect.width, rect.height);
      } else {
        ctx.fillStyle = cfg.canvasBg;
        ctx.fillRect(0, 0, rect.width, rect.height);
      }
      setHistory([]);
      setHasContent(false);
      onClear?.();
    }, [cfg.canvasBg, onClear, signalActivity, isKiosk]);

    const undo = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx    = ctxRef.current;
      if (!ctx || !canvas || history.length === 0) return;
      ctx.putImageData(history[history.length - 1], 0, 0);
      setHistory(prev => prev.slice(0, -1));
      if (history.length <= 1) { setHasContent(false); onClear?.(); }
    }, [history, onClear]);

    const isCanvasEmpty = useCallback((): boolean => {
      const canvas = canvasRef.current;
      const ctx    = ctxRef.current;
      if (!canvas || !ctx || !canvasReady) return true;
      if (canvas.width === 0 || canvas.height === 0) return true;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      if (isKiosk) {
        for (let i = 3; i < data.length; i += 4) { if (data[i] > 5) return false; }
        return true;
      }
      const tmpC = document.createElement('canvas');
      tmpC.width = 1; tmpC.height = 1;
      const tmpCtx = tmpC.getContext('2d')!;
      tmpCtx.fillStyle = cfg.canvasBg;
      tmpCtx.fillRect(0, 0, 1, 1);
      const [bgR, bgG, bgB] = tmpCtx.getImageData(0, 0, 1, 1).data;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i]-bgR)>5 || Math.abs(data[i+1]-bgG)>5 || Math.abs(data[i+2]-bgB)>5) return false;
      }
      return true;
    }, [canvasReady, cfg.canvasBg, isKiosk]);

    const getCompositeImageData = useCallback(async (): Promise<string> => {
      const canvas = canvasRef.current;
      if (!canvas) return '';
      if (!frameUrl) return canvas.toDataURL('image/png');
      const composite = document.createElement('canvas');
      composite.width = canvas.width; composite.height = canvas.height;
      const ctx = composite.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0);
      try {
        const frameImg = await new Promise<HTMLImageElement>((res, rej) => {
          const img = new Image(); img.crossOrigin = 'anonymous';
          img.onload = () => res(img); img.onerror = rej; img.src = frameUrl;
        });
        ctx.drawImage(frameImg, 0, 0, composite.width, composite.height);
      } catch { /* frame failed, continue */ }
      return composite.toDataURL('image/png');
    }, [frameUrl]);

    const handleSubmit = useCallback(async () => {
      if (isSubmitting || isEnded) return;
      if (isCanvasEmpty()) return;
      setIsSubmitting(true);
      const imageData = await getCompositeImageData();
      onSubmit(imageData);
      setShowSuccess(true);
      setCanvasOpacity(0);
      await new Promise(r => setTimeout(r, 500));
      clearCanvas();
      setCanvasOpacity(1);
      setTimeout(() => setShowSuccess(false), 2000);
      setIsSubmitting(false);
    }, [isSubmitting, isEnded, isCanvasEmpty, getCompositeImageData, onSubmit, clearCanvas]);

    useImperativeHandle(ref, () => ({
      reset: clearCanvas,
      isEmpty: isCanvasEmpty,
      getImageData: () => canvasRef.current?.toDataURL('image/png') ?? '',
    }), [clearCanvas, isCanvasEmpty]);

    // ── Toolbar panel ────────────────────────────────────────────────────────
    const toolbarPanel = !isDisplay ? (
      <div
        onMouseDown={handleToolbarMouseDown}
        style={{
          position: 'fixed',
          top:      toolbarY,
          left:     toolbarX,
          zIndex:   10050,
          pointerEvents: 'auto',
          // ── FIX #8: Toolbar juga butuh touch-action: none ──────────────
          touchAction: 'none',
          opacity:  toolbarIdle ? 0.6 : 1,
          transition: isDraggingToolbar ? 'none' : 'opacity 0.4s',
          width:    240,
          maxWidth: 'calc(100vw - 32px)',
          cursor:   isDraggingToolbar ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        {toolbarCollapsed ? (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <button
              type="button"
              onClick={() => setToolbarCollapsed(false)}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 48, height: 48, borderRadius: 14,
                background: 'rgba(20,12,0,0.92)', border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff', cursor: 'pointer', fontSize: 15,
                // Penting: tombol juga butuh pointer events aktif
                touchAction: 'none',
              }}
              aria-label="Buka toolbar"
            >
              <ChevronRight style={{ width: 18, height: 18 }} />
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10,
              padding: '12px', borderRadius: 18,
              background: 'rgba(20,12,0,0.92)', border: '1px solid rgba(255,255,255,0.18)',
            }}
          >
            {/* Color swatches */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {COLORS.map(c => (
                <button
                  key={c} type="button"
                  onClick={() => { setColor(c); setTool('pen'); signalActivity(); }}
                  aria-label={`Warna ${c}`}
                  style={{
                    width: 30, height: 30, borderRadius: '50%', background: c,
                    border: color === c && tool === 'pen' ? '2px solid #fff' : '1.5px solid rgba(255,255,255,0.2)',
                    boxShadow: color === c && tool === 'pen' ? `0 0 0 1px ${c}` : 'none',
                    cursor: 'pointer', flexShrink: 0, touchAction: 'none',
                  }}
                />
              ))}
              <label
                title="Warna custom"
                style={{
                  position: 'relative', display: 'inline-flex',
                  width: 30, height: 30, borderRadius: '50%', background: color,
                  border: '1.5px solid rgba(255,255,255,0.25)', cursor: 'pointer',
                  overflow: 'hidden', flexShrink: 0,
                }}
              >
                <input
                  type="color" value={color}
                  onChange={e => { setColor(e.target.value); setTool('pen'); signalActivity(); }}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                />
              </label>
            </div>

            {/* Pen / Eraser toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              {[
                { t: 'pen'    as Tool, Icon: Pen,    label: 'Pena'        },
                { t: 'eraser' as Tool, Icon: Eraser, label: 'Penghapus'   },
              ].map(({ t, Icon, label }) => (
                <button
                  key={t} type="button"
                  onClick={() => { setTool(t); signalActivity(); }}
                  aria-label={label}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 38, height: 38, borderRadius: 12,
                    background: tool === t ? '#fff' : 'rgba(255,255,255,0.12)',
                    color:      tool === t ? '#111827' : 'rgba(255,255,255,0.8)',
                    border: 'none', cursor: 'pointer', touchAction: 'none',
                    boxShadow: tool === t ? '0 3px 12px rgba(0,0,0,0.2)' : 'none',
                  }}
                >
                  <Icon style={{ width: 16, height: 16 }} />
                </button>
              ))}
            </div>

            {/* Brush sizes */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              {SIZES.map(s => (
                <button
                  key={s.value} type="button"
                  onClick={() => { setBrushSize(s.value); signalActivity(); }}
                  aria-label={`Ukuran ${s.label}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 34, height: 34, borderRadius: '50%',
                    background: brushSize === s.value ? '#fff' : 'rgba(255,255,255,0.12)',
                    border: brushSize === s.value ? 'none' : '1.5px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer', touchAction: 'none',
                  }}
                >
                  <span style={{
                    display: 'block', borderRadius: '50%',
                    width:  Math.min(s.value * 1.4 + 4, 18),
                    height: Math.min(s.value * 1.4 + 4, 18),
                    background: brushSize === s.value ? '#111827' : '#fff',
                  }} />
                </button>
              ))}
            </div>

            {/* Undo / Clear / Submit */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                {[
                  { fn: undo,       Icon: Undo2,  label: 'Undo',       disabled: history.length === 0 },
                  { fn: clearCanvas, Icon: Trash2, label: 'Hapus semua', disabled: false },
                ].map(({ fn, Icon, label, disabled }) => (
                  <button
                    key={label} type="button" onClick={fn} disabled={disabled} aria-label={label}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 38, height: 38, borderRadius: 12,
                      background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)',
                      color: 'rgba(255,255,255,0.85)',
                      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1,
                      touchAction: 'none',
                    }}
                  >
                    <Icon style={{ width: 16, height: 16 }} />
                  </button>
                ))}
              </div>
              <button
                type="button" onClick={handleSubmit}
                disabled={!hasContent || isSubmitting || isEnded}
                aria-label="Kirim pesan"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  gap: 6, padding: '0 16px', height: 42, borderRadius: 20,
                  background: 'linear-gradient(135deg,#D4AF37 0%,#F4D03F 100%)',
                  border: 'none', color: '#1a0e00', fontWeight: 700, fontSize: 13,
                  cursor: !hasContent || isSubmitting || isEnded ? 'not-allowed' : 'pointer',
                  opacity: !hasContent || isSubmitting || isEnded ? 0.35 : 1,
                  boxShadow: '0 3px 14px rgba(212,175,55,0.4)',
                  whiteSpace: 'nowrap', touchAction: 'none',
                }}
              >
                <Send style={{ width: 14, height: 14 }} />
                {isSubmitting ? 'Mengirim…' : cfg.submitLabel}
              </button>
            </div>

            {/* Collapse button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button" onClick={() => setToolbarCollapsed(true)} aria-label="Sembunyikan toolbar"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 36, height: 36, borderRadius: 12,
                  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.7)', cursor: 'pointer', touchAction: 'none',
                }}
              >
                <ChevronLeft style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </div>
        )}
      </div>
    ) : null;

    return (
      <div
        className={`flex flex-col ${className}`}
        style={{ minHeight: 0, height: isKiosk ? '100%' : undefined }}
      >
        <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <motion.div
            animate={{ opacity: canvasOpacity }}
            transition={{ duration: 0.5 }}
            style={{
              position: 'absolute', inset: 0,
              borderRadius: isKiosk ? 0 : '1rem',
              overflow: 'hidden',
              // ── FIX #9: touch-action NONE di wrapper motion.div juga ────
              touchAction:   'none',
              pointerEvents: 'auto',
              boxShadow: isKiosk ? 'none' : `0 0 0 2px ${cfg.borderColor}, 0 8px 40px ${cfg.glowColor}`,
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                display: 'block', width: '100%', height: '100%',
                background: isKiosk ? 'transparent' : cfg.canvasBg,
                // ── FIX #10: CSS touch-action & pointer-events di canvas ──
                touchAction:   'none',
                pointerEvents: 'auto',
                userSelect:    'none',
                WebkitUserSelect: 'none',
                // ── FIX #11: -ms-touch-action untuk IE/Edge lama di Xibo ──
                // @ts-ignore
                msTouchAction: 'none',
                cursor: isEnded ? 'not-allowed' : tool === 'eraser' ? 'cell' : 'crosshair',
              }}
            />

            {/* Hint text */}
            <div
              className="absolute top-4 left-5 text-sm italic font-serif pointer-events-none select-none"
              style={{
                color: 'rgba(180,160,120,0.6)',
                opacity: hasContent ? 0 : 1,
                transition: 'opacity 0.3s',
              }}
            >
              {cfg.hint}
            </div>

            {/* Corner accents (non-kiosk) */}
            {theme === 'wedding' && !frameUrl && !isKiosk && (
              <>
                {['top-2 left-2 border-t border-l', 'top-2 right-2 border-t border-r',
                  'bottom-2 left-2 border-b border-l', 'bottom-2 right-2 border-b border-r'].map((cls, i) => (
                  <div key={i} className={`absolute w-5 h-5 pointer-events-none ${cls}`}
                    style={{ borderColor: 'rgba(212,175,55,0.5)' }} />
                ))}
              </>
            )}

            {/* Event ended overlay */}
            {isEnded && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl"
                style={{ background: 'rgba(0,0,0,0.6)' }}>
                <div className="text-center text-white space-y-2">
                  <div className="text-4xl">🎊</div>
                  <p className="text-lg font-serif">Acara Telah Selesai</p>
                  <p className="text-sm" style={{ opacity: 0.7 }}>Terima kasih atas partisipasi Anda</p>
                </div>
              </div>
            )}

            {/* Success flash */}
            <AnimatePresence>
              {showSuccess && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center rounded-2xl"
                  style={{ background: 'linear-gradient(135deg,rgba(212,175,55,0.15),rgba(244,208,63,0.15))' }}
                >
                  <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
                    <div className="text-5xl mb-2">✨</div>
                    <p className="text-lg font-serif" style={{ color: '#2C1810' }}>Ucapan Terkirim!</p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Kiosk toolbar via portal */}
        {toolbarPanel && (portalReady ? createPortal(toolbarPanel, document.body) : toolbarPanel)}

        {/* Display variant controls */}
        {isDisplay && !isEnded && (
          <div style={{
            position: 'fixed', top: 180, left: 180, zIndex: 10050,
            display: 'flex', flexDirection: 'column', gap: 8, padding: '10px',
            borderRadius: 18, background: 'rgba(20,12,0,0.88)',
            border: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
            touchAction: 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              {[
                { fn: undo,       Icon: Undo2,  label: 'Undo',       disabled: history.length === 0 },
                { fn: clearCanvas, Icon: Trash2, label: 'Hapus semua', disabled: false },
              ].map(({ fn, Icon, label, disabled }) => (
                <button key={label} onClick={fn} disabled={disabled}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 38, height: 38, borderRadius: 12,
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', opacity: disabled ? 0.35 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer', touchAction: 'none',
                  }}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
            <motion.button
              whileTap={{ scale: 0.94 }} onClick={handleSubmit}
              disabled={!hasContent || isSubmitting}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px',
                borderRadius: 99, fontWeight: 600, fontSize: 14,
                background: 'linear-gradient(135deg,#C9A84C 0%,#F0D080 50%,#C9A84C 100%)',
                boxShadow: '0 4px 20px rgba(201,168,76,0.5)', color: '#1a0e00',
                border: 'none', cursor: !hasContent || isSubmitting ? 'not-allowed' : 'pointer',
                opacity: !hasContent || isSubmitting ? 0.3 : 1, touchAction: 'none',
              }}
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Mengirim…' : 'Kirim Pesan'}</span>
            </motion.button>
          </div>
        )}
      </div>
    );
  }
);

EnhancedCanvas.displayName = 'EnhancedCanvas';
