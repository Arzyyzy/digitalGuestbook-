import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { useGuestbook } from '../contexts/GuestbookContext';
import { EnhancedCanvas, EnhancedCanvasHandle } from '../components/EnhancedCanvas';
import { HeartAnimation } from '../components/HeartAnimation';
import { FloatingParticles } from '../components/FloatingParticles';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';

const THEME_META = {
  wedding: {
    bg:          '#f5ede0',
    accentColor: '#D4AF37',
    heartColor:  '#D4AF37',
  },
  graduation: {
    bg:          '#eef2fb',
    accentColor: '#1e3a8a',
    heartColor:  '#3b82f6',
  },
  corporate: {
    bg:          '#f1f3f6',
    accentColor: '#334155',
    heartColor:  '#64748b',
  },
} as const;

/**
 * LAYOUT — 1920×1080 signage:
 *
 * The frame image is displayed with object-fit:cover as a full-screen overlay
 * with pointer-events:none. The transparent canvas sits BEHIND the frame and
 * fills the entire viewport, so users draw inside the frame's black hole.
 *
 * The EnhancedCanvas toolbar is rendered via portal at the BOTTOM of the
 * screen inside the frame hole area (~bottom:248px from viewport bottom),
 * so it never overlaps the floral top-left decoration of the frame.
 *
 * LAYER ORDER:
 *   z-0   background fill
 *   z-1   transparent canvas (fills screen, draws behind frame)
 *   z-2   floating particles
 *   z-5   frame overlay image (pointer-events:none)
 *   z-30  secret tap zone
 *   z-9998 idle overlay (solid dark bg — NO backdrop-filter for Xibo compat)
 *   z-9999 idle modal
 *   z-10050 toolbar (via portal)
 *
 * Xibo old-browser compatibility:
 *   - NO backdrop-filter / WebkitBackdropFilter
 *   - NO conic-gradient (use linear progress bar instead)
 *   - NO CSS grid
 *   - Solid rgba() backgrounds only
 */

export function GuestbookKiosk() {
  const { settings, settingsLoading, settingsError, storageError, addMessage } = useGuestbook();
  const navigate   = useNavigate();
  const canvasRef  = useRef<EnhancedCanvasHandle>(null);
  const section1Ref = useRef<HTMLDivElement>(null);

  const [showHearts,      setShowHearts]      = useState(false);
  const [showThx,         setShowThx]         = useState(false);
  const [hasDrawing,      setHasDrawing]       = useState(false);
  const [tapCount,        setTapCount]         = useState(0);
  const [tapTimer,        setTapTimer]         = useState<ReturnType<typeof setTimeout> | null>(null);
  const [warningVisible,  setWarningVisible]   = useState(false);
  const [countdown,       setCountdown]        = useState(10);

  const idleTimerRef      = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const warningTimerRef   = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const theme = settings.eventType;
  const meta  = THEME_META[theme];

  // ── Idle helpers ─────────────────────────────────────────────────────────────

  const clearIdleTimers = useCallback(() => {
    if (idleTimerRef.current)      { clearTimeout(idleTimerRef.current);       idleTimerRef.current = null; }
    if (warningTimerRef.current)   { clearTimeout(warningTimerRef.current);    warningTimerRef.current = null; }
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
  }, []);

  const resetIdleWarning = useCallback(() => {
    clearIdleTimers();
    setWarningVisible(false);
    setCountdown(10);
  }, [clearIdleTimers]);

  const triggerIdleWarning = useCallback(() => {
    setWarningVisible(true);
    setCountdown(10);
    countdownTimerRef.current = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    warningTimerRef.current = setTimeout(() => {
      canvasRef.current?.reset();
      setHasDrawing(false);
      resetIdleWarning();
    }, 10000);
  }, [resetIdleWarning]);

  const startIdleTimer = useCallback(() => {
    clearIdleTimers();
    idleTimerRef.current = setTimeout(() => triggerIdleWarning(), 20000);
  }, [clearIdleTimers, triggerIdleWarning]);

  const handleUserActivity = useCallback(() => {
    if (!hasDrawing) return;
    if (warningVisible) resetIdleWarning();
    startIdleTimer();
  }, [hasDrawing, startIdleTimer, warningVisible, resetIdleWarning]);

  useEffect(() => () => clearIdleTimers(), [clearIdleTimers]);

  // ── Canvas handlers ───────────────────────────────────────────────────────────

  const handleSubmit = useCallback((imageData: string) => {
    addMessage(imageData);
    resetIdleWarning();
    clearIdleTimers();
    setShowHearts(true);
    setShowThx(true);
    setHasDrawing(false);
    setTimeout(() => setShowThx(false), 3000);
  }, [addMessage, clearIdleTimers, resetIdleWarning]);

  const handleCanvasDrawStart = useCallback(() => {
    setHasDrawing(true);
    resetIdleWarning();
    startIdleTimer();
  }, [resetIdleWarning, startIdleTimer]);

  const handleCanvasClear = useCallback(() => {
    setHasDrawing(false);
    resetIdleWarning();
  }, [resetIdleWarning]);

  // ── Secret tap ────────────────────────────────────────────────────────────────

  const handleSecretTap = () => {
    const next = tapCount + 1;
    setTapCount(next);
    if (tapTimer) clearTimeout(tapTimer);
    const t = setTimeout(() => setTapCount(0), 2500);
    setTapTimer(t);
    if (next >= 5) {
      setTapCount(0);
      if (tapTimer) clearTimeout(tapTimer);
      navigate('/guestbook/admin');
    }
  };

  if (settingsLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f' }}>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>Memuat pengaturan event…</p>
      </div>
    );
  }

  if (settingsError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', padding: '20px' }}>
        <div style={{ maxWidth: '600px', textAlign: 'center', color: 'rgba(255,255,255,0.9)' }}>
          <p style={{ fontSize: 16, marginBottom: 8, color: '#ef4444' }}>⚠️ Kesalahan Pengaturan</p>
          <p style={{ fontSize: 14, marginBottom: 16 }}>{settingsError}</p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Hubungi admin untuk memeriksa konfigurasi event di admin panel.</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Global resets — no backdrop-filter anywhere for Xibo compat */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body, #root {
          margin: 0; padding: 0;
          width: 100%; overflow: hidden;
        }
      `}</style>

      {storageError && (
        <div style={{ position: 'fixed', top: 16, left: 0, right: 0, zIndex: 9500, display: 'flex', justifyContent: 'center', padding: '0 16px', pointerEvents: 'none' }}>
          <div style={{ width: '100%', maxWidth: 760, pointerEvents: 'auto' }}>
            <Alert variant="destructive" className="shadow-2xl">
              <AlertTitle>Masalah Penyimpanan</AlertTitle>
              <AlertDescription>{storageError}</AlertDescription>
            </Alert>
          </div>
        </div>
      )}

      {/* ── Root fullscreen container ── */}
      <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', background: meta.bg, overflow: 'hidden' }}>
        <div
          ref={section1Ref}
          style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
        >

          {/* ── Transparent canvas — fills entire screen behind frame ── */}
          <div
            style={{ position: 'absolute', inset: 0, zIndex: 1, width: '100%', height: '100%' }}
            data-kiosk-canvas=""
            onLoad={() => console.log('[Kiosk] Canvas container mounted')}
          >
            <EnhancedCanvas
              ref={canvasRef}
              theme={theme}
              frameUrl={settings.frameUrl}
              onSubmit={handleSubmit}
              isEnded={settings.isEnded}
              variant="kiosk"
              onDrawStart={handleCanvasDrawStart}
              onUserActivity={handleUserActivity}
              onClear={handleCanvasClear}
              className="w-full h-full"
            />
          </div>

          {/* ── Floating particles ── */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
            <FloatingParticles />
          </div>

          {/*
            ── Frame overlay image ──
            Full-screen, object-fit:cover so frame fills 1920×1080.
            pointer-events:none keeps canvas & toolbar fully interactive.
          */}
          {settings.frameUrl && (
            <img
              src={settings.frameUrl}
              alt="Frame overlay"
              style={{
                position:        'absolute',
                inset:           0,
                width:           '100%',
                height:          '100%',
                objectFit:       'cover',
                objectPosition:  'center',
                zIndex:          5,
                pointerEvents:   'none',
                display:         'block',
              }}
            />
          )}

          {/*
            ── Idle overlay ──
            Solid semi-transparent dark background.
            NO backdrop-filter — not supported in Xibo's old browser.
          */}
          <AnimatePresence>
            {warningVisible && (
              <motion.div
                key="idle-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  position: 'fixed',
                  inset:    0,
                  zIndex:   9998,
                  background: 'rgba(0,0,0,0.72)',
                }}
              />
            )}
          </AnimatePresence>

          {/*
            ── Idle confirmation modal ──
            Solid white background (NO backdrop-filter for Xibo compat).
            NO conic-gradient countdown — use simple linear progress bar.
          */}
          <AnimatePresence>
            {warningVisible && (
              <motion.div
                key="idle-modal"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                style={{
                  position:  'fixed',
                  top:       '50%',
                  left:      '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex:    9999,
                  width:     'calc(100% - 32px)',
                  maxWidth:  520,
                }}
              >
                <div
                  style={{
                    borderRadius: 20,
                    padding:      32,
                    background:   '#ffffff',
                    border:       '1px solid rgba(0,0,0,0.08)',
                    boxShadow:    '0 24px 64px rgba(0,0,0,0.25)',
                  }}
                >
                  {/* Title */}
                  <p style={{ fontSize: 22, fontWeight: 700, color: '#111827', textAlign: 'center', marginBottom: 8 }}>
                    Masih ingin melanjutkan?
                  </p>

                  {/* Description */}
                  <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
                    Sesi akan direset jika tidak ada aktivitas.
                  </p>

                  {/* Countdown — simple linear progress bar (Xibo safe) */}
                  <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 10 }}>Otomatis reset dalam</p>
                    <p style={{ fontSize: 42, fontWeight: 800, color: '#111827', lineHeight: 1, marginBottom: 12 }}>
                      {countdown}
                      <span style={{ fontSize: 16, fontWeight: 500, color: '#9ca3af', marginLeft: 6 }}>detik</span>
                    </p>
                    {/* Progress bar instead of conic-gradient */}
                    <div style={{ height: 6, borderRadius: 3, background: 'rgba(212,175,55,0.2)', overflow: 'hidden' }}>
                      <motion.div
                        style={{
                          height:       '100%',
                          borderRadius: 3,
                          background:   'linear-gradient(90deg,#D4AF37,#F4D03F)',
                          originX:      0,
                        }}
                        animate={{ scaleX: countdown / 10 }}
                        transition={{ duration: 0.9, ease: 'linear' }}
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button
                      onClick={handleUserActivity}
                      style={{
                        flex:         1,
                        padding:      '12px 20px',
                        borderRadius: 12,
                        fontWeight:   700,
                        color:        '#fff',
                        background:   'linear-gradient(135deg, #D4AF37, #F0D080)',
                        border:       'none',
                        cursor:       'pointer',
                        fontSize:     15,
                        boxShadow:    '0 4px 15px rgba(212,175,55,0.3)',
                      }}
                    >
                      ✎ Lanjutkan
                    </button>
                    <button
                      onClick={() => {
                        canvasRef.current?.reset();
                        setHasDrawing(false);
                        resetIdleWarning();
                      }}
                      style={{
                        flex:         1,
                        padding:      '12px 20px',
                        borderRadius: 12,
                        fontWeight:   700,
                        color:        '#64748b',
                        background:   'rgba(100,116,139,0.08)',
                        border:       '1.5px solid rgba(100,116,139,0.25)',
                        cursor:       'pointer',
                        fontSize:     15,
                      }}
                    >
                      🗑 Reset Sekarang
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Secret tap zone (top-left corner, 5× tap → admin) ── */}
          <div
            onClick={handleSecretTap}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: 64, height: 64, zIndex: 30,
              opacity: 0, cursor: 'pointer',
            }}
          />
        </div>
      </div>

      {/* ── Global fixed overlays ─────────────────────────────────────────── */}

      <HeartAnimation
        trigger={showHearts}
        onComplete={() => setShowHearts(false)}
        color={meta.heartColor}
      />

      {/* Thank-you toast — solid bg, NO backdrop-filter */}
      <AnimatePresence>
        {showThx && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position:   'fixed',
              inset:      0,
              zIndex:     9000,
              display:    'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.35)',
            }}
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, y: 20 }}
              style={{
                background:   '#fff',
                borderRadius: 28,
                padding:      '36px 48px',
                boxShadow:    '0 24px 64px rgba(0,0,0,0.2)',
                textAlign:    'center',
                maxWidth:     320,
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>✨</div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.4rem', color: '#1f2937', margin: '0 0 8px' }}>
                Terima Kasih!
              </h2>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px' }}>
                Ucapan Anda telah tersimpan dengan indah
              </p>
              <div style={{ height: 4, borderRadius: 2, overflow: 'hidden', background: '#f3f4f6' }}>
                <motion.div
                  initial={{ width: '0%' }} animate={{ width: '100%' }}
                  transition={{ duration: 3, ease: 'linear' }}
                  style={{
                    height:     '100%',
                    borderRadius: 2,
                    background: `linear-gradient(to right, ${meta.accentColor}, #F4D03F)`,
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
