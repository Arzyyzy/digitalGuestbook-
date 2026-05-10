import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Pen, Eraser, Undo2, Trash2, Send } from 'lucide-react';
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
    const canvasRef    = useRef<HTMLCanvasElement>(null);
    const ctxRef       = useRef<CanvasRenderingContext2D | null>(null);
    const [canvasReady,       setCanvasReady]       = useState(false);
    const [isDrawing,         setIsDrawing]         = useState(false);
    const isDrawingRef        = useRef(false); // FIX #1: ref avoids stale closure in touchmove
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
    const [toolbarX,          setToolbarX]          = useState(180);
    const [toolbarY,          setToolbarY]          = useState(180);
    const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
    const toolbarIdleRef = useRef<number | null>(null);
    const toolbarDragRef = useRef<{ startX: number; startY: number; startToolbarX: number; startToolbarY: number } | null>(null);

    const cfg      = THEME_CFG[theme];
    const isKiosk  = variant === 'kiosk';
    const isDisplay = variant === 'display';

    useEffect(() => { setPortalReady(true); }, []);

    useEffect(() => {
      setColor(THEME_CFG[theme].defaultColor);
    }, [theme]);

    const initCanvas = useCallback((canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, forceWindowDims?: boolean): boolean => {
      let rect = canvas.getBoundingClientRect();
      
      // Fortu/Xibo fallback: if dimensions are 0, use window dimensions
      if ((rect.width === 0 || rect.height === 0) && !forceWindowDims) {
        console.warn('[Canvas] getBoundingClientRect returned 0 dims, skipping init');
        return false;
      }
      
      // Force init with window dimensions if container is 0 (Fortu compatibility)
      if (forceWindowDims || rect.width === 0 || rect.height === 0) {
        console.log('[Canvas] Using window dimensions fallback (width=' + window.innerWidth + ', height=' + window.innerHeight + ')');
        rect = {
          width: window.innerWidth,
          height: window.innerHeight,
          top: 0,
          left: 0,
          bottom: window.innerHeight,
          right: window.innerWidth,
          x: 0,
          y: 0,
          toJSON: () => ({})
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
      if (!ctx) {
        console.error('[Canvas] Failed to get 2D context');
        return;
      }
      ctxRef.current = ctx;
      console.log('[Canvas] 2D context obtained');

      if (initCanvas(canvas, ctx)) {
        console.log('[Canvas] Initial init succeeded');
        setCanvasReady(true);
        refreshToolbarIdle();
        return;
      }

      console.log('[Canvas] Initial init failed, trying ResizeObserver or timeout fallback');
      setCanvasReady(false);
      
      let resizeObserverActive = true;
      
      const ro = new ResizeObserver(() => {
        if (!resizeObserverActive) return;
        console.log('[Canvas] ResizeObserver triggered');
        if (initCanvas(canvas, ctx)) {
          console.log('[Canvas] ResizeObserver init succeeded');
          setCanvasReady(true);
          setHistory([]);
          refreshToolbarIdle();
          resizeObserverActive = false;
          ro.disconnect();
        }
      });
      ro.observe(canvas);
      
      // Fortu fallback: Force init with window dimensions after timeout if ResizeObserver didn't work
      const timeoutId = setTimeout(() => {
        if (resizeObserverActive) {
          console.log('[Canvas] Timeout: forcing init with window dimensions');
          if (initCanvas(canvas, ctx, true)) {
            console.log('[Canvas] Forced init with window dimensions succeeded');
            setCanvasReady(true);
            setHistory([]);
            refreshToolbarIdle();
            resizeObserverActive = false;
            ro.disconnect();
          }
        }
      }, 500);
      
      return () => {
        resizeObserverActive = false;
        clearTimeout(timeoutId);
        ro.disconnect();
      };
    }, [theme, initCanvas, refreshToolbarIdle]);

    useEffect(() => {
      return () => { if (toolbarIdleRef.current) window.clearTimeout(toolbarIdleRef.current); };
    }, []);

    const handleToolbarMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      // Only drag from the toolbar container itself, not from buttons
      if ((e.target as HTMLElement).closest('button')) return;
      if ((e.target as HTMLElement).closest('input')) return;
      if ((e.target as HTMLElement).closest('label')) return;
      
      const toolbarElement = e.currentTarget;
      const rect = toolbarElement.getBoundingClientRect();
      toolbarDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startToolbarX: toolbarX,
        startToolbarY: toolbarY,
      };
      setIsDraggingToolbar(true);
      if (e.currentTarget) e.currentTarget.style.cursor = 'grabbing';
    }, [toolbarX, toolbarY]);

    useEffect(() => {
      if (!isDraggingToolbar || !toolbarDragRef.current) return;

      const handleMouseMove = (e: MouseEvent) => {
        if (!toolbarDragRef.current) return;
        const dx = e.clientX - toolbarDragRef.current.startX;
        const dy = e.clientY - toolbarDragRef.current.startY;
        
        let newX = toolbarDragRef.current.startToolbarX + dx;
        let newY = toolbarDragRef.current.startToolbarY + dy;
        
        // Clamp to screen bounds
        newX = Math.max(0, Math.min(newX, window.innerWidth - 260));
        newY = Math.max(0, Math.min(newY, window.innerHeight - 100));
        
        setToolbarX(newX);
        setToolbarY(newY);
      };

      const handleMouseUp = () => {
        setIsDraggingToolbar(false);
        toolbarDragRef.current = null;
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }, [isDraggingToolbar]);

    const getPos = (e: React.MouseEvent | React.TouchEvent | TouchEvent | MouseEvent, canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      if ('touches' in e) {
        // FIX #2: touchend has empty touches[] — use changedTouches as fallback
        const touch = e.touches[0] ?? (e as TouchEvent).changedTouches?.[0];
        if (!touch) return { x: 0, y: 0 };
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      }
      return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top };
    };

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

    // Keep a ref so the native touch useEffect below can always call the latest version
    const applyToolSettingsRef = useRef(applyToolSettings);
    useEffect(() => { applyToolSettingsRef.current = applyToolSettings; }, [applyToolSettings]);

    // SIGNAGE FIX: Native listeners dengan passive:false + support gabungan
    // mouse + touch + pointer untuk kompatibilitas Android WebView lama di Xibo/Fortu.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        console.warn('[Canvas] Native listeners: canvas not found');
        return;
      }

      // Helper ambil koordinat dari berbagai event type
      const getPosNative = (e: TouchEvent | MouseEvent | PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        if ('touches' in e) {
          const touch = e.touches[0] ?? (e as TouchEvent).changedTouches?.[0];
          if (!touch) return null;
          return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
        }
        return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top };
      };

      const onStart = (e: TouchEvent | MouseEvent | PointerEvent) => {
        if ('cancelable' in e && e.cancelable) e.preventDefault();
        if (!ctxRef.current || !canvasReady || isEnded) {
          console.log('[Canvas] onStart blocked: ctxRef=' + !!ctxRef.current + ', ready=' + canvasReady + ', ended=' + isEnded);
          return;
        }
        const pos = getPosNative(e);
        if (!pos) {
          console.warn('[Canvas] onStart: failed to get position from event');
          return;
        }
        console.log('[Canvas] Drawing started at', pos);
        applyToolSettingsRef.current();
        const imageData = ctxRef.current.getImageData(0, 0, canvas.width, canvas.height);
        setHistory(prev => [...prev.slice(-19), imageData]);
        ctxRef.current.beginPath();
        ctxRef.current.moveTo(pos.x, pos.y);
        isDrawingRef.current = true;
        setIsDrawing(true);
        if (!hasContent) { setHasContent(true); onDrawStart?.(); }
        signalActivity();
      };

      const onMove = (e: TouchEvent | MouseEvent | PointerEvent) => {
        if ('cancelable' in e && e.cancelable) e.preventDefault();
        if (!isDrawingRef.current || !ctxRef.current) return;
        const pos = getPosNative(e);
        if (!pos) return;
        ctxRef.current.lineTo(pos.x, pos.y);
        ctxRef.current.stroke();
        signalActivity();
      };

      const onEnd = (e: TouchEvent | MouseEvent | PointerEvent) => {
        if ('cancelable' in e && e.cancelable) e.preventDefault();
        ctxRef.current?.closePath();
        isDrawingRef.current = false;
        setIsDrawing(false);
      };

      console.log('[Canvas] Attaching native event listeners (touch, mouse, pointer)');

      // Touch events — untuk Android WebView lama
      canvas.addEventListener('touchstart', onStart as EventListener, { passive: false });
      canvas.addEventListener('touchmove',  onMove  as EventListener, { passive: false });
      canvas.addEventListener('touchend',   onEnd   as EventListener, { passive: false });

      // Mouse events — fallback untuk signage yang inject mouse dari touch
      canvas.addEventListener('mousedown',  onStart as EventListener);
      canvas.addEventListener('mousemove',  onMove  as EventListener);
      canvas.addEventListener('mouseup',    onEnd   as EventListener);
      canvas.addEventListener('mouseleave', onEnd   as EventListener);

      // Pointer events — untuk Android 12+ / WebView modern
      canvas.addEventListener('pointerdown',  onStart as EventListener);
      canvas.addEventListener('pointermove',  onMove  as EventListener);
      canvas.addEventListener('pointerup',    onEnd   as EventListener);
      canvas.addEventListener('pointerleave', onEnd   as EventListener);

      return () => {
        console.log('[Canvas] Removing native event listeners');
        canvas.removeEventListener('touchstart',   onStart as EventListener);
        canvas.removeEventListener('touchmove',    onMove  as EventListener);
        canvas.removeEventListener('touchend',     onEnd   as EventListener);
        canvas.removeEventListener('mousedown',    onStart as EventListener);
        canvas.removeEventListener('mousemove',    onMove  as EventListener);
        canvas.removeEventListener('mouseup',      onEnd   as EventListener);
        canvas.removeEventListener('mouseleave',   onEnd   as EventListener);
        canvas.removeEventListener('pointerdown',  onStart as EventListener);
        canvas.removeEventListener('pointermove',  onMove  as EventListener);
        canvas.removeEventListener('pointerup',    onEnd   as EventListener);
        canvas.removeEventListener('pointerleave', onEnd   as EventListener);
      };
    }, [canvasReady, hasContent, isEnded, onDrawStart, signalActivity]);

    const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      const ctx    = ctxRef.current;
      if (!ctx || !canvas || !canvasReady || isEnded) return;
      if (canvas.width === 0 || canvas.height === 0) return;

      signalActivity();
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistory(prev => [...prev.slice(-19), imageData]);

      applyToolSettings();
      const { x, y } = getPos(e, canvas);
      ctx.beginPath();
      ctx.moveTo(x, y);
      isDrawingRef.current = true; // FIX #1: set ref immediately (sync)
      setIsDrawing(true);
      if (!hasContent) {
        setHasContent(true);
        onDrawStart?.();
      }
    }, [canvasReady, isEnded, applyToolSettings, hasContent, onDrawStart, signalActivity]);

    const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawingRef.current || !ctxRef.current || !canvasRef.current) return; // FIX #1: use ref
      signalActivity();
      // NOTE: no e.preventDefault() here — React synthetic touch events are passive
      // since React 17 and cannot call preventDefault(). Native listeners handle this.
      const { x, y } = getPos(e, canvasRef.current);
      ctxRef.current.lineTo(x, y);
      ctxRef.current.stroke();
    }, [signalActivity]);

    const stopDrawing = useCallback(() => {
      ctxRef.current?.closePath();
      isDrawingRef.current = false; // FIX #1: sync ref
      setIsDrawing(false);
    }, []);

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
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 5) return false;
        }
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
      composite.width  = canvas.width;
      composite.height = canvas.height;
      const ctx = composite.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0);

      try {
        const frameImg = await new Promise<HTMLImageElement>((res, rej) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload  = () => res(img);
          img.onerror = rej;
          img.src = frameUrl;
        });
        ctx.drawImage(frameImg, 0, 0, composite.width, composite.height);
      } catch { /* frame failed, continue without */ }

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

    /* ─── TOOLBAR ─────────────────────────────────────────────────────────────
     * Rendered via portal at fixed position.
     *
     * The toolbar now sits on the left side with a small vertical layout,
     * slightly offset from the top so it stays inside the drawing area.
     * This is a compact left-side panel for kiosk mode.
     */
    const toolbarPanel = !isDisplay ? (
      <div
        onMouseDown={handleToolbarMouseDown}
        style={{
          position: 'fixed',
          top:      toolbarY,
          left:     toolbarX,
          zIndex:   10050,
          pointerEvents: 'auto',
          opacity:  toolbarIdle ? 0.6 : 1,
          transition: isDraggingToolbar ? 'none' : 'opacity 0.4s',
          width:    240,
          maxWidth: 'calc(100vw - 400px)',
          cursor:   isDraggingToolbar ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        {/* Collapsed state — small icon button */}
        {toolbarCollapsed ? (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <button
              type="button"
              onClick={() => setToolbarCollapsed(false)}
              style={{
                display:        'inline-flex',
                alignItems:     'center',
                justifyContent: 'center',
                width:          42,
                height:         42,
                borderRadius:   14,
                background:     'rgba(20,12,0,0.88)',
                border:         '1px solid rgba(255,255,255,0.18)',
                color:          '#fff',
                cursor:         'pointer',
                fontSize:       15,
              }}
              aria-label="Buka toolbar"
            >
              <ChevronRight style={{ width: 16, height: 16 }} />
            </button>
          </div>
        ) : (
          /* Expanded state — compact left-side panel */
          <div
            style={{
              display:       'flex',
              flexDirection: 'column',
              alignItems:    'stretch',
              gap:           10,
              padding:       '10px',
              borderRadius:  18,
              background:    'rgba(20,12,0,0.88)',
              border:        '1px solid rgba(255,255,255,0.18)',
            }}
          >
            {/* ── Color swatches ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setColor(c); setTool('pen'); signalActivity(); }}
                  aria-label={`Warna ${c}`}
                  style={{
                    width:        30,
                    height:       30,
                    borderRadius: '50%',
                    background:   c,
                    border:       color === c && tool === 'pen'
                      ? '2px solid #fff'
                      : '1.5px solid rgba(255,255,255,0.2)',
                    boxShadow:    color === c && tool === 'pen'
                      ? `0 0 0 1px ${c}`
                      : 'none',
                    cursor:       'pointer',
                    flexShrink:   0,
                  }}
                />
              ))}
              <label
                title="Warna custom"
                style={{
                  position:     'relative',
                  display:      'inline-flex',
                  width:        30,
                  height:       30,
                  borderRadius: '50%',
                  background:   color,
                  border:       '1.5px solid rgba(255,255,255,0.25)',
                  cursor:       'pointer',
                  overflow:     'hidden',
                  flexShrink:   0,
                }}
              >
                <input
                  type="color"
                  value={color}
                  onChange={e => { setColor(e.target.value); setTool('pen'); signalActivity(); }}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                />
              </label>
            </div>

            {/* ── Pen / Eraser toggle ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => { setTool('pen'); signalActivity(); }}
                aria-label="Pena"
                style={{
                  display:        'inline-flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  width:          38,
                  height:         38,
                  borderRadius:   12,
                  background:     tool === 'pen' ? '#fff'              : 'rgba(255,255,255,0.12)',
                  color:          tool === 'pen' ? '#111827'           : 'rgba(255,255,255,0.8)',
                  border:         'none',
                  cursor:         'pointer',
                  boxShadow:      tool === 'pen' ? '0 3px 12px rgba(0,0,0,0.2)' : 'none',
                }}
              >
                <Pen style={{ width: 16, height: 16 }} />
              </button>
              <button
                type="button"
                onClick={() => { setTool('eraser'); signalActivity(); }}
                aria-label="Penghapus"
                style={{
                  display:        'inline-flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  width:          38,
                  height:         38,
                  borderRadius:   12,
                  background:     tool === 'eraser' ? '#fff'           : 'rgba(255,255,255,0.12)',
                  color:          tool === 'eraser' ? '#111827'        : 'rgba(255,255,255,0.8)',
                  border:         'none',
                  cursor:         'pointer',
                  boxShadow:      tool === 'eraser' ? '0 3px 12px rgba(0,0,0,0.2)' : 'none',
                }}
              >
                <Eraser style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* ── Brush sizes ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              {SIZES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => { setBrushSize(s.value); signalActivity(); }}
                  aria-label={`Ukuran ${s.label}`}
                  style={{
                    display:        'inline-flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    width:          34,
                    height:         34,
                    borderRadius:   '50%',
                    background:     brushSize === s.value ? '#fff'   : 'rgba(255,255,255,0.12)',
                    border:         brushSize === s.value
                      ? 'none'
                      : '1.5px solid rgba(255,255,255,0.2)',
                    cursor:         'pointer',
                  }}
                >
                  <span
                    style={{
                      display:      'block',
                      borderRadius: '50%',
                      width:        Math.min(s.value * 1.4 + 4, 18),
                      height:       Math.min(s.value * 1.4 + 4, 18),
                      background:   brushSize === s.value ? '#111827' : '#fff',
                    }}
                  />
                </button>
              ))}
            </div>

            {/* ── Undo / Clear / Submit ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={undo}
                  disabled={history.length === 0}
                  aria-label="Undo"
                  style={{
                    display:        'inline-flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    width:          38,
                    height:         38,
                    borderRadius:   12,
                    background:     'rgba(255,255,255,0.12)',
                    border:         '1px solid rgba(255,255,255,0.15)',
                    color:          'rgba(255,255,255,0.85)',
                    cursor:         history.length === 0 ? 'not-allowed' : 'pointer',
                    opacity:        history.length === 0 ? 0.35 : 1,
                  }}
                >
                  <Undo2 style={{ width: 16, height: 16 }} />
                </button>
                <button
                  type="button"
                  onClick={clearCanvas}
                  aria-label="Hapus semua"
                  style={{
                    display:        'inline-flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    width:          38,
                    height:         38,
                    borderRadius:   12,
                    background:     'rgba(255,255,255,0.12)',
                    border:         '1px solid rgba(255,255,255,0.15)',
                    color:          'rgba(255,255,255,0.85)',
                    cursor:         'pointer',
                  }}
                >
                  <Trash2 style={{ width: 16, height: 16 }} />
                </button>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!hasContent || isSubmitting || isEnded}
                aria-label="Kirim pesan"
                style={{
                  display:        'inline-flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            6,
                  padding:        '0 16px',
                  height:         38,
                  borderRadius:   20,
                  background:     'linear-gradient(135deg,#D4AF37 0%,#F4D03F 100%)',
                  border:         'none',
                  color:          '#1a0e00',
                  fontWeight:     700,
                  fontSize:       13,
                  cursor:         !hasContent || isSubmitting || isEnded ? 'not-allowed' : 'pointer',
                  opacity:        !hasContent || isSubmitting || isEnded ? 0.35 : 1,
                  boxShadow:      '0 3px 14px rgba(212,175,55,0.4)',
                  whiteSpace:     'nowrap',
                }}
              >
                <Send style={{ width: 14, height: 14 }} />
                {isSubmitting ? 'Mengirim…' : cfg.submitLabel}
              </button>
            </div>

            {/* ── Collapse button ── */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setToolbarCollapsed(true)}
                aria-label="Sembunyikan toolbar"
                style={{
                  display:        'inline-flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  width:          36,
                  height:         36,
                  borderRadius:   12,
                  background:     'rgba(255,255,255,0.1)',
                  border:         '1px solid rgba(255,255,255,0.15)',
                  color:          'rgba(255,255,255,0.7)',
                  cursor:         'pointer',
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
      /*
       * Kiosk mode: outer div must be 100% height so flex-1 children can expand.
       * The parent (GuestbookKiosk) wraps this with position:absolute inset:0
       * and passes className="w-full h-full".
       */
      <div
        className={`flex flex-col ${className}`}
        style={{ minHeight: 0, height: isKiosk ? '100%' : undefined }}
      >
        {/* ── Canvas area — fills all available vertical space ── */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <motion.div
            animate={{ opacity: canvasOpacity }}
            transition={{ duration: 0.5 }}
            style={{
              position:      'absolute',
              inset:         0,
              borderRadius:  isKiosk ? 0 : '1rem',
              overflow:      'hidden',
              touchAction:   'none',
              pointerEvents: 'auto',
              boxShadow:     isKiosk ? 'none' : `0 0 0 2px ${cfg.borderColor}, 0 8px 40px ${cfg.glowColor}`,
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                display:       'block',
                width:         '100%',
                height:        '100%',
                background:    isKiosk ? 'transparent' : cfg.canvasBg,
                touchAction:   'none',
                pointerEvents: 'auto',
                userSelect:    'none',
                WebkitUserSelect: 'none',
                cursor:        isEnded ? 'not-allowed' : tool === 'eraser' ? 'cell' : 'crosshair',
              }}
            />

            {/* Hint text */}
            <div
              className="absolute top-4 left-5 text-sm italic font-serif pointer-events-none select-none"
              style={{
                color:      'rgba(180,160,120,0.6)',
                opacity:    hasContent ? 0 : 1,
                transition: 'opacity 0.3s',
              }}
            >
              {cfg.hint}
            </div>

            {/* Wedding corner accents (non-kiosk only) */}
            {theme === 'wedding' && !frameUrl && !isKiosk && (
              <>
                {[
                  'top-2 left-2 border-t border-l',
                  'top-2 right-2 border-t border-r',
                  'bottom-2 left-2 border-b border-l',
                  'bottom-2 right-2 border-b border-r',
                ].map((cls, i) => (
                  <div key={i} className={`absolute w-5 h-5 pointer-events-none ${cls}`}
                    style={{ borderColor: 'rgba(212,175,55,0.5)' }} />
                ))}
              </>
            )}

            {/* Event ended overlay */}
            {isEnded && (
              <div
                className="absolute inset-0 flex items-center justify-center rounded-2xl"
                style={{ background: 'rgba(0,0,0,0.6)' }}
              >
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

        {/* Portal: kiosk toolbar */}
        {toolbarPanel && (portalReady ? createPortal(toolbarPanel, document.body) : toolbarPanel)}

        {/* Display variant: compact left-side controls */}
        {isDisplay && !isEnded && (
          <div
            style={{
              position: 'fixed',
              top:      180,
              left:     180,
              zIndex:   10050,
              display:  'flex',
              flexDirection: 'column',
              gap:      8,
              padding:  '10px',
              borderRadius: 18,
              background: 'rgba(20,12,0,0.88)',
              border: '1px solid rgba(255,255,255,0.18)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              <button
                onClick={undo}
                disabled={history.length === 0}
                style={{
                  display:        'inline-flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  width:          38,
                  height:         38,
                  borderRadius:   12,
                  background:     'rgba(255,255,255,0.1)',
                  border:         '1px solid rgba(255,255,255,0.1)',
                  color:          '#fff',
                  opacity:        history.length === 0 ? 0.35 : 1,
                  cursor:         history.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={clearCanvas}
                style={{
                  display:        'inline-flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  width:          38,
                  height:         38,
                  borderRadius:   12,
                  background:     'rgba(255,255,255,0.1)',
                  border:         '1px solid rgba(255,255,255,0.1)',
                  color:          '#fff',
                }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={handleSubmit}
              disabled={!hasContent || isSubmitting}
              className="flex items-center gap-2 px-5 py-2 rounded-full font-semibold text-sm disabled:opacity-30 relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg,#C9A84C 0%,#F0D080 50%,#C9A84C 100%)',
                boxShadow:  '0 4px 20px rgba(201,168,76,0.5)',
                color:      '#1a0e00',
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