import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BatteryCharging, Car, CheckCircle2, Loader2, Navigation, Plus, Save, Thermometer, Trash2, Wrench, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { formatMoney } from '../services/financeApi';
import {
  addMaintenanceItem,
  addVehicle,
  deleteVehicle,
  getCarSummary,
  updateMaintenanceItem,
  updateVehicle,
} from '../services/carApi';

const emptyVehicle = {
  name: '',
  make: '',
  model: '',
  year: '',
  odometerMiles: '',
  batteryPercent: '',
  rangeMiles: '',
  interiorTempF: '',
  location: '',
  status: 'parked',
  currentValue: '',
  purchasePrice: '',
  insuranceProvider: '',
  policyNumber: '',
  insuranceExpiresOn: '',
  registrationExpiresOn: '',
  warrantyExpiresOn: '',
};

const emptyMaintenance = {
  title: '',
  dueMileage: '',
  dueDate: '',
  priority: 'normal',
  notes: '',
};

export default function CarHub() {
  const [summary, setSummary] = useState(null);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicle);
  const [maintenanceForm, setMaintenanceForm] = useState(emptyMaintenance);
  const [editingVehicleId, setEditingVehicleId] = useState('');
  const [vehicleFormOpen, setVehicleFormOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const loadCar = async () => {
    setIsLoading(true);
    setError('');

    try {
      const data = await getCarSummary();
      setSummary(data);
      setSelectedVehicleId((current) => current || data.activeVehicle?.id || '');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCar();
  }, []);

  const vehicles = summary?.vehicles || [];
  const maintenanceItems = summary?.maintenanceItems || [];
  const activeVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || summary?.activeVehicle;

  const submitVehicle = async (event) => {
    event.preventDefault();

    if (!vehicleForm.name) {
      setError('Vehicle name is required.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const payload = cleanVehiclePayload(vehicleForm);

      if (editingVehicleId) {
        await updateVehicle(editingVehicleId, payload);
      } else {
        const response = await addVehicle(payload);
        setSelectedVehicleId(response.vehicle.id);
      }

      setVehicleForm(emptyVehicle);
      setEditingVehicleId('');
      setVehicleFormOpen(false);
      await loadCar();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const openAddVehicle = () => {
    setEditingVehicleId('');
    setVehicleForm(emptyVehicle);
    setError('');
    setVehicleFormOpen(true);
  };

  const closeVehicleForm = () => {
    setVehicleFormOpen(false);
    setEditingVehicleId('');
    setVehicleForm(emptyVehicle);
  };

  const editVehicle = (vehicle) => {
    setEditingVehicleId(vehicle.id);
    setSelectedVehicleId(vehicle.id);
    setVehicleFormOpen(true);
    setError('');
    setVehicleForm({
      name: vehicle.name || '',
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: vehicle.year ? String(vehicle.year) : '',
      odometerMiles: String(vehicle.odometerMiles || ''),
      batteryPercent: vehicle.batteryPercent === null ? '' : String(vehicle.batteryPercent),
      rangeMiles: vehicle.rangeMiles === null ? '' : String(vehicle.rangeMiles),
      interiorTempF: vehicle.interiorTempF === null ? '' : String(vehicle.interiorTempF),
      location: vehicle.location || '',
      status: vehicle.status || 'parked',
      currentValue: vehicle.currentValueMinor == null ? '' : String(vehicle.currentValueMinor / 100),
      purchasePrice: vehicle.purchasePriceMinor == null ? '' : String(vehicle.purchasePriceMinor / 100),
      insuranceProvider: vehicle.insuranceProvider || '',
      policyNumber: vehicle.policyNumber || '',
      insuranceExpiresOn: vehicle.insuranceExpiresOn || '',
      registrationExpiresOn: vehicle.registrationExpiresOn || '',
      warrantyExpiresOn: vehicle.warrantyExpiresOn || '',
    });
  };

  const submitMaintenance = async (event) => {
    event.preventDefault();

    if (!activeVehicle || !maintenanceForm.title) {
      setError('Choose a vehicle and enter a service task.');
      return;
    }

    await addMaintenanceItem(activeVehicle.id, cleanMaintenancePayload(maintenanceForm));
    setMaintenanceForm(emptyMaintenance);
    await loadCar();
  };

  const setVehicleStatus = async (vehicle, status) => {
    await updateVehicle(vehicle.id, { status });
    await loadCar();
  };

  const archiveVehicle = async (vehicle) => {
    await deleteVehicle(vehicle.id);
    setSelectedVehicleId('');
    await loadCar();
  };

  return (
    <div className="space-y-6 max-w-container-max mx-auto pb-12">
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold text-on-surface tracking-tight mb-2">Car Hub</h1>
          <p className="font-body text-on-surface-variant text-lg">
            {activeVehicle ? `${activeVehicle.name} is ${activeVehicle.status}${activeVehicle.location ? ` at ${activeVehicle.location}` : ''}.` : 'Add a vehicle to start tracking.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeVehicle && ['parked', 'charging', 'driving', 'service'].map((status) => (
            <button
              key={status}
              onClick={() => setVehicleStatus(activeVehicle, status)}
              className={cn(
                'min-h-10 rounded-xl px-3 text-sm font-bold capitalize',
                activeVehicle.status === status ? 'bg-primary text-white' : 'bg-surface-card border border-border-subtle text-on-surface',
              )}
            >
              {status}
            </button>
          ))}
          <button onClick={openAddVehicle} className="min-h-10 inline-flex items-center gap-2 rounded-xl bg-primary px-3 text-sm font-bold text-white active:scale-[.98] transition-transform">
            <Plus className="w-4 h-4" /> Add vehicle
          </button>
        </div>
      </section>

      {error && !vehicleFormOpen && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      <section>
        <div className="space-y-4">
          {activeVehicle ? (
            <>
              {summary.ownership && (
                <section className="app-card p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="section-title">Ownership</h2>
                      <p className="text-sm text-text-muted">Never miss a renewal.</p>
                    </div>
                    {summary.ownership.currentValueMinor != null && (
                      <div className="text-right">
                        <p className="text-xs text-text-muted">Current value</p>
                        <p className="font-display text-xl font-bold text-on-surface">{formatMoney(summary.ownership.currentValueMinor, 'USD')}</p>
                        {summary.ownership.purchasePriceMinor != null && (
                          <p className="text-xs text-text-muted">of {formatMoney(summary.ownership.purchasePriceMinor, 'USD')} paid</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {summary.ownership.renewals.map((renewal) => <RenewalCard key={renewal.key} renewal={renewal} />)}
                  </div>
                  <p className="mt-3 text-xs text-text-muted">
                    Loan &amp; EMI are tracked in <Link to="/finance" className="font-bold text-secondary">Finance → Loans</Link>. Fuel &amp; car spend live in your Finance ledger.
                  </p>
                </section>
              )}

              <section className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-4">
                <div className="bg-surface-card rounded-card border border-border-subtle p-6 flex flex-col items-center justify-center min-h-[300px]">
                  <Car className="w-32 h-32 text-primary/10 mb-4" />
                  <h2 className="font-display text-2xl font-bold">{activeVehicle.name}</h2>
                  <p className="text-text-muted">{[activeVehicle.year, activeVehicle.make, activeVehicle.model].filter(Boolean).join(' ') || 'Vehicle details pending'}</p>
                  <p className="text-text-muted">Mileage: {activeVehicle.odometerMiles.toLocaleString()} mi</p>
                  <div className="mt-4 flex gap-2">
                    <button className="px-3 py-2 rounded-lg bg-surface-container text-sm font-bold" onClick={() => editVehicle(activeVehicle)}>Edit</button>
                    <button className="w-10 h-10 rounded-lg hover:bg-error/10 hover:text-error flex items-center justify-center" onClick={() => archiveVehicle(activeVehicle)} aria-label={`Delete ${activeVehicle.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <StatusCard icon={BatteryCharging} label="Battery" value={activeVehicle.batteryPercent === null ? 'Not set' : `${activeVehicle.batteryPercent}%`} percent={activeVehicle.batteryPercent} />
                  <StatusCard icon={Navigation} label="Range" value={activeVehicle.rangeMiles === null ? 'Not set' : `${activeVehicle.rangeMiles} mi`} />
                  <StatusCard icon={Thermometer} label="Cabin temp" value={activeVehicle.interiorTempF === null ? 'Not set' : `${activeVehicle.interiorTempF} F`} />
                  <div className="p-5 bg-ai-electric-blue/5 border border-ai-electric-blue/30 rounded-card flex flex-col justify-between">
                    <Wrench className="w-6 h-6 text-ai-electric-blue mb-4" />
                    <div>
                      <p className="text-xs text-on-surface-variant mb-1">Open service</p>
                      <h3 className="font-bold text-sm text-on-surface">{summary.openMaintenanceCount} task{summary.openMaintenanceCount === 1 ? '' : 's'}</h3>
                    </div>
                  </div>
                </div>
              </section>

              <section className="app-card p-5 sm:p-6">
                <h2 className="section-title mb-1">Service and maintenance</h2>
                <p className="text-sm text-text-muted mb-4">Schedule tire rotations, inspections, insurance, and repairs.</p>
                <form className="grid gap-3 lg:grid-cols-[1fr_140px_150px_120px]" onSubmit={submitMaintenance}>
                  <input className="min-h-12 px-3 rounded-xl border border-outline-variant" value={maintenanceForm.title} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, title: event.target.value })} placeholder="Tire rotation" />
                  <input className="min-h-12 px-3 rounded-xl border border-outline-variant" type="number" min="0" value={maintenanceForm.dueMileage} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, dueMileage: event.target.value })} placeholder="Due mi" />
                  <input className="min-h-12 px-3 rounded-xl border border-outline-variant" type="date" value={maintenanceForm.dueDate} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, dueDate: event.target.value })} />
                  <button className="min-h-12 rounded-xl bg-primary text-white text-sm font-bold">Add task</button>
                </form>
                <div className="mt-5 space-y-3">
                  {maintenanceItems.filter((item) => item.vehicleId === activeVehicle.id).map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl bg-surface-container-lowest p-3">
                      <Wrench className="w-5 h-5 text-text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate">{item.title}</p>
                        <p className="text-xs text-text-muted">{item.dueMileage ? `${item.dueMileage} mi` : 'No mileage'} - {item.dueDate || 'No date'} - {item.status}</p>
                      </div>
                      <button className="w-10 h-10 rounded-lg hover:bg-blue-500/10 hover:text-blue-600 dark:text-blue-300 flex items-center justify-center" onClick={() => updateMaintenanceItem(item.id, { status: 'scheduled' }).then(loadCar)} aria-label={`Schedule ${item.title}`}>
                        <Wrench className="w-4 h-4" />
                      </button>
                      <button className="w-10 h-10 rounded-lg hover:bg-success-proactive/10 hover:text-success-proactive flex items-center justify-center" onClick={() => updateMaintenanceItem(item.id, { status: 'done' }).then(loadCar)} aria-label={`Complete ${item.title}`}>
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {maintenanceItems.filter((item) => item.vehicleId === activeVehicle.id).length === 0 && <p className="text-sm text-text-muted">No maintenance tasks yet.</p>}
                </div>
              </section>
            </>
          ) : (
            <div className="app-card p-8 text-center text-sm text-text-muted">{isLoading ? 'Loading vehicles...' : 'No vehicle yet. Add your first vehicle to start tracking.'}</div>
          )}

          {vehicles.length > 1 && (
            <section className="app-card p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-text-muted mb-3">Vehicles</p>
              <div className="flex flex-wrap gap-2">
                {vehicles.map((vehicle) => (
                  <button key={vehicle.id} className={cn('min-h-10 rounded-xl px-3 text-sm font-bold', activeVehicle?.id === vehicle.id ? 'bg-primary text-white' : 'bg-surface-container text-on-surface')} onClick={() => setSelectedVehicleId(vehicle.id)}>
                    {vehicle.name}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </section>

      {vehicleFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={editingVehicleId ? 'Edit vehicle' : 'Add vehicle'}>
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={closeVehicleForm} aria-label="Close" />
          <section className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]">
            <header className="flex items-center justify-between gap-4 border-b border-border-subtle p-5">
              <h2 className="section-title">{editingVehicleId ? 'Edit vehicle' : 'Add vehicle'}</h2>
              <button type="button" onClick={closeVehicleForm} className="icon-button bg-surface-container-low" aria-label="Close"><X className="h-5 w-5" /></button>
            </header>
            <form className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" onSubmit={submitVehicle}>
              <label className="settings-field"><span>Name</span><input value={vehicleForm.name} onChange={(event) => setVehicleForm({ ...vehicleForm, name: event.target.value })} placeholder="Model S" autoFocus /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="settings-field"><span>Make</span><input value={vehicleForm.make} onChange={(event) => setVehicleForm({ ...vehicleForm, make: event.target.value })} placeholder="Tesla" /></label>
                <label className="settings-field"><span>Model</span><input value={vehicleForm.model} onChange={(event) => setVehicleForm({ ...vehicleForm, model: event.target.value })} /></label>
                <label className="settings-field"><span>Year</span><input type="number" inputMode="numeric" value={vehicleForm.year} onChange={(event) => setVehicleForm({ ...vehicleForm, year: event.target.value })} /></label>
                <label className="settings-field"><span>Mileage</span><input type="number" inputMode="numeric" min="0" value={vehicleForm.odometerMiles} onChange={(event) => setVehicleForm({ ...vehicleForm, odometerMiles: event.target.value })} /></label>
                <label className="settings-field"><span>Battery %</span><input type="number" inputMode="numeric" min="0" max="100" value={vehicleForm.batteryPercent} onChange={(event) => setVehicleForm({ ...vehicleForm, batteryPercent: event.target.value })} /></label>
                <label className="settings-field"><span>Range</span><input type="number" inputMode="numeric" min="0" value={vehicleForm.rangeMiles} onChange={(event) => setVehicleForm({ ...vehicleForm, rangeMiles: event.target.value })} /></label>
                <label className="settings-field"><span>Cabin temp</span><input type="number" inputMode="numeric" value={vehicleForm.interiorTempF} onChange={(event) => setVehicleForm({ ...vehicleForm, interiorTempF: event.target.value })} /></label>
                <label className="settings-field"><span>Location</span><input value={vehicleForm.location} onChange={(event) => setVehicleForm({ ...vehicleForm, location: event.target.value })} /></label>
              </div>

              <div className="pt-1">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">Ownership</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="settings-field"><span>Current value</span><input type="number" inputMode="decimal" min="0" value={vehicleForm.currentValue} onChange={(event) => setVehicleForm({ ...vehicleForm, currentValue: event.target.value })} placeholder="18950" /></label>
                  <label className="settings-field"><span>Purchase price</span><input type="number" inputMode="decimal" min="0" value={vehicleForm.purchasePrice} onChange={(event) => setVehicleForm({ ...vehicleForm, purchasePrice: event.target.value })} placeholder="20000" /></label>
                  <label className="settings-field"><span>Insurance provider</span><input value={vehicleForm.insuranceProvider} onChange={(event) => setVehicleForm({ ...vehicleForm, insuranceProvider: event.target.value })} placeholder="Geico" /></label>
                  <label className="settings-field"><span>Policy number</span><input value={vehicleForm.policyNumber} onChange={(event) => setVehicleForm({ ...vehicleForm, policyNumber: event.target.value })} /></label>
                  <label className="settings-field"><span>Insurance renews</span><input type="date" value={vehicleForm.insuranceExpiresOn} onChange={(event) => setVehicleForm({ ...vehicleForm, insuranceExpiresOn: event.target.value })} /></label>
                  <label className="settings-field"><span>Registration expires</span><input type="date" value={vehicleForm.registrationExpiresOn} onChange={(event) => setVehicleForm({ ...vehicleForm, registrationExpiresOn: event.target.value })} /></label>
                  <label className="settings-field"><span>Warranty ends</span><input type="date" value={vehicleForm.warrantyExpiresOn} onChange={(event) => setVehicleForm({ ...vehicleForm, warrantyExpiresOn: event.target.value })} /></label>
                </div>
              </div>
              {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeVehicleForm} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
                <button disabled={isSaving} className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-60">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingVehicleId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {editingVehicleId ? 'Save vehicle' : 'Add vehicle'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function StatusCard({ icon: Icon, label, value, percent }) {
  return (
    <div className="p-5 bg-surface-card rounded-card border border-border-subtle flex flex-col justify-between">
      <Icon className="w-6 h-6 text-text-muted mb-4" />
      <div>
        <p className="text-xs text-text-muted mb-1">{label}</p>
        <h3 className="font-display text-3xl font-bold">{value}</h3>
        {percent !== null && percent !== undefined && (
          <div className="w-full bg-surface-container h-2 rounded-full mt-2">
            <div className="bg-success-proactive h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function RenewalCard({ renewal }) {
  const days = renewal.daysUntil;
  const tone = days == null
    ? 'text-text-muted'
    : days < 0 || days <= 14
      ? 'text-error'
      : days <= 30
        ? 'text-warning-maintenance'
        : 'text-on-surface';
  const label = days == null
    ? 'Not set'
    : days < 0
      ? `${Math.abs(days)}d overdue`
      : days === 0
        ? 'Today'
        : `in ${days}d`;

  return (
    <div className={cn('rounded-xl border p-3', days != null && (days < 0 || days <= 14) ? 'border-error/30 bg-error/5' : 'border-border-subtle')}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{renewal.label}</p>
      <p className={cn('mt-1 text-sm font-bold', tone)}>{label}</p>
      {renewal.date && <p className="mt-0.5 text-xs text-text-muted">{renewal.date}</p>}
    </div>
  );
}

function cleanVehiclePayload(form) {
  return {
    name: form.name,
    make: form.make,
    model: form.model,
    year: form.year,
    odometerMiles: form.odometerMiles || 0,
    batteryPercent: form.batteryPercent,
    rangeMiles: form.rangeMiles,
    interiorTempF: form.interiorTempF,
    location: form.location,
    status: form.status,
    currentValue: form.currentValue,
    purchasePrice: form.purchasePrice,
    insuranceProvider: form.insuranceProvider,
    policyNumber: form.policyNumber,
    insuranceExpiresOn: form.insuranceExpiresOn || null,
    registrationExpiresOn: form.registrationExpiresOn || null,
    warrantyExpiresOn: form.warrantyExpiresOn || null,
  };
}

function cleanMaintenancePayload(form) {
  return {
    title: form.title,
    dueMileage: form.dueMileage,
    dueDate: form.dueDate || null,
    priority: form.priority,
    notes: form.notes,
  };
}
