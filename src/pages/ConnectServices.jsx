import { useEffect, useState } from 'react';
import { Code, MessageCircle, Hash, Layout, Mail, Calendar, Server, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { listIntegrations, updateIntegration } from '../services/settingsApi';

const SERVICE_ICONS = {
  github: Code,
  google_calendar: Calendar,
  slack: Hash,
  trello: Layout,
  gmail: Mail,
  aws: Server,
};

export default function ConnectServices() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [pendingService, setPendingService] = useState(null);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    listIntegrations()
      .then((res) => {
        if (!cancelled) setIntegrations(res.integrations);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message || 'Could not load your connected services.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleService = async (service, currentStatus) => {
    const nextStatus = currentStatus === 'connected' ? 'disconnected' : 'connected';
    setPendingService(service);
    setActionError(null);

    try {
      const res = await updateIntegration(service, nextStatus);
      setIntegrations((prev) => prev.map((entry) => (entry.service === service ? res.integration : entry)));
    } catch (error) {
      setActionError(error.message || 'Could not update that connection.');
    } finally {
      setPendingService(null);
    }
  };

  return (
    <div className="space-y-8 max-w-container-max mx-auto">
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold text-on-surface tracking-tight mb-2">Connect Services</h1>
          <p className="font-body text-on-surface-variant text-lg">Manage your integrated third-party applications.</p>
        </div>
        <button
          type="button"
          disabled
          title="Adding custom services is coming soon."
          className="flex items-center px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold self-start opacity-50 cursor-not-allowed"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Service
        </button>
      </section>

      {actionError && <p className="text-sm text-error">{actionError}</p>}

      {loading && <p className="text-text-muted">Loading your connections…</p>}
      {!loading && loadError && <p className="text-error">{loadError}</p>}

      {!loading && !loadError && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
          {integrations.map((service) => {
            const Icon = SERVICE_ICONS[service.service] || MessageCircle;
            const isConnected = service.status === 'connected';
            const isPending = pendingService === service.service;

            return (
              <div key={service.service} className="p-5 bg-surface-card rounded-card border border-border-subtle shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-surface-container rounded-lg flex items-center justify-center">
                    <Icon className="w-6 h-6 text-on-surface" />
                  </div>
                  <span className={cn(
                    'text-xs font-bold px-2 py-1 rounded-full',
                    isConnected ? 'text-success-proactive bg-success-proactive/10' : 'text-text-muted bg-surface-container',
                  )}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-lg text-on-surface">{service.name}</h3>
                  <p className="text-sm text-text-muted mb-4">{service.description}</p>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => toggleService(service.service, service.status)}
                    className={cn(
                      'w-full py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60',
                      isConnected
                        ? 'bg-surface-card border border-border-subtle text-error hover:bg-error/5'
                        : 'bg-primary text-on-primary hover:bg-primary/90',
                    )}
                  >
                    {isPending ? 'Please wait…' : isConnected ? 'Disconnect' : 'Connect'}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
