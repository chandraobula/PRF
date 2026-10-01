import { useEffect, useState } from 'react';
import { Bell, CheckCheck, ChevronRight, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { listNotifications, markAllNotificationsRead, markNotification } from '../services/notificationsApi';

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listNotifications().then((result) => setItems(result.notifications || []))
      .catch((reason) => setError(reason.message || 'Could not load notifications.'))
      .finally(() => setLoading(false));
  }, []);

  const open = async (item) => {
    if (item.status === 'unread') {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'read' } : entry));
      markNotification(item.id).catch(() => {});
    }
    navigate(item.targetUrl || '/finance');
  };

  const dismiss = async (event, item) => {
    event.stopPropagation();
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    try { await markNotification(item.id, 'dismissed'); } catch { setError('Could not dismiss that reminder.'); }
  };

  const readAll = async () => {
    setItems((current) => current.map((item) => ({ ...item, status: 'read' })));
    try { await markAllNotificationsRead(); } catch { setError('Could not mark reminders as read.'); }
  };

  return <div className="max-w-3xl mx-auto pb-12">
    <section className="mb-6 flex items-start justify-between gap-4">
      <div><h1 className="font-display text-4xl font-bold tracking-tight">Notifications</h1><p className="mt-2 text-on-surface-variant">Gentle reminders, only when they are useful.</p></div>
      {items.some((item) => item.status === 'unread') && <button type="button" onClick={readAll} className="min-h-11 px-4 rounded-xl bg-surface-container-low text-sm font-bold inline-flex items-center gap-2"><CheckCheck className="w-4 h-4" /> Read all</button>}
    </section>
    {error && <p className="mb-4 rounded-xl bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}
    {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div> : items.length === 0 ? (
      <section className="settings-card p-10 text-center"><Bell className="w-10 h-10 mx-auto text-text-muted" /><h2 className="mt-4 font-display text-xl font-bold">You’re all caught up</h2><p className="mt-2 text-sm text-text-muted">Finance reminders will appear here during your chosen time window.</p></section>
    ) : <div className="space-y-3">{items.map((item) => <div key={item.id} role="button" tabIndex={0} onClick={() => open(item)} onKeyDown={(event) => event.key === 'Enter' && open(item)} className="settings-card w-full p-4 sm:p-5 flex items-start gap-4 text-left hover:border-secondary/30 transition-colors cursor-pointer">
      <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${item.status === 'unread' ? 'bg-secondary' : 'bg-surface-container-highest'}`} />
      <span className="flex-1 min-w-0"><span className="block font-bold text-on-surface">{item.title}</span><span className="block mt-1 text-sm leading-6 text-on-surface-variant">{item.body}</span><span className="block mt-2 text-xs text-text-muted">{new Date(item.createdAt).toLocaleString()}</span></span>
      <span className="flex items-center gap-1"><button type="button" aria-label="Dismiss" onClick={(event) => dismiss(event, item)} className="icon-button"><X className="w-4 h-4" /></button><ChevronRight className="w-5 h-5 text-text-muted" /></span>
    </div>)}</div>}
  </div>;
}
