import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { getContext } from '../services/metaApi';

export default function ContextBar() {
  const [ctx, setCtx] = useState(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    const load = () => getContext().then((data) => { if (active) setCtx(data); }).catch(() => {});
    load();
    const refresh = setInterval(load, 60 * 60 * 1000); // FX + location hourly
    return () => { active = false; clearInterval(refresh); };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  const city = ctx?.location?.city;
  const country = ctx?.location?.country;
  const inr = ctx?.fx?.rates?.INR;
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-text-muted">
      <span>{date}</span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">{time}</span>
      {city && (
        <>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{city}{country ? `, ${country}` : ''}</span>
        </>
      )}
      {inr ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums text-secondary">$1 = ₹{inr.toFixed(2)}</span>
        </>
      ) : null}
    </div>
  );
}
