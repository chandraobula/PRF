import { useState, useEffect, useCallback } from 'react';
import {
  Users, Activity, ShieldCheck, ShieldAlert, Crown, Ban,
  Search, ChevronRight, ChevronLeft, Trash2, UserCog, Megaphone,
  Settings2, ScrollText, RefreshCw, Loader2, AlertTriangle, Info,
  Plus, X, Eye, Check,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { isOwner } from '../lib/session';
import {
  getAdminDashboard, listAdminUsers, getAdminUser, updateAdminUser,
  deleteAdminUser, listAuditLog, getAdminConfig, updateAdminConfig,
  listAdminAnnouncements, createAnnouncement, updateAnnouncement,
  deleteAnnouncement,
} from '../services/adminApi';
import { getCurrentAccount } from '../services/authApi';

const tabs = [
  { id: 'overview', icon: Activity, label: 'Overview' },
  { id: 'users', icon: Users, label: 'Users' },
  { id: 'audit', icon: ScrollText, label: 'Audit Log' },
  { id: 'config', icon: Settings2, label: 'Config' },
  { id: 'announcements', icon: Megaphone, label: 'Announcements' },
];

const roleColors = {
  owner: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  admin: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  user: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  suspended: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

const roleIcons = { owner: Crown, admin: ShieldCheck, user: Users, suspended: Ban };

function RoleBadge({ role }) {
  const Icon = roleIcons[role] || Users;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold capitalize', roleColors[role] || roleColors.user)}>
      <Icon className="w-3.5 h-3.5" />
      {role}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = 'bg-primary/10 text-primary' }) {
  return (
    <div className="app-card p-4 sm:p-5 flex items-start gap-4">
      <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-display font-bold text-on-surface">{value}</p>
        <p className="text-sm text-text-muted mt-0.5">{label}</p>
        {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-container-low flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-text-muted" />
      </div>
      <p className="font-display font-bold text-on-surface">{title}</p>
      <p className="mt-1 text-sm text-text-muted max-w-xs">{description}</p>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ dashboard, loading }) {
  if (loading) return <LoadingSpinner />;
  if (!dashboard) return null;

  const { stats, recentAuditLog } = dashboard;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={Users} label="Total Users" value={stats.totalUsers} sub={`+${stats.newUsersLast7Days} this week`} />
        <StatCard icon={Activity} label="Active Sessions" value={stats.activeSessions} color="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={ScrollText} label="Transactions" value={stats.totalTransactions.toLocaleString()} color="bg-violet-500/10 text-violet-600" />
        <StatCard icon={Megaphone} label="Notes" value={stats.totalNotes} color="bg-amber-500/10 text-amber-600" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="app-card">
          <div className="p-4 sm:p-5 border-b border-border-subtle">
            <h3 className="font-display font-bold text-on-surface">Role Breakdown</h3>
          </div>
          <div className="p-4 sm:p-5 space-y-3">
            {Object.entries(stats.roleBreakdown || {}).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between">
                <RoleBadge role={role} />
                <span className="text-sm font-bold text-on-surface">{count}</span>
              </div>
            ))}
            {Object.keys(stats.roleBreakdown || {}).length === 0 && (
              <p className="text-sm text-text-muted">No users yet.</p>
            )}
          </div>
        </section>

        <section className="app-card">
          <div className="p-4 sm:p-5 border-b border-border-subtle">
            <h3 className="font-display font-bold text-on-surface">Platform Resources</h3>
          </div>
          <div className="p-4 sm:p-5 space-y-3">
            {[
              ['Pantry Items', stats.totalPantryItems],
              ['Vehicles', stats.totalVehicles],
              ['Subscriptions', stats.totalSubscriptions],
            ].map(([label, count]) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-text-muted">{label}</span>
                <span className="font-bold text-on-surface">{count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {recentAuditLog && recentAuditLog.length > 0 && (
        <section className="app-card">
          <div className="p-4 sm:p-5 border-b border-border-subtle">
            <h3 className="font-display font-bold text-on-surface">Recent Admin Activity</h3>
          </div>
          <div className="divide-y divide-border-subtle">
            {recentAuditLog.slice(0, 5).map((entry) => (
              <div key={entry.id} className="px-4 sm:px-5 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-text-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-on-surface truncate">
                    {entry.actorEmail || entry.actorId} — <span className="text-text-muted font-normal">{entry.action}</span>
                  </p>
                  <p className="text-xs text-text-muted">{new Date(entry.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ currentUser }) {
  const [users, setUsers] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const limit = 20;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAdminUsers({ search: search || undefined, role: roleFilter || undefined, limit, offset });
      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, offset]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openDetail = async (userId) => {
    setDetailLoading(true);
    try {
      const data = await getAdminUser(userId);
      setSelectedUser(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(true);
    setError('');
    try {
      const data = await updateAdminUser(userId, { role: newRole });
      setSelectedUser(data.user);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Permanently delete this user and ALL their data? This cannot be undone.')) return;
    setActionLoading(true);
    setError('');
    try {
      await deleteAdminUser(userId);
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search users by name or email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            className="w-full h-11 pl-9 pr-3 rounded-xl bg-surface-container-low border border-border-subtle text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setOffset(0); }}
          className="h-11 px-3 rounded-xl bg-surface-container-low border border-border-subtle text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-secondary"
        >
          <option value="">All roles</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}

      <section className="app-card overflow-hidden">
        {loading ? <LoadingSpinner /> : users.items.length === 0 ? (
          <EmptyState icon={Users} title="No users found" description="Try changing your filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-container-low/50">
                    <th className="text-left px-4 py-3 font-bold text-text-muted">User</th>
                    <th className="text-left px-4 py-3 font-bold text-text-muted hidden sm:table-cell">Role</th>
                    <th className="text-left px-4 py-3 font-bold text-text-muted hidden md:table-cell">Transactions</th>
                    <th className="text-left px-4 py-3 font-bold text-text-muted hidden md:table-cell">Sessions</th>
                    <th className="text-left px-4 py-3 font-bold text-text-muted hidden lg:table-cell">Joined</th>
                    <th className="px-4 py-3 w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {users.items.map((u) => (
                    <tr key={u.id} className="hover:bg-surface-container-low/30 transition-colors cursor-pointer" onClick={() => openDetail(u.id)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-bold text-xs shrink-0">
                            {(u.displayName || u.email || '?')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-on-surface truncate">{u.displayName || '—'}</p>
                            <p className="text-xs text-text-muted truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell"><RoleBadge role={u.role} /></td>
                      <td className="px-4 py-3 hidden md:table-cell font-semibold text-on-surface">{u.transactionCount}</td>
                      <td className="px-4 py-3 hidden md:table-cell font-semibold text-on-surface">{u.activeSessions}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4 text-text-muted" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
              <p className="text-xs text-text-muted">{users.total} user{users.total !== 1 ? 's' : ''} total</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  className="icon-button disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={offset + limit >= users.total}
                  onClick={() => setOffset(offset + limit)}
                  className="icon-button disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* User Detail Drawer */}
      {(selectedUser || detailLoading) && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={() => setSelectedUser(null)} aria-label="Close" />
          <aside className="absolute inset-y-0 right-0 w-full max-w-md bg-surface-card shadow-2xl overflow-y-auto animate-in slide-in-from-right">
            {detailLoading ? <LoadingSpinner /> : selectedUser && (
              <div className="p-5 sm:p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-display text-xl font-bold text-on-surface">User Detail</h3>
                  <button type="button" onClick={() => setSelectedUser(null)} className="icon-button"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-display font-bold text-xl">
                    {(selectedUser.displayName || selectedUser.email || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-display font-bold text-lg text-on-surface">{selectedUser.displayName || '—'}</p>
                    <p className="text-sm text-text-muted">{selectedUser.email}</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-muted">Role</span>
                    <RoleBadge role={selectedUser.role} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-muted">Joined</span>
                    <span className="text-sm font-semibold text-on-surface">{new Date(selectedUser.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-muted">Last Seen</span>
                    <span className="text-sm font-semibold text-on-surface">{selectedUser.lastSeenAt ? new Date(selectedUser.lastSeenAt).toLocaleString() : 'Never'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-muted">Active Sessions</span>
                    <span className="text-sm font-bold text-on-surface">{selectedUser.activeSessions}</span>
                  </div>
                </div>

                {selectedUser.stats && (
                  <section className="rounded-xl bg-surface-container-low p-4 mb-6">
                    <p className="text-xs font-bold tracking-wide uppercase text-text-muted mb-3">Resource Usage</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['Transactions', selectedUser.stats.transactions],
                        ['Pantry Items', selectedUser.stats.pantryItems],
                        ['Vehicles', selectedUser.stats.vehicles],
                        ['Subscriptions', selectedUser.stats.subscriptions],
                        ['Notes', selectedUser.stats.notes],
                      ].map(([label, count]) => (
                        <div key={label} className="text-sm">
                          <span className="text-text-muted">{label}</span>
                          <p className="font-bold text-on-surface">{count}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Actions — only show if target is not owner */}
                {selectedUser.role !== 'owner' && (
                  <div className="space-y-3 pt-4 border-t border-border-subtle">
                    <p className="text-xs font-bold tracking-wide uppercase text-text-muted">Actions</p>

                    {selectedUser.role !== 'suspended' ? (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleRoleChange(selectedUser.id, 'suspended')}
                        className="w-full min-h-11 flex items-center justify-center gap-2 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm font-bold hover:bg-amber-500/15"
                      >
                        <Ban className="w-4 h-4" /> Suspend User
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleRoleChange(selectedUser.id, 'user')}
                        className="w-full min-h-11 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm font-bold hover:bg-emerald-500/15"
                      >
                        <Check className="w-4 h-4" /> Unsuspend User
                      </button>
                    )}

                    {isOwner(currentUser) && selectedUser.role !== 'admin' && selectedUser.role !== 'suspended' && (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleRoleChange(selectedUser.id, 'admin')}
                        className="w-full min-h-11 flex items-center justify-center gap-2 rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-400 text-sm font-bold hover:bg-violet-500/15"
                      >
                        <ShieldCheck className="w-4 h-4" /> Promote to Admin
                      </button>
                    )}

                    {isOwner(currentUser) && selectedUser.role === 'admin' && (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleRoleChange(selectedUser.id, 'user')}
                        className="w-full min-h-11 flex items-center justify-center gap-2 rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-400 text-sm font-bold hover:bg-sky-500/15"
                      >
                        <UserCog className="w-4 h-4" /> Demote to User
                      </button>
                    )}

                    {isOwner(currentUser) && (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleDelete(selectedUser.id)}
                        className="w-full min-h-11 flex items-center justify-center gap-2 rounded-xl bg-error/10 text-error text-sm font-bold hover:bg-error/15"
                      >
                        <Trash2 className="w-4 h-4" /> Delete User Permanently
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

function AuditTab() {
  const [entries, setEntries] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 30;

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAuditLog({ action: actionFilter || undefined, limit, offset });
      setEntries(data.entries);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [actionFilter, offset]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setOffset(0); }}
          className="h-11 px-3 rounded-xl bg-surface-container-low border border-border-subtle text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-secondary"
        >
          <option value="">All actions</option>
          <option value="user">User actions</option>
          <option value="config">Config changes</option>
          <option value="announcement">Announcements</option>
        </select>
        <button type="button" onClick={fetchLog} className="icon-button"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <section className="app-card overflow-hidden">
        {loading ? <LoadingSpinner /> : entries.items.length === 0 ? (
          <EmptyState icon={ScrollText} title="No audit entries" description="Admin actions will appear here." />
        ) : (
          <>
            <div className="divide-y divide-border-subtle">
              {entries.items.map((entry) => (
                <div key={entry.id} className="px-4 sm:px-5 py-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldAlert className="w-4 h-4 text-text-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-on-surface">
                      {entry.action}
                      {entry.targetType && <span className="text-text-muted font-normal"> on {entry.targetType}</span>}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      by {entry.actorEmail || entry.actorId} · {new Date(entry.createdAt).toLocaleString()}
                      {entry.ipAddress && ` · ${entry.ipAddress}`}
                    </p>
                    {Object.keys(entry.details || {}).length > 0 && (
                      <pre className="mt-1 text-xs text-text-muted bg-surface-container-low rounded-lg p-2 overflow-x-auto">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
              <p className="text-xs text-text-muted">{entries.total} entries</p>
              <div className="flex gap-2">
                <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="icon-button disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                <button type="button" disabled={offset + limit >= entries.total} onClick={() => setOffset(offset + limit)} className="icon-button disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ─── Config Tab ───────────────────────────────────────────────────────────────

function ConfigTab({ currentUser }) {
  const [config, setConfig] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edits, setEdits] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const ownerAccess = isOwner(currentUser);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await getAdminConfig();
        setConfig(data.config);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateAdminConfig(edits);
      setSuccess('Configuration saved.');
      setEdits({});
      const data = await getAdminConfig();
      setConfig(data.config);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {!ownerAccess && (
        <div className="rounded-xl bg-amber-500/10 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Only the owner can modify configuration.</p>
        </div>
      )}

      {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}
      {success && <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{success}</p>}

      <section className="app-card overflow-hidden">
        <div className="divide-y divide-border-subtle">
          {config.map((item) => (
            <div key={item.key} className="px-4 sm:px-5 py-4 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-on-surface font-mono">{item.key}</p>
                <p className="text-xs text-text-muted mt-0.5">Last updated: {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '—'}</p>
              </div>
              <input
                type="text"
                disabled={!ownerAccess}
                defaultValue={item.value}
                onChange={(e) => setEdits({ ...edits, [item.key]: e.target.value })}
                className="w-40 sm:w-56 h-10 px-3 rounded-xl bg-surface-container-low border border-border-subtle text-sm font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary disabled:opacity-60"
              />
            </div>
          ))}
          {config.length === 0 && <EmptyState icon={Settings2} title="No configuration" description="Platform config will appear here." />}
        </div>
        {ownerAccess && Object.keys(edits).length > 0 && (
          <div className="px-4 py-3 border-t border-border-subtle flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="min-h-11 px-5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Announcements Tab ────────────────────────────────────────────────────────

function AnnouncementsTab() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', severity: 'info' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAdminAnnouncements();
      setAnnouncements(data.announcements);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createAnnouncement(form);
      setForm({ title: '', body: '', severity: 'info' });
      setShowForm(false);
      fetchAnnouncements();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id, currentlyActive) => {
    try {
      await updateAnnouncement(id, { isActive: !currentlyActive });
      fetchAnnouncements();
    } catch {
      /* ignore */
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await deleteAnnouncement(id);
      fetchAnnouncements();
    } catch {
      /* ignore */
    }
  };

  const severityStyles = {
    info: 'bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-400',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400',
    critical: 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400',
  };

  const severityIcons = { info: Info, warning: AlertTriangle, critical: ShieldAlert };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-on-surface">System Announcements</h3>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="min-h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="app-card p-4 sm:p-5 space-y-4">
          <label className="settings-field">
            <span>Title</span>
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Announcement title" required />
          </label>
          <label className="settings-field">
            <span>Body</span>
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Announcement body…" rows={3} required className="resize-none" />
          </label>
          <label className="settings-field">
            <span>Severity</span>
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="min-h-10 px-4 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-10 px-5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Publish
            </button>
          </div>
        </form>
      )}

      {loading ? <LoadingSpinner /> : announcements.length === 0 ? (
        <section className="app-card">
          <EmptyState icon={Megaphone} title="No announcements" description="Create an announcement to notify all users." />
        </section>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const SeverityIcon = severityIcons[a.severity] || Info;
            return (
              <div key={a.id} className={cn('rounded-xl border p-4 sm:p-5', severityStyles[a.severity] || severityStyles.info, !a.isActive && 'opacity-50')}>
                <div className="flex items-start gap-3">
                  <SeverityIcon className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-display font-bold text-sm">{a.title}</p>
                      {!a.isActive && <span className="text-xs font-bold bg-black/10 dark:bg-white/10 rounded px-1.5 py-0.5">Inactive</span>}
                    </div>
                    <p className="text-sm opacity-85">{a.body}</p>
                    <p className="text-xs opacity-60 mt-2">
                      by {a.authorEmail || 'System'} · {new Date(a.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => handleToggle(a.id, a.isActive)} className="icon-button" title={a.isActive ? 'Deactivate' : 'Activate'}>
                      <Eye className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => handleDeleteAnnouncement(a.id)} className="icon-button text-error" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Loading Spinner ──────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-7 h-7 text-primary animate-spin" />
    </div>
  );
}

// ─── Main Admin Dashboard ─────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [dashData, accountData] = await Promise.all([
          getAdminDashboard(),
          getCurrentAccount(),
        ]);
        setDashboard(dashData);
        setCurrentUser(accountData.user || null);
      } catch {
        /* error handled per section */
      } finally {
        setDashboardLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-12">
      <section className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-violet-500/15 text-violet-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">Admin Panel</h1>
            <p className="text-sm text-text-muted">Full control of your LifeOS platform.</p>
          </div>
        </div>
      </section>

      <nav className="flex gap-1.5 overflow-x-auto pb-2 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0" aria-label="Admin tabs">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              'min-h-10 px-4 rounded-xl text-sm font-bold whitespace-nowrap inline-flex items-center gap-2 transition-colors shrink-0',
              activeTab === id
                ? 'bg-primary text-white shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container-low',
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && <OverviewTab dashboard={dashboard} loading={dashboardLoading} />}
      {activeTab === 'users' && <UsersTab currentUser={currentUser} />}
      {activeTab === 'audit' && <AuditTab />}
      {activeTab === 'config' && <ConfigTab currentUser={currentUser} />}
      {activeTab === 'announcements' && <AnnouncementsTab />}
    </div>
  );
}
