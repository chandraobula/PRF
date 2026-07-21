import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function Onboarding() {
  return (
    <div className="min-h-screen bg-surface-container-lowest flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="w-16 h-16 bg-gradient-to-br from-secondary to-ai-electric-blue rounded-2xl mx-auto flex items-center justify-center shadow-ambient">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        
        <div className="space-y-4">
          <h1 className="font-display text-4xl font-bold text-on-surface">Welcome to LifeOS</h1>
          <p className="font-body text-on-surface-variant leading-relaxed">
            Your calm, premium personal operations system. Designed to reduce cognitive load and organize your digital life.
          </p>
        </div>

        <div className="bg-surface-container-low p-6 rounded-card border border-border-subtle text-left space-y-4">
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 rounded-full bg-success-proactive/20 text-success-proactive flex items-center justify-center flex-shrink-0 mt-0.5">
              <div className="w-2 h-2 rounded-full bg-success-proactive" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-on-surface">System Initialized</h3>
              <p className="text-xs text-text-muted mt-1">Core services are ready.</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 rounded-full bg-ai-electric-blue/20 text-ai-electric-blue flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles className="w-3 h-3" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-on-surface">AI Assistant Active</h3>
              <p className="text-xs text-text-muted mt-1">Proactive intelligence is online.</p>
            </div>
          </div>
        </div>

        <Link 
          to="/auth"
          className="w-full flex items-center justify-center py-3 px-4 bg-primary text-on-primary rounded-lg font-semibold hover:bg-primary/90 transition-colors"
        >
          Set up account
          <ArrowRight className="w-4 h-4 ml-2" />
        </Link>
      </div>
    </div>
  );
}
