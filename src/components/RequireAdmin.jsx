import { useEffect, useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { getCurrentAccount } from '../services/authApi';
import { notifyUnauthorized, isAdmin } from '../lib/session';

// Client-side gate only — every /api/admin and /api/planner endpoint re-checks the
// role server-side, so this just avoids rendering a screen that would only 403.
export default function RequireAdmin() {
  const [state, setState] = useState('checking');

  useEffect(() => {
    let active = true;

    (async () => {
      const result = await getCurrentAccount();

      if (!active) {
        return;
      }

      if (!result || result.authenticated === false) {
        notifyUnauthorized();
        setState('denied');
        return;
      }

      setState(isAdmin(result.user) ? 'allowed' : 'denied');
    })();

    return () => {
      active = false;
    };
  }, []);

  if (state === 'checking') {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
        <span className="sr-only">Checking your access</span>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="max-w-container-max mx-auto">
        <div className="app-card p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-error/10 flex items-center justify-center mb-4">
            <ShieldAlert className="w-7 h-7 text-error" />
          </div>
          <h1 className="font-display text-xl font-bold text-on-surface">Admin access required</h1>
          <p className="mt-1 text-sm text-text-muted max-w-sm">
            This area is limited to workspace admins and owners. Ask an owner to grant you access.
          </p>
          <Link
            to="/dashboard"
            className="mt-5 min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
