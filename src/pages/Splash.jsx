import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    // Navigate to onboarding after 2.5 seconds
    const timer = setTimeout(() => {
      navigate('/onboarding');
    }, 2500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center text-on-primary">
      <div className="flex flex-col items-center space-y-6 animate-pulse">
        <h1 className="font-display text-5xl md:text-6xl font-bold tracking-tight">LifeOS</h1>
        <p className="font-body text-inverse-primary text-sm tracking-widest uppercase">Personal Operations System</p>
      </div>
      <div className="absolute bottom-12">
        <div className="w-48 h-1 bg-primary-fixed-variant rounded-full overflow-hidden">
          <div className="h-full bg-ai-electric-blue rounded-full w-1/2 animate-[pulse_1.5s_ease-in-out_infinite] blur-[1px]"></div>
        </div>
      </div>
    </div>
  );
}
