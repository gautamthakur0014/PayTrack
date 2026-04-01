import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  LayoutDashboard, Receipt, Users, UserCheck, Bell,
  BarChart2, User, LogOut, Menu, X, ChevronRight,
  Wifi, WifiOff, Sun, Moon, MessageSquare, RefreshCw
} from 'lucide-react';
import { logoutUser } from '../../store/slices/authSlice';
import { fetchNotifications } from '../../store/slices/notificationsSlice';
import { syncOfflineQueue, setSyncPending } from '../../store/slices/expensesSlice';
import Avatar from '../ui/Avatar';
import { setupPushNotifications } from '../../services/pushNotifications';
import { useTheme } from '../../context/ThemeContext';
import { idb } from '../../db/idb';

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/groups', icon: Users, label: 'Groups' },
  { to: '/connections', icon: UserCheck, label: 'Connections' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/notifications', icon: Bell, label: 'Notifications', badge: true },
  { to: '/feedback', icon: MessageSquare, label: 'Feedback' },
];

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const wasOffline = useRef(!navigator.onLine);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector(s => s.auth);
  const unread = useSelector(s => s.notifications.unreadCount);
  const syncPending = useSelector(s => s.expenses.syncPending);
  const { theme, toggle } = useTheme();

  // ── Check queue count on mount ────────────────────────────────────────────
  useEffect(() => {
    idb.syncQueue.getAll().then(items => {
      if (items.length > 0) dispatch(setSyncPending(items.length));
    }).catch(() => {});
  }, [dispatch]);

  // ── Track online/offline ──────────────────────────────────────────────────
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      // Only trigger sync if we just came back from offline
      if (wasOffline.current) {
        wasOffline.current = false;
        const queue = await idb.syncQueue.getAll().catch(() => []);
        if (queue.length > 0) {
          setSyncing(true);
          await dispatch(syncOfflineQueue());
          setSyncing(false);
        }
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      wasOffline.current = true;
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [dispatch]);

  useEffect(() => {
    if (user && isOnline) setupPushNotifications();
  }, [user, isOnline]);

  useEffect(() => {
    if (!isOnline) return;
    dispatch(fetchNotifications({ limit: 5 }));
    const interval = setInterval(() => dispatch(fetchNotifications({ limit: 5 })), 60000);
    return () => clearInterval(interval);
  }, [dispatch, isOnline]);

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate('/login');
  };

  const handleManualSync = async () => {
    if (!isOnline || syncing) return;
    setSyncing(true);
    await dispatch(syncOfflineQueue());
    setSyncing(false);
  };

  // ── Status pill ───────────────────────────────────────────────────────────
  const StatusPill = () => {
    if (syncing) {
      return (
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400">
          <RefreshCw size={12} className="animate-spin" />
          Syncing…
        </div>
      );
    }
    if (!isOnline) {
      return (
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-500/10 text-yellow-500">
          <WifiOff size={12} />
          Offline{syncPending > 0 ? ` — ${syncPending} queued` : ' — cached data'}
        </div>
      );
    }
    if (syncPending > 0) {
      return (
        <button
          onClick={handleManualSync}
          className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors"
        >
          <RefreshCw size={12} />
          {syncPending} unsynced — tap to sync
        </button>
      );
    }
    return (
      <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-500">
        <Wifi size={12} />
        Online
      </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden page-bg bg-mesh">
      {open && <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 flex flex-col sidebar-bg backdrop-blur-xl
        transform transition-transform duration-300 ease-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shadow-glow">
              <span className="text-white font-display font-bold text-sm">PT</span>
            </div>
            <span className="font-display font-bold text-primary-custom text-lg tracking-tight">PayTrack</span>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden text-muted-custom hover:text-secondary-custom p-1 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Status + theme toggle */}
        <div className="px-4 pt-3 flex items-center gap-2">
          <StatusPill />
          <button
            onClick={toggle}
            className="p-2 rounded-lg transition-colors text-muted-custom hover:text-teal-400"
            style={{ background: 'var(--bg-input)' }}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 pt-3 space-y-0.5 overflow-y-auto scrollbar-hide">
          {NAV.map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) => isActive ? 'nav-link-active' : 'nav-link'}
            >
              <Icon size={17} />
              <span className="flex-1">{label}</span>
              {badge && unread > 0 && (
                <span className="bg-teal-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-3 space-y-1" style={{ borderTop: '1px solid var(--border)' }}>
          <NavLink to="/profile" onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'nav-link-active' : 'nav-link'}>
            <Avatar user={user} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary-custom truncate">{user?.displayName || user?.username}</p>
              <p className="text-xs text-muted-custom truncate">{user?.email}</p>
            </div>
            <ChevronRight size={14} className="text-muted-custom" />
          </NavLink>
          <button onClick={handleLogout} className="nav-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
            <LogOut size={17} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center gap-3 px-4 py-3 lg:hidden"
          style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <button onClick={() => setOpen(true)} className="text-muted-custom hover:text-secondary-custom p-1.5 rounded-lg">
            <Menu size={20} />
          </button>
          <span className="font-display font-bold text-primary-custom">PayTrack</span>
          <div className="ml-auto flex items-center gap-2">
            {syncPending > 0 && isOnline && (
              <button onClick={handleManualSync} className="p-2 rounded-lg text-orange-400 hover:text-orange-300">
                <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
              </button>
            )}
            <button onClick={toggle} className="p-2 rounded-lg text-muted-custom hover:text-teal-400">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <NavLink to="/notifications" className="relative p-2 text-muted-custom hover:text-secondary-custom">
              <Bell size={20} />
              {unread > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-teal-500 rounded-full" />}
            </NavLink>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
