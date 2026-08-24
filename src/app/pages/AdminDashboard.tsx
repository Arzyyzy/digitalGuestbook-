import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, Settings, ImagePlus, MessageSquare, FileDown,
  LogOut, Eye, Trash2, Upload, CheckCircle, X, XCircle,
  Power, RefreshCw, ExternalLink, Lock, ChevronRight,
  Calendar, MapPin, Tag, Shield, Loader2,
  AlertTriangle, Heart, GraduationCap, Briefcase, BarChart3,
} from 'lucide-react';
import { useGuestbook, EventSettings } from '../contexts/GuestbookContext';
import { MessagesTab } from './AdminDashboard/MessagesTab';
import { AnalyticsTab } from './AdminDashboard/AnalyticsTab';
import { exportGuestbookToPDF, downloadPDF } from '../utils/pdfExport';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { updateAppSettings, uploadPdfToStorage } from '../../lib/supabase';

type Section = 'overview' | 'settings' | 'assets' | 'messages' | 'analytics' | 'export';

const NAV_ITEMS: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'settings', label: 'Pengaturan', icon: Settings },
  { id: 'assets', label: 'Aset & Media', icon: ImagePlus },
  { id: 'messages', label: 'Pesan Tamu', icon: MessageSquare },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'export', label: 'Ekspor & Kontrol', icon: FileDown },
];

const GOLD = '#C9A84C';

const DEFAULT_FRAME_SLOT = {
  x: 0.107,
  y: 0.259,
  width: 0.795,
  height: 0.547,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function StatCard({ label, value, sub, color = GOLD }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div
      className="rounded-2xl p-5 space-y-1"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)' }}
    >
      <p className="text-xs uppercase tracking-widest" style={{ color: 'rgba(201,168,76,0.6)' }}>{label}</p>
      <p className="text-3xl font-semibold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <h2 className="text-lg font-semibold text-white">{children}</h2>
      <div className="flex-1 h-px" style={{ background: 'rgba(201,168,76,0.2)' }} />
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-widest" style={{ color: 'rgba(201,168,76,0.7)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass = "w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/20 outline-none focus:ring-1 transition-all";
const inputStyle = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(201,168,76,0.2)',
};

export function AdminDashboard() {
  const { settings, settingsLoading, settingsError, messages, saveSettings, deleteMessage, clearMessages } = useGuestbook();
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [section, setSection] = useState<Section>('overview');
  const [form, setForm] = useState<EventSettings>(settings);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading-frame'>('idle');
  const [isDeletingFrame, setIsDeletingFrame] = useState(false);
  const [frameUploadError, setFrameUploadError] = useState<string | null>(null);

  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);
  const [pdfDone, setPdfDone] = useState(false);
  const [pdfLink, setPdfLink] = useState<string | null>(null);
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null);
  const [isGeneratingPdfLink, setIsGeneratingPdfLink] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);

  const frameInputRef = useRef<HTMLInputElement>(null);
  const framePreviewRef = useRef<HTMLDivElement>(null);
  const frameImageRef = useRef<HTMLImageElement>(null);

  const [framePreviewRect, setFramePreviewRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const slotDragRef = useRef<{
    mode: 'move' | 'resize';
    originX: number;
    originY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const [isDraggingSlot, setIsDraggingSlot] = useState(false);

  const handleLogin = () => {
    if (password === settings.adminPassword) {
      setIsLoggedIn(true);
      setLoginError('');
    } else {
      setLoginError('Password salah. Coba lagi.');
      setTimeout(() => setLoginError(''), 3000);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setPassword('');
  };

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const getPreviewSlot = useCallback(() => {
    const hasSavedSlot = form.frameSlotWidth > 0 && form.frameSlotHeight > 0;
    return {
      x: hasSavedSlot ? form.frameSlotX : DEFAULT_FRAME_SLOT.x,
      y: hasSavedSlot ? form.frameSlotY : DEFAULT_FRAME_SLOT.y,
      width: hasSavedSlot ? form.frameSlotWidth : DEFAULT_FRAME_SLOT.width,
      height: hasSavedSlot ? form.frameSlotHeight : DEFAULT_FRAME_SLOT.height,
    };
  }, [form.frameSlotHeight, form.frameSlotWidth, form.frameSlotX, form.frameSlotY]);

  const updatePreviewRect = useCallback(() => {
    const img = frameImageRef.current;
    const container = framePreviewRef.current;
    if (!img || !container) return;
    const imgRect = img.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setFramePreviewRect({
      left: imgRect.left - containerRect.left,
      top: imgRect.top - containerRect.top,
      width: imgRect.width,
      height: imgRect.height,
    });
  }, []);

  useEffect(() => {
    const image = frameImageRef.current;
    if (!image) return;
    const ro = new ResizeObserver(updatePreviewRect);
    ro.observe(image);
    updatePreviewRect();
    return () => ro.disconnect();
  }, [form.frameUrl, updatePreviewRect]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = slotDragRef.current;
      if (!drag || !framePreviewRect.width || !framePreviewRect.height) return;
      const deltaX = event.clientX - drag.originX;
      const deltaY = event.clientY - drag.originY;

      if (drag.mode === 'move') {
        const newLeft = clamp(drag.startX + deltaX, 0, framePreviewRect.width - drag.startWidth);
        const newTop = clamp(drag.startY + deltaY, 0, framePreviewRect.height - drag.startHeight);
        setForm(prev => ({
          ...prev,
          frameSlotX: newLeft / framePreviewRect.width,
          frameSlotY: newTop / framePreviewRect.height,
        }));
      } else {
        const newWidth = clamp(drag.startWidth + deltaX, 32, framePreviewRect.width - drag.startX);
        const newHeight = clamp(drag.startHeight + deltaY, 32, framePreviewRect.height - drag.startY);
        setForm(prev => ({
          ...prev,
          frameSlotWidth: newWidth / framePreviewRect.width,
          frameSlotHeight: newHeight / framePreviewRect.height,
        }));
      }
    };

    const handlePointerUp = () => {
      if (slotDragRef.current) {
        slotDragRef.current = null;
        setIsDraggingSlot(false);
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp, { passive: false });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [framePreviewRect.height, framePreviewRect.width]);

  const handleSlotPointerDown = (mode: 'move' | 'resize') => (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (event.cancelable) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!framePreviewRect.width || !framePreviewRect.height) return;
    const previewSlot = getPreviewSlot();
    slotDragRef.current = {
      mode,
      originX: event.clientX,
      originY: event.clientY,
      startX: previewSlot.x * framePreviewRect.width,
      startY: previewSlot.y * framePreviewRect.height,
      startWidth: previewSlot.width * framePreviewRect.width,
      startHeight: previewSlot.height * framePreviewRect.height,
    };
    setIsDraggingSlot(true);
  };

  const previewSlot = getPreviewSlot();

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await saveSettings(form);
      setSaveStatus('saved');
    } catch (err) {
      console.error('Save settings failed:', err);
      setSaveStatus('idle');
      return;
    }
    setTimeout(() => setSaveStatus('idle'), 2500);
  };

  const handleFileUpload = useCallback(
    async (file: File, field: 'frameUrl') => {
      setUploadStatus('uploading-frame');
      setFrameUploadError(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (!result) {
          setFrameUploadError('Gagal memproses file.');
          setUploadStatus('idle');
          return;
        }

        setForm(prev => ({ ...prev, [field]: result }));
      };
      reader.onerror = () => {
        setFrameUploadError('Gagal memproses file.');
      };
      reader.readAsDataURL(file);

      try {
        const publicUrl = await uploadToCloudinary(file);

        setForm(prev => ({
          ...prev,
          [field]: publicUrl,
        }));

        try {
          await updateAppSettings({ frameUrl: publicUrl });
        } catch (updateError) {
          const message = updateError instanceof Error ? updateError.message : 'Gagal menyimpan konfigurasi.';
          setFrameUploadError(message);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Gagal mengunggah file.';
        setFrameUploadError(message);
      } finally {
        setUploadStatus('idle');
      }
    },
    []
  );

  const handleDeleteFrame = async () => {
    if (!form.frameUrl) return;
    setIsDeletingFrame(true);
    setFrameUploadError(null);

    try {
      await saveSettings({ ...form, frameUrl: null });
      setForm(prev => ({ ...prev, frameUrl: null }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus frame. Coba lagi.';
      setFrameUploadError(message);
    } finally {
      setIsDeletingFrame(false);
    }
  };

  const handleExportPDF = async () => {
    if (messages.length === 0) return;
    setPdfProgress({ current: 0, total: messages.length });
    setPdfDone(false);
    try {
      const bytes = await exportGuestbookToPDF(
        messages,
        settings,
        (current, total) => setPdfProgress({ current, total })
      );
      const safeName = settings.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
      downloadPDF(bytes, `Guestbook-${safeName}-${settings.date}.pdf`);
      setPdfDone(true);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setTimeout(() => {
        setPdfProgress(null);
        setPdfDone(false);
      }, 3000);
    }
  };

  const handleGeneratePdfLink = async () => {
    if (messages.length === 0) return;
    setPdfProgress({ current: 0, total: messages.length });
    setPdfDone(false);
    setPdfUploadError(null);
    setPdfLink(null);
    setIsGeneratingPdfLink(true);

    try {
      const bytes = await exportGuestbookToPDF(
        messages,
        settings,
        (current, total) => setPdfProgress({ current, total })
      );

      const safeName = settings.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
      const filename = `Guestbook-${safeName}-${settings.date}.pdf`;
      const publicUrl = await uploadPdfToStorage(bytes, filename);
      setPdfLink(publicUrl);
      setPdfDone(true);
    } catch (err) {
      console.error('PDF generate/upload failed:', err);
      const message = err instanceof Error ? err.message : 'Gagal membuat atau mengunggah PDF.';
      setPdfUploadError(message);
    } finally {
      setIsGeneratingPdfLink(false);
      setTimeout(() => {
        setPdfProgress(null);
        setPdfDone(false);
      }, 3000);
    }
  };

  // ──────── LOGIN SCREEN ────────
  if (!isLoggedIn) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: 'linear-gradient(160deg,#0a0a0f 0%,#110c1f 50%,#0a0a0f 100%)',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-sm mx-4"
        >
          <div
            className="rounded-3xl p-8 space-y-6"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(201,168,76,0.2)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 20px 80px rgba(0,0,0,0.5), 0 0 40px rgba(201,168,76,0.08)',
            }}
          >
            {/* Logo */}
            <div className="text-center space-y-2">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
                style={{ background: 'linear-gradient(135deg,#C9A84C,#F0D080)' }}
              >
                <Lock className="w-6 h-6 text-[#1a0e00]" />
              </div>
              <h1
                className="text-xl font-semibold text-white"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Admin Panel
              </h1>
              <p className="text-xs" style={{ color: 'rgba(201,168,76,0.6)' }}>
                Digital Guestbook System
              </p>
            </div>

            {/* Password input */}
            <div className="space-y-3">
              <input
                type="password"
                placeholder="Masukkan password admin"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                className={inputClass}
                style={inputStyle}
              />
              <AnimatePresence>
                {loginError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-red-400 flex items-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {loginError}
                  </motion.p>
                )}
              </AnimatePresence>
              <button
                onClick={handleLogin}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-98"
                style={{
                  background: 'linear-gradient(135deg,#C9A84C,#F0D080)',
                  color: '#1a0e00',
                  boxShadow: '0 4px 20px rgba(201,168,76,0.4)',
                }}
              >
                Masuk ke Dashboard
              </button>
            </div>

            <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
              Password default: admin123
            </p>
          </div>

          <button
            onClick={() => navigate('/')}
            className="w-full mt-4 text-center text-xs hover:underline transition-all"
            style={{ color: 'rgba(201,168,76,0.4)' }}
          >
            ← Kembali ke Guestbook
          </button>
        </motion.div>
      </div>
    );
  }

  // ──────── DASHBOARD ────────
  return (
    <div
      className="h-screen min-h-0 flex overflow-hidden"
      style={{ background: '#0d1117', color: '#E5E7EB' }}
    >
      {/* SIDEBAR */}
      <aside
        className="w-60 h-full flex-shrink-0 flex flex-col sticky top-0"
        style={{
          background: 'linear-gradient(180deg,#0c1220 0%,#0a0e1a 100%)',
          borderRight: '1px solid rgba(201,168,76,0.12)',
        }}
      >
        {/* Brand */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#C9A84C,#F0D080)' }}
            >
              <span className="text-[#1a0e00] font-bold text-xs">GB</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Guestbook</p>
              <p className="text-[10px]" style={{ color: 'rgba(201,168,76,0.5)' }}>Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Event name */}
        <div
          className="mx-4 mb-4 px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.12)' }}
        >
          <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'rgba(201,168,76,0.5)' }}>Event Aktif</p>
          <p className="text-sm text-white truncate font-medium">{settings.name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <div className={`w-1.5 h-1.5 rounded-full ${settings.isEnded ? 'bg-red-500' : 'bg-green-500'}`} />
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {settings.isEnded ? 'Selesai' : 'Aktif'}
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-all"
                style={{
                  background: active ? 'rgba(201,168,76,0.12)' : 'transparent',
                  color: active ? '#F0D888' : 'rgba(255,255,255,0.5)',
                  borderLeft: active ? `2px solid ${GOLD}` : '2px solid transparent',
                }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
              </button>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="p-4 space-y-2 border-t" style={{ borderColor: 'rgba(201,168,76,0.1)' }}>
          <a
            href="/guestbook/display"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-left transition-all hover:bg-white/5"
            style={{ color: 'rgba(201,168,76,0.6)' }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Buka Display
          </a>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-left transition-all hover:bg-white/5"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8 pb-12">
          {/* Connection Status Bar */}
          <div className="mb-8 flex items-center justify-between px-6 py-3 rounded-xl" style={{ 
            background: 'rgba(255,255,255,0.03)', 
            border: '1px solid rgba(201,168,76,0.1)',
          }}>
            <div className="flex items-center gap-2">
              <div 
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#10b981',
                }}
              />
              <span className="text-xs font-medium text-slate-300">Admin Dashboard - Realtime Active</span>
            </div>
            <span className="text-xs text-slate-500">Last sync: Just now</span>
          </div>

          {/* ── OVERVIEW ── */}
          {section === 'overview' && (
            <div className="space-y-8">
              <SectionTitle>Overview</SectionTitle>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Pesan" value={messages.length} sub="ucapan tersimpan" />
                <StatCard label="Status" value={settings.isEnded ? 'Selesai' : 'Aktif'}
                  color={settings.isEnded ? '#EF4444' : '#22C55E'} />
                <StatCard label="Frame" value={settings.frameUrl ? '✓' : '–'}
                  sub={settings.frameUrl ? 'Terunggah' : 'Belum ada'} />
              </div>

              {/* Event info card */}
              <div
                className="rounded-2xl p-6 space-y-4"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)' }}
              >
                <h3 className="text-sm font-semibold text-white">Informasi Event</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: Tag, label: 'Nama', value: settings.name },
                    { icon: Tag, label: 'Subtitle', value: settings.subtitle },
                    { icon: Calendar, label: 'Tanggal', value: settings.date },
                    { icon: MapPin, label: 'Tempat', value: settings.venue },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-2">
                      <item.icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
                      <div>
                        <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'rgba(201,168,76,0.5)' }}>{item.label}</p>
                        <p className="text-sm text-white">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick links */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Kiosk Display', href: '/', icon: Eye },
                  { label: 'Signage Display', href: '/guestbook/display', icon: ExternalLink },
                ].map(link => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:opacity-90"
                    style={{
                      background: 'rgba(201,168,76,0.08)',
                      border: '1px solid rgba(201,168,76,0.2)',
                      color: '#F0D888',
                    }}
                  >
                    <link.icon className="w-4 h-4" />
                    <span className="text-sm">{link.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ── SETTINGS ── */}
          {section === 'settings' && (
            <div className="space-y-6">
              <SectionTitle>Pengaturan Event</SectionTitle>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FormField label="Nama Acara">
                  <input
                    value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className={inputClass} style={inputStyle} placeholder="mis. Intan & Ari"
                  />
                </FormField>
                <FormField label="Subtitle">
                  <input
                    value={form.subtitle} onChange={e => setForm(p => ({ ...p, subtitle: e.target.value }))}
                    className={inputClass} style={inputStyle} placeholder="mis. Pernikahan Suci"
                  />
                </FormField>
                <FormField label="Tanggal">
                  <input
                    value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                    className={inputClass} style={inputStyle} placeholder="mis. 16 Mei 2026"
                  />
                </FormField>
                <FormField label="Tempat / Venue">
                  <input
                    value={form.venue} onChange={e => setForm(p => ({ ...p, venue: e.target.value }))}
                    className={inputClass} style={inputStyle} placeholder="mis. Grand Ballroom"
                  />
                </FormField>

                <FormField label="Jenis Event">
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'wedding', label: 'Wedding', icon: Heart },
                      { id: 'graduation', label: 'Wisuda', icon: GraduationCap },
                      { id: 'corporate', label: 'Corporate', icon: Briefcase },
                    ] as const).map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setForm(p => ({ ...p, eventType: opt.id }))}
                        className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs transition-all"
                        style={{
                          background: form.eventType === opt.id ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${form.eventType === opt.id ? 'rgba(201,168,76,0.5)' : 'rgba(255,255,255,0.08)'}`,
                          color: form.eventType === opt.id ? '#F0D888' : 'rgba(255,255,255,0.4)',
                        }}
                      >
                        <opt.icon className="w-4 h-4" />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </FormField>

                <FormField label="Warna Tema">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={form.themeColor}
                      onChange={e => setForm(p => ({ ...p, themeColor: e.target.value }))}
                      className="w-12 h-10 rounded-xl cursor-pointer"
                      style={{ padding: 2, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(201,168,76,0.2)' }}
                    />
                    <input
                      value={form.themeColor} onChange={e => setForm(p => ({ ...p, themeColor: e.target.value }))}
                      className={inputClass} style={inputStyle} placeholder="#D4AF37"
                    />
                  </div>
                </FormField>

                <FormField label="Password Admin">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 flex-shrink-0" style={{ color: GOLD }} />
                    <input
                      type="password" value={form.adminPassword}
                      onChange={e => setForm(p => ({ ...p, adminPassword: e.target.value }))}
                      className={inputClass} style={inputStyle} placeholder="Password baru"
                    />
                  </div>
                </FormField>

                <div className="md:col-span-2 space-y-3">
                  <div className="space-y-2">
                    <p className="text-[10px] text-white/60">
                      Cloudinary config sekarang diambil dari env vars: `VITE_CLOUDINARY_CLOUD_NAME` dan `VITE_CLOUDINARY_UPLOAD_PRESET`.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={settingsLoading || saveStatus === 'saving'}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                  style={{
                    background: settingsLoading ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#C9A84C,#F0D080)',
                    color: '#1a0e00',
                    boxShadow: '0 4px 20px rgba(201,168,76,0.35)',
                  }}
                >
                  {saveStatus === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> :
                   saveStatus === 'saved' ? <CheckCircle className="w-4 h-4" /> : null}
                  {settingsLoading ? 'Memuat pengaturan…' : saveStatus === 'saving' ? 'Menyimpan…' : saveStatus === 'saved' ? 'Tersimpan!' : 'Simpan Pengaturan'}
                </button>

                <button
                  onClick={() => setForm(settings)}
                  className="px-4 py-2.5 rounded-xl text-sm transition-all hover:bg-white/5"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {/* ── ASSETS ── */}
          {section === 'assets' && (
            <div className="space-y-8">
              <SectionTitle>Aset & Media</SectionTitle>

              {/* Frame upload */}
              <div
                className="rounded-2xl p-6 space-y-4"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)' }}
              >
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">Frame Overlay</h3>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    Unggah PNG dengan area transparan di tengah. Frame akan ditampilkan di atas canvas gambar.
                  </p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    Frame tersimpan secara permanen di server dan akan muncul lagi walaupun browser ditutup, sampai dihapus lewat dashboard ini.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Upload zone */}
                  <div
                    className="border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#C9A84C]/50 transition-all"
                    style={{ borderColor: 'rgba(201,168,76,0.25)' }}
                    onClick={() => frameInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file?.type === 'image/png') handleFileUpload(file, 'frameUrl');
                    }}
                  >
                    <Upload className="w-6 h-6" style={{ color: 'rgba(201,168,76,0.5)' }} />
                    <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      Klik atau drop file PNG di sini
                    </p>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); frameInputRef.current?.click(); }}
                      className="px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:bg-white/10"
                      style={{ color: '#F0D888', background: 'rgba(255,255,255,0.04)' }}
                    >
                      Pilih file
                    </button>
                    <input ref={frameInputRef} type="file" accept="image/png" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, 'frameUrl'); }} />
                    {uploadStatus === 'uploading-frame' && (
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.8)' }}>Memproses frame…</p>
                    )}
                  </div>


                  {/* Preview */}
                  <div
                    className="rounded-xl overflow-hidden flex items-center justify-center"
                    style={{
                      background: 'repeating-conic-gradient(rgba(255,255,255,0.05) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px',
                      minHeight: 140,
                      position: 'relative',
                    }}
                  >
                    {form.frameUrl ? (
                      <div ref={framePreviewRef} className="relative" style={{ width: '100%', minHeight: 180, height: 180, maxHeight: 180 }}>
                        <img
                          ref={frameImageRef}
                          src={form.frameUrl}
                          alt="Frame preview"
                          className="w-full h-full object-contain block"
                          style={{ background: 'rgba(255,255,255,0.04)' }}
                          onLoad={(event) => {
                            const target = event.currentTarget;
                            setForm(prev => ({
                              ...prev,
                              frameWidth: target.naturalWidth,
                              frameHeight: target.naturalHeight,
                            }));
                            updatePreviewRect();
                          }}
                        />
                        <div
                          className="absolute rounded-2xl border border-dashed border-[#C9A84C] bg-[#C9A84C]/10 cursor-move"
                          style={{
                            top: `${framePreviewRect.top + previewSlot.y * framePreviewRect.height}px`,
                            left: `${framePreviewRect.left + previewSlot.x * framePreviewRect.width}px`,
                            width: `${previewSlot.width * framePreviewRect.width}px`,
                            height: `${previewSlot.height * framePreviewRect.height}px`,
                            pointerEvents: 'auto',
                          }}
                          onPointerDown={handleSlotPointerDown('move')}
                        >
                          <div
                            className="absolute right-1 bottom-1 w-4 h-4 rounded-full bg-white border border-[#C9A84C]/70 cursor-se-resize"
                            onPointerDown={handleSlotPointerDown('resize')}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>Preview frame</p>
                    )}
                  </div>
                </div>
                {form.frameUrl && (
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    {[
                      { label: 'X (%)', value: previewSlot.x * 100, field: 'frameSlotX' },
                      { label: 'Y (%)', value: previewSlot.y * 100, field: 'frameSlotY' },
                      { label: 'Lebar (%)', value: previewSlot.width * 100, field: 'frameSlotWidth' },
                      { label: 'Tinggi (%)', value: previewSlot.height * 100, field: 'frameSlotHeight' },
                    ].map((item) => (
                      <div key={item.label} className="space-y-1">
                        <label className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(201,168,76,0.7)' }}>
                          {item.label}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={item.value.toFixed(1)}
                          onChange={e => {
                            const raw = Number(e.target.value);
                            if (Number.isNaN(raw)) return;
                            const normalized = clamp(raw / 100, 0, 1);
                            setForm(prev => ({
                              ...prev,
                              [item.field]: normalized,
                            }));
                          }}
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {form.frameUrl && (
                  <button
                    type="button"
                    onClick={() => setForm(p => ({
                      ...p,
                      frameSlotX: DEFAULT_FRAME_SLOT.x,
                      frameSlotY: DEFAULT_FRAME_SLOT.y,
                      frameSlotWidth: DEFAULT_FRAME_SLOT.width,
                      frameSlotHeight: DEFAULT_FRAME_SLOT.height,
                    }))}
                    className="mt-3 px-4 py-2 rounded-xl text-sm transition-all hover:bg-white/5"
                    style={{ color: '#F0D888', border: '1px solid rgba(240,216,136,0.25)' }}
                  >
                    Reset Slot Frame ke Default
                  </button>
                )}

                {form.frameUrl && (
                  <button
                    type="button"
                    onClick={handleDeleteFrame}
                    disabled={isDeletingFrame}
                    className="flex items-center gap-2 text-xs transition-all"
                    style={{
                      color: isDeletingFrame ? 'rgba(255,255,255,0.4)' : 'rgba(255,100,100,0.8)',
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isDeletingFrame ? 'Menghapus frame…' : 'Hapus frame permanen'}
                  </button>
                )}
                {frameUploadError && (
                  <p className="text-xs text-red-300">{frameUploadError}</p>
                )}
              </div>

              {/* Save assets */}
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg,#C9A84C,#F0D080)',
                  color: '#1a0e00',
                  boxShadow: '0 4px 20px rgba(201,168,76,0.35)',
                }}
              >
                {saveStatus === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {saveStatus === 'saving' ? 'Menyimpan…' : saveStatus === 'saved' ? 'Tersimpan!' : 'Simpan Aset'}
              </button>
            </div>
          )}

          {/* ── MESSAGES (NEW REALTIME) ── */}
          {section === 'messages' && <MessagesTab />}

          {/* ── ANALYTICS ── */}
          {section === 'analytics' && <AnalyticsTab />}

          {/* ── EXPORT & CONTROL ── */}
          {section === 'export' && (
            <div className="space-y-8">
              <SectionTitle>Ekspor & Kontrol Event</SectionTitle>

              {/* PDF Export */}
              <div
                className="rounded-2xl p-6 space-y-4"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)' }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(201,168,76,0.12)' }}
                  >
                    <FileDown className="w-5 h-5" style={{ color: GOLD }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Export ke PDF</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      Setiap pesan akan dicetak 1 halaman A4 dengan frame, nama acara, dan nomor halaman.
                    </p>
                  </div>
                </div>

                {pdfProgress ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {pdfDone ? 'PDF berhasil dibuat!' : `Memproses ${pdfProgress.current} / ${pdfProgress.total} pesan…`}
                      </span>
                      <span style={{ color: GOLD }}>
                        {Math.round((pdfProgress.current / pdfProgress.total) * 100)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg,#C9A84C,#F0D080)' }}
                        animate={{ width: `${(pdfProgress.current / pdfProgress.total) * 100}%` }}
                        transition={{ ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      onClick={handleExportPDF}
                      disabled={messages.length === 0}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        background: 'linear-gradient(135deg,#C9A84C,#F0D080)',
                        color: '#1a0e00',
                        boxShadow: '0 4px 20px rgba(201,168,76,0.35)',
                      }}
                    >
                      <FileDown className="w-4 h-4" />
                      Export {messages.length} Pesan ke PDF
                    </button>

                    <button
                      onClick={handleGeneratePdfLink}
                      disabled={messages.length === 0 || isGeneratingPdfLink}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,0.12)',
                      }}
                    >
                      <ExternalLink className="w-4 h-4" />
                      {isGeneratingPdfLink ? 'Membuat QR...' : 'Buat QR Download PDF'}
                    </button>
                  </div>
                )}

                {pdfUploadError && (
                  <p className="text-xs text-red-300" style={{ color: 'rgba(248,113,113,0.9)' }}>
                    {pdfUploadError}
                  </p>
                )}

                {pdfLink && (
                  <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(8px)' }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="QR download PDF"
                  >
                    <div
                      className="relative w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl"
                      style={{
                        background: '#172033',
                        border: '1px solid rgba(201,168,76,0.3)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setPdfLink(null)}
                        className="absolute right-3 top-3 rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                        aria-label="Tutup QR"
                      >
                        <X className="h-5 w-5" />
                      </button>

                      <p className="mb-4 pr-8 text-base font-semibold text-white">
                        Scan QR untuk download PDF
                      </p>

                      <div className="mx-auto w-fit rounded-xl bg-white p-3">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pdfLink)}`}
                          alt="QR code download PDF"
                          className="block h-auto w-[min(64vw,256px)] max-h-[58vh] object-contain"
                        />
                      </div>

                      <a
                        href={pdfLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 block text-sm font-semibold text-[#F0D080] underline"
                      >
                        Buka link PDF di perangkat lain
                      </a>
                      <p className="mt-2 text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                        Scan QR ini dengan ponsel untuk membuka dan mendownload hasil PDF.
                      </p>
                    </div>
                  </div>
                )}

                {messages.length === 0 && (
                  <p className="text-xs flex items-center gap-1.5" style={{ color: 'rgba(255,200,100,0.5)' }}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Belum ada pesan untuk diekspor
                  </p>
                )}
              </div>

              {/* Event Control */}
              <div
                className="rounded-2xl p-6 space-y-4"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}
              >
                <h3 className="text-sm font-semibold text-white">Kontrol Event</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* End/Resume event */}
                  <div
                    className="rounded-xl p-4 space-y-3"
                    style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    <div className="flex items-center gap-2">
                      <Power className="w-4 h-4 text-red-400" />
                      <p className="text-sm text-white">
                        {settings.isEnded ? 'Aktifkan Kembali' : 'Akhiri Event'}
                      </p>
                    </div>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {settings.isEnded
                        ? 'Buka kembali penerimaan pesan tamu'
                        : 'Menonaktifkan input pesan baru. Tampilkan overlay "Acara Selesai".'}
                    </p>
                    <button
                      onClick={() => settings.isEnded
                        ? saveSettings({ ...settings, isEnded: false })
                        : setEndConfirm(true)
                      }
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90"
                      style={{
                        background: settings.isEnded ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                        color: settings.isEnded ? '#4ade80' : '#f87171',
                        border: `1px solid ${settings.isEnded ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      }}
                    >
                      <Power className="w-3.5 h-3.5" />
                      {settings.isEnded ? 'Aktifkan Kembali' : 'Akhiri Sekarang'}
                    </button>
                  </div>

                  {/* Reset data */}
                  <div
                    className="rounded-xl p-4 space-y-3"
                    style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)' }}
                  >
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-yellow-400" />
                      <p className="text-sm text-white">Reset Semua Data</p>
                    </div>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      Hapus semua pesan dan mulai event baru. Tidak dapat dibatalkan.
                    </p>
                    <button
                      onClick={() => setResetConfirm(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90"
                      style={{
                        background: 'rgba(251,191,36,0.12)',
                        color: '#fbbf24',
                        border: '1px solid rgba(251,191,36,0.25)',
                      }}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Reset Data Event
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ─── CONFIRM DIALOGS ─── */}
      {/* Delete single */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 10 }}
              className="rounded-2xl p-6 max-w-xs mx-4 space-y-4"
              style={{ background: '#1a2030', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              <h3 className="text-base font-semibold text-white">Hapus pesan?</h3>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Pesan ini akan dihapus secara permanen.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2 rounded-xl text-sm text-white/50 hover:bg-white/5 transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={() => { deleteMessage(deleteConfirm); setDeleteConfirm(null); }}
                  className="flex-1 py-2 rounded-xl text-sm text-red-400 font-medium transition-all hover:bg-red-500/10"
                  style={{ border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  Hapus
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset all */}
      <AnimatePresence>
        {resetConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 10 }}
              className="rounded-2xl p-6 max-w-xs mx-4 space-y-4"
              style={{ background: '#1a2030', border: '1px solid rgba(251,191,36,0.25)' }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <h3 className="text-base font-semibold text-white">Reset semua data?</h3>
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Semua {messages.length} pesan akan dihapus. Tindakan ini tidak dapat dibatalkan.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setResetConfirm(false)}
                  className="flex-1 py-2 rounded-xl text-sm text-white/50 hover:bg-white/5 transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={() => {
                    clearMessages();
                    saveSettings({ ...settings, isEnded: false });
                    setResetConfirm(false);
                  }}
                  className="flex-1 py-2 rounded-xl text-sm text-yellow-400 font-medium transition-all hover:bg-yellow-500/10"
                  style={{ border: '1px solid rgba(251,191,36,0.25)' }}
                >
                  Reset
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* End event */}
      <AnimatePresence>
        {endConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 10 }}
              className="rounded-2xl p-6 max-w-xs mx-4 space-y-4"
              style={{ background: '#1a2030', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              <div className="flex items-center gap-2">
                <Power className="w-5 h-5 text-red-400" />
                <h3 className="text-base font-semibold text-white">Akhiri event?</h3>
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Tamu tidak dapat lagi mengirim pesan. Tampilkan overlay "Acara Selesai" pada layar signage.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setEndConfirm(false)}
                  className="flex-1 py-2 rounded-xl text-sm text-white/50 hover:bg-white/5 transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={() => {
                    saveSettings({ ...settings, isEnded: true });
                    setEndConfirm(false);
                  }}
                  className="flex-1 py-2 rounded-xl text-sm text-red-400 font-medium transition-all hover:bg-red-500/10"
                  style={{ border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  Ya, Akhiri
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}