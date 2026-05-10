import { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Undo2, Trash2, Send } from 'lucide-react';

type Theme = 'wedding' | 'graduation' | 'corporate';

interface DrawingCanvasProps {
  onSubmit: (imageData: string) => void;
  theme: Theme;
}

const THEME_CFG = {
  wedding: {
    strokeColor: '#2C1810',
    borderColor: 'rgba(212, 175, 55, 0.45)',
    glowAnim: 'canvas-glow-wedding 2.6s ease-in-out infinite',
    btnGrad: 'linear-gradient(135deg, #D4AF37 0%, #F4D03F 100%)',
    btnHoverGrad: 'linear-gradient(135deg, #C49F2F 0%, #E4C02F 100%)',
    btnShadow: '0 4px 22px rgba(212, 175, 55, 0.5)',
    canvasBg: 'rgba(255, 255, 255, 0.96)',
    placeholder: '#b8a87a',
    hint: 'Tulis pesan & nama Anda di sini...',
    submitLabel: 'Kirim Ucapan',
  },
  graduation: {
    strokeColor: '#1e3a8a',
    borderColor: 'rgba(59, 130, 246, 0.5)',
    glowAnim: 'canvas-glow-graduation 2.6s ease-in-out infinite',
    btnGrad: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
    btnHoverGrad: 'linear-gradient(135deg, #163070 0%, #2563eb 100%)',
    btnShadow: '0 4px 22px rgba(30, 58, 138, 0.5)',
    canvasBg: 'rgba(255, 255, 255, 0.97)',
    placeholder: '#6b82b5',
    hint: 'Tulis ucapan wisuda Anda di sini...',
    submitLabel: 'Kirim Ucapan',
  },
  corporate: {
    strokeColor: '#1f2937',
    borderColor: 'rgba(100, 200, 255, 0.42)',
    glowAnim: 'canvas-glow-corporate 2.6s ease-in-out infinite',
    btnGrad: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
    btnHoverGrad: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    btnShadow: '0 4px 22px rgba(100, 200, 255, 0.38)',
    canvasBg: 'rgba(255, 255, 255, 0.98)',
    placeholder: '#7a8fa0',
    hint: 'Tulis pesan korporat Anda di sini...',
    submitLabel: 'Kirim Pesan',
  },
} as const;

export function DrawingCanvas({ onSubmit, theme }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const isDrawingRef = useRef(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [canvasReady, setCanvasReady] = useState(false);
  const [canvasOpacity, setCanvasOpacity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHoveringSubmit, setIsHoveringSubmit] = useState(false);

  const cfg = THEME_CFG[theme];

  // Initialize (or re-initialize) canvas dimensions + context settings
  const initCanvas = useCallback(
    (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): boolean => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;

      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(dpr, dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';

      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = 3;
      context.strokeStyle = THEME_CFG[theme].strokeColor;
      return true;
    },
    [theme]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    ctxRef.current = context;

    // Try immediately; fall back to ResizeObserver if layout isn't ready yet
    if (initCanvas(canvas, context)) {
      setCanvasReady(true);
      setHistory([]);
      return;
    }

    setCanvasReady(false);
    const ro = new ResizeObserver(() => {
      if (initCanvas(canvas, context)) {
        setCanvasReady(true);
        setHistory([]);
        ro.disconnect();
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [theme, initCanvas]);

  // Native touch listeners with passive: false to allow preventDefault()
  // Prevents browser from treating touch as passive event
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      if (!canvasReady || !ctxRef.current) return;
      const ctx = ctxRef.current;
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistory((prev) => [...prev, imageData]);
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      ctx.beginPath();
      ctx.moveTo(x, y);
      isDrawingRef.current = true;
      setIsDrawing(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      if (!isDrawingRef.current || !ctxRef.current || !canvasRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      if (!touch) return;
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      ctxRef.current.lineTo(x, y);
      ctxRef.current.stroke();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      ctxRef.current?.closePath();
      isDrawingRef.current = false;
      setIsDrawing(false);
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [canvasReady]);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!ctx || !canvas || !canvasReady) return;
    if (canvas.width === 0 || canvas.height === 0) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev, imageData]);

    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
    isDrawingRef.current = true;
    setIsDrawing(true);
  }, [canvasReady]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!isDrawingRef.current || !ctx || !canvas) return;
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
  }, []);

  const stopDrawing = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.closePath();
    isDrawingRef.current = false;
    setIsDrawing(false);
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHistory([]);
  }, []);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!ctx || !canvas || history.length === 0) return;
    ctx.putImageData(history[history.length - 1], 0, 0);
    setHistory((prev) => prev.slice(0, -1));
  }, [history]);

  const handleSubmit = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || isSubmitting) return;
    setIsSubmitting(true);

    const imageData = canvas.toDataURL('image/png');
    onSubmit(imageData);

    // Smooth fade out → clear → fade in
    setCanvasOpacity(0);
    await new Promise((r) => setTimeout(r, 460));
    clearCanvas();
    setCanvasOpacity(1);
    setIsSubmitting(false);
  }, [isSubmitting, onSubmit, clearCanvas]);

  const isEmpty = useCallback((): boolean => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx || !canvasReady) return true;
    if (canvas.width === 0 || canvas.height === 0) return true;
    const pb = new Uint32Array(
      ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer
    );
    return !pb.some((c) => c !== 0);
  }, [canvasReady]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Canvas wrapper with theme glow border */}
      <div className="absolute inset-0">
        <div
          style={{
            opacity: canvasOpacity,
            transition: 'opacity 0.46s ease-in-out',
            borderRadius: '1rem',
            position: 'relative',
          }}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            className="absolute inset-0 w-full h-full touch-none"
            style={{
              background: cfg.canvasBg,
              border: `2px solid ${cfg.borderColor}`,
              animation: cfg.glowAnim,
              display: 'block',
            }}
          />

          {/* Decorative corner accents (wedding only) */}
          {theme === 'wedding' && (
            <>
              <div
                className="absolute top-2 left-2 w-6 h-6 pointer-events-none"
                style={{
                  borderTop: '2px solid rgba(212, 175, 55, 0.5)',
                  borderLeft: '2px solid rgba(212, 175, 55, 0.5)',
                  borderRadius: '4px 0 0 0',
                }}
              />
              <div
                className="absolute top-2 right-2 w-6 h-6 pointer-events-none"
                style={{
                  borderTop: '2px solid rgba(212, 175, 55, 0.5)',
                  borderRight: '2px solid rgba(212, 175, 55, 0.5)',
                  borderRadius: '0 4px 0 0',
                }}
              />
              <div
                className="absolute bottom-2 left-2 w-6 h-6 pointer-events-none"
                style={{
                  borderBottom: '2px solid rgba(212, 175, 55, 0.5)',
                  borderLeft: '2px solid rgba(212, 175, 55, 0.5)',
                  borderRadius: '0 0 0 4px',
                }}
              />
              <div
                className="absolute bottom-2 right-2 w-6 h-6 pointer-events-none"
                style={{
                  borderBottom: '2px solid rgba(212, 175, 55, 0.5)',
                  borderRight: '2px solid rgba(212, 175, 55, 0.5)',
                  borderRadius: '0 0 4px 0',
                }}
              />
            </>
          )}

          {/* Corporate scan-line accent */}
          {theme === 'corporate' && (
            <div
              className="absolute top-0 left-0 right-0 h-px rounded-t-2xl pointer-events-none"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(100,200,255,0.6), transparent)',
                animation: 'gentle-pulse 2.5s ease-in-out infinite',
              }}
            />
          )}
        </div>

        {/* Placeholder hint */}
        <div
          className="absolute top-4 left-5 text-sm italic font-serif pointer-events-none select-none"
          style={{ color: cfg.placeholder, opacity: canvasOpacity }}
        >
          {cfg.hint}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 justify-center">
        {/* Undo */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={undo}
          disabled={history.length === 0}
          className="flex items-center gap-2 px-6 py-3 bg-white/85 hover:bg-white text-gray-700 rounded-xl shadow-lg disabled:opacity-35 disabled:cursor-not-allowed transition-colors border border-gray-200"
        >
          <Undo2 className="w-5 h-5" />
          <span className="font-medium">Undo</span>
        </motion.button>

        {/* Clear */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={clearCanvas}
          className="flex items-center gap-2 px-6 py-3 bg-white/85 hover:bg-white text-gray-700 rounded-xl shadow-lg transition-colors border border-gray-200"
        >
          <Trash2 className="w-5 h-5" />
          <span className="font-medium">Hapus</span>
        </motion.button>

        {/* Submit */}
        <motion.button
          whileHover={{ scale: 1.045 }}
          whileTap={{ scale: 0.9, rotate: -1 }}
          onHoverStart={() => setIsHoveringSubmit(true)}
          onHoverEnd={() => setIsHoveringSubmit(false)}
          onClick={handleSubmit}
          disabled={isEmpty() || isSubmitting}
          className="flex items-center gap-2 px-8 py-3 text-white rounded-xl shadow-lg disabled:opacity-35 disabled:cursor-not-allowed font-semibold relative overflow-hidden"
          style={{
            background: isHoveringSubmit ? cfg.btnHoverGrad : cfg.btnGrad,
            boxShadow: cfg.btnShadow,
            transition: 'background 0.25s ease, box-shadow 0.25s ease',
          }}
        >
          {/* Shimmer layer */}
          {!isEmpty() && !isSubmitting && (
            <span
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2.2s ease-in-out infinite',
              }}
            />
          )}
          <motion.div
            animate={isSubmitting ? { rotate: 360 } : { rotate: 0 }}
            transition={
              isSubmitting ? { duration: 0.8, repeat: Infinity, ease: 'linear' } : {}
            }
          >
            <Send className="w-5 h-5" />
          </motion.div>
          <span>{isSubmitting ? 'Mengirim...' : cfg.submitLabel}</span>
        </motion.button>
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: -100% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}
