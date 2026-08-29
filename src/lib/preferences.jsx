// One place for the signed-in user's preferences so every money screen shows
// the same currency. Loaded once per session by MainLayout; before it resolves,
// DEFAULT_PREFERENCES keeps the UI rendering rather than flashing empty.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { detectPreferences, getPreferences } from '../services/settingsApi';

export const SUPPORTED_CURRENCIES = ['INR', 'USD'];

export const CURRENCY_LABELS = {
  INR: 'Indian Rupee (₹)',
  USD: 'US Dollar ($)',
};

const DEFAULT_PREFERENCES = {
  theme: 'system',
  reduceMotion: false,
  textSize: 'medium',
  language: 'en',
  region: 'IN',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  currencySource: 'default',
  notifyDailyBriefing: true,
  notifyBills: true,
  notifyFocusSessions: false,
};

const PreferencesContext = createContext({
  preferences: DEFAULT_PREFERENCES,
  currency: DEFAULT_PREFERENCES.currency,
  isLoading: true,
  refreshPreferences: async () => {},
});

// What the browser knows about where the user is. Intl is the only reliable
// source for the device timezone — the server can't infer it from the request.
function browserLocaleSignals() {
  try {
    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      locale: navigator.language || '',
    };
  } catch {
    return { timezone: '', locale: '' };
  }
}

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);

  const refreshPreferences = useCallback(async () => {
    const result = await getPreferences();
    setPreferences({ ...DEFAULT_PREFERENCES, ...result.preferences });
    return result.preferences;
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const result = await getPreferences();
        if (!active) return;

        let next = result.preferences;

        // 'default' means nobody has ever picked a currency, so this is the
        // one moment we may set one from the browser. A user who chose in
        // Settings is 'manual' and never comes through here again.
        if (next.currencySource === 'default') {
          const signals = browserLocaleSignals();
          if (signals.timezone) {
            try {
              next = (await detectPreferences(signals)).preferences;
            } catch {
              // Detection is a convenience — keep the stored preferences.
            }
          }
        }

        if (active) setPreferences({ ...DEFAULT_PREFERENCES, ...next });
      } catch {
        // Unauthenticated or offline: the defaults above still render.
      } finally {
        if (active) setIsLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({
    preferences,
    currency: preferences.currency,
    isLoading,
    refreshPreferences,
  }), [preferences, isLoading, refreshPreferences]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  return useContext(PreferencesContext);
}

/** The user's default currency — what unscoped amounts should be shown in. */
export function useCurrency() {
  return useContext(PreferencesContext).currency;
}
