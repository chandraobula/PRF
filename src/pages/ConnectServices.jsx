import { Code, MessageCircle, Hash, Layout, Mail, Calendar, Server, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

export default function ConnectServices() {
  return (
    <div className="space-y-8 max-w-container-max mx-auto">
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold text-on-surface tracking-tight mb-2">Connect Services</h1>
          <p className="font-body text-on-surface-variant text-lg">Manage your integrated third-party applications.</p>
        </div>
        <button className="flex items-center px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors self-start">
          <Plus className="w-4 h-4 mr-2" /> Add Service
        </button>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
        {[
          { name: "GitHub", desc: "Sync repositories and issues", icon: Code, status: "Connected" },
          { name: "Google Calendar", desc: "Sync events and meetings", icon: Calendar, status: "Connected" },
          { name: "Slack", desc: "Send notifications to channels", icon: Hash, status: "Connected" },
          { name: "Trello", desc: "Sync boards and cards", icon: Layout, status: "Disconnected" },
          { name: "Gmail", desc: "Read and send emails", icon: Mail, status: "Disconnected" },
          { name: "AWS", desc: "Monitor infrastructure", icon: Server, status: "Disconnected" }
        ].map((service, i) => (
          <div key={i} className="p-5 bg-surface-card rounded-card border border-border-subtle shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-surface-container rounded-lg flex items-center justify-center">
                <service.icon className="w-6 h-6 text-on-surface" />
              </div>
              <span className={cn(
                "text-xs font-bold px-2 py-1 rounded-full",
                service.status === 'Connected' ? "text-success-proactive bg-success-proactive/10" : "text-text-muted bg-surface-container"
              )}>
                {service.status}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-lg text-on-surface">{service.name}</h3>
              <p className="text-sm text-text-muted mb-4">{service.desc}</p>
              <button className={cn(
                "w-full py-2 rounded-lg text-sm font-semibold transition-colors",
                service.status === 'Connected' 
                  ? "bg-surface-card border border-border-subtle text-error hover:bg-error/5" 
                  : "bg-primary text-on-primary hover:bg-primary/90"
              )}>
                {service.status === 'Connected' ? 'Disconnect' : 'Connect'}
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
