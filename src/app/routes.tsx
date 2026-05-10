import { createBrowserRouter, Link, Outlet, useRouteError } from 'react-router';
import { GuestbookProvider } from './contexts/GuestbookContext';
import { GuestbookKiosk } from './pages/GuestbookKiosk';
import { DisplayPage } from './pages/DisplayPage';
import { AdminDashboard } from './pages/AdminDashboard';

function Root() {
  return (
    <GuestbookProvider>
      <Outlet />
    </GuestbookProvider>
  );
}

function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#0a0a0f' }}
    >
      <div className="text-center space-y-4">
        <p className="text-6xl" style={{ color: 'rgba(201,168,76,0.4)' }}>404</p>
        <p className="text-white/50 font-serif">Halaman tidak ditemukan</p>
        <a
          href="/"
          className="block text-sm hover:underline"
          style={{ color: 'rgba(201,168,76,0.6)' }}
        >
          Kembali ke Guestbook
        </a>
      </div>
    </div>
  );
}

function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : 'Terjadi kesalahan tak terduga.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-white">
      <div className="max-w-lg rounded-3xl border border-white/10 bg-slate-950/90 p-8 text-center shadow-2xl">
        <p className="text-2xl font-semibold">Oops! Ada masalah.</p>
        <p className="mt-4 text-sm text-slate-300">{message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            to="/"
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-200"
          >
            Kembali ke Guestbook
          </Link>
        </div>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    errorElement: <RouteError />,
    children: [
      { index: true, Component: GuestbookKiosk },
      { path: 'guestbook/display', Component: DisplayPage },
      { path: 'guestbook/admin', Component: AdminDashboard },
      { path: '*', Component: NotFound },
    ],
  },
]);
