import React, { useState, useEffect } from 'react';
import { PaymentConfig, PaymentConfigHistory } from '../types';
import { ShieldAlert, AlertTriangle, CheckCircle2, History, Sliders, ToggleLeft, ToggleRight, ArrowRight, X } from 'lucide-react';

interface Props {
  config: PaymentConfig;
  history?: PaymentConfigHistory[];
  onSaveConfig: (payload: Partial<PaymentConfig> & { changeSummary?: string }) => Promise<void>;
  onToggleCollection: (isCollectionEnabled: boolean, unavailableMessage?: string) => Promise<void>;
  busy?: boolean;
}

export default function PaymentAmountController({
  config,
  history = [],
  onSaveConfig,
  onToggleCollection,
  busy = false
}: Props) {
  const [formState, setFormState] = useState({
    paymentMode: (config?.paymentMode || 'FIXED') as 'FIXED' | 'FLEXIBLE_RANGE',
    uniformAmount: config?.uniformAmount ?? 1500,
    minAmount: config?.minAmount ?? 1,
    maxAmount: config?.maxAmount ?? 10000,
    isCollectionEnabled: config?.isCollectionEnabled ?? true,
    unavailableMessage:
      config?.unavailableMessage ||
      'Payment collection is temporarily unavailable. Please contact the Uniform Office.',
    departmentAmounts: { ...(config?.departmentAmounts || {}) },
    semesterAmounts: { ...(config?.semesterAmounts || {}) },
    packageAmounts: {
      standard: 1500,
      hosteler: 1800,
      lab_included: 2100,
      ...(config?.packageAmounts || {})
    },
    changeSummary: ''
  });

  // Overrides inputs
  const [newDeptKey, setNewDeptKey] = useState('CSE');
  const [newDeptVal, setNewDeptVal] = useState('');
  const [newSemKey, setNewSemKey] = useState('1st Sem');
  const [newSemVal, setNewSemVal] = useState('');
  const [newPkgKey, setNewPkgKey] = useState('');
  const [newPkgVal, setNewPkgVal] = useState('');

  const [validationError, setValidationError] = useState('');
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // Sync when parent config updates
  useEffect(() => {
    if (config) {
      setFormState((prev) => ({
        ...prev,
        paymentMode: (config.paymentMode || 'FIXED') as 'FIXED' | 'FLEXIBLE_RANGE',
        uniformAmount: config.uniformAmount ?? 1500,
        minAmount: config.minAmount ?? 1,
        maxAmount: config.maxAmount ?? 10000,
        isCollectionEnabled: config.isCollectionEnabled ?? true,
        unavailableMessage:
          config.unavailableMessage ||
          'Payment collection is temporarily unavailable. Please contact the Uniform Office.',
        departmentAmounts: { ...(config.departmentAmounts || {}) },
        semesterAmounts: { ...(config.semesterAmounts || {}) },
        packageAmounts: {
          standard: 1500,
          hosteler: 1800,
          lab_included: 2100,
          ...(config.packageAmounts || {})
        }
      }));
    }
  }, [config]);

  const validateBeforeConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    setConfirmModalOpen(true);
  };

  const handleConfirmSave = async () => {
    setConfirmModalOpen(false);
    await onSaveConfig(formState);
  };

  const addEntryToMap = (
    mapName: 'departmentAmounts' | 'semesterAmounts' | 'packageAmounts',
    key: string,
    val: string,
    clearValFn: (v: string) => void
  ) => {
    const num = Number(val);
    if (!key || isNaN(num) || num <= 0) return;
    setFormState((prev) => ({
      ...prev,
      [mapName]: {
        ...prev[mapName],
        [key.trim()]: num
      }
    }));
    clearValFn('');
  };

  const removeEntryFromMap = (
    mapName: 'departmentAmounts' | 'semesterAmounts' | 'packageAmounts',
    key: string
  ) => {
    setFormState((prev) => {
      const updated = { ...prev[mapName] };
      delete (updated as any)[key];
      return { ...prev, [mapName]: updated };
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* ── 1. PAYMENT AMOUNT DASHBOARD OVERVIEW ── */}
      <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#2563eb' }}>
              Admin Panel → Payment Controller → Payment Amount Controller
            </span>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '4px 0 0' }}>
              Manual Payment Amount & Range Controller
            </h2>
          </div>

          {/* Master Payment Collection Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#f8fafc', padding: '10px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: formState.isCollectionEnabled ? '#166534' : '#991b1b' }}>
                PAYMENT COLLECTION: {formState.isCollectionEnabled ? 'ON (ACTIVE)' : 'OFF (PAUSED)'}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {formState.isCollectionEnabled
                  ? 'Students can submit new fee payments'
                  : 'New student submissions paused'}
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const nextStatus = !formState.isCollectionEnabled;
                setFormState((prev) => ({ ...prev, isCollectionEnabled: nextStatus }));
                onToggleCollection(nextStatus, formState.unavailableMessage);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#ffffff',
                border: 'none',
                cursor: busy ? 'not-allowed' : 'pointer',
                background: formState.isCollectionEnabled ? '#dc2626' : '#16a34a',
                transition: 'all 0.15s'
              }}
            >
              {formState.isCollectionEnabled ? <><ToggleRight size={16} /> Turn OFF</> : <><ToggleLeft size={16} /> Turn ON</>}
            </button>
          </div>
        </div>

        {/* 7 Key Dashboard Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginTop: '16px' }}>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 12px' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Fee Architecture</span>
            <div style={{ fontSize: '14px', fontWeight: 900, color: '#1d4ed8', marginTop: '2px' }}>
              Per-Vendor Final Fee
            </div>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Payment Enforcement</span>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
              Exact Fixed Amount (Final)
            </div>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Collection Status</span>
            <div style={{ marginTop: '4px' }}>
              <span style={{
                display: 'inline-block',
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                background: config?.isCollectionEnabled ? '#dcfce7' : '#fee2e2',
                color: config?.isCollectionEnabled ? '#166534' : '#991b1b'
              }}>
                {config?.isCollectionEnabled ? 'ACTIVE (ON)' : 'PAUSED (OFF)'}
              </span>
            </div>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Last Updated</span>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {config?.updatedAt ? new Date(config.updatedAt).toLocaleDateString('en-IN') : 'Default'}
            </div>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Version</span>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
              v{config?.configVersion || 1}
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. MODE SWITCHER & AMOUNT CONFIGURATION FORM ── */}
      <form onSubmit={validateBeforeConfirm} style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {validationError && (
          <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={15} />
            <span>{validationError}</span>
          </div>
        )}

        {/* Notice: Per-Vendor Authoritative Fee Architecture */}
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e40af' }}>
              ✓ Authoritative Fee Architecture: Managed Per-Vendor
            </div>
            <div style={{ fontSize: '12px', color: '#1e3a8a', marginTop: '3px' }}>
              Uniform payment amounts are now configured and finalized individually inside <strong>Vendor Management & Allocations</strong>. The amount entered on each vendor is the final required fee.
            </div>
          </div>
          <span style={{ background: '#2563eb', color: '#ffffff', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, whiteSpace: 'nowrap' }}>
            Final Per-Vendor Amount Active
          </span>
        </div>

        {/* ── Granular Overrides Matrix ── */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>
              Granular Amount Overrides Matrix (Departments, Semesters & Uniform Packages)
            </h3>
            <p style={{ fontSize: '11.5px', color: '#64748b', margin: 0 }}>
              Resolution priority: Package Override → Semester Override → Department Override → Default Uniform Fee Amount.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {/* A. Department Overrides */}
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#334155' }}>
                Department-Specific Amounts
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select
                  value={newDeptKey}
                  onChange={(e) => setNewDeptKey(e.target.value)}
                  style={{ padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff' }}
                >
                  {['CSE', 'ISE', 'ECE', 'AIML', 'MECH', 'CIVIL', 'EEE', 'MBA', 'MCA'].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  placeholder="₹ Amount"
                  value={newDeptVal}
                  onChange={(e) => setNewDeptVal(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                />
                <button
                  type="button"
                  onClick={() => addEntryToMap('departmentAmounts', newDeptKey, newDeptVal, setNewDeptVal)}
                  style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Set
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                {Object.entries(formState.departmentAmounts).length === 0 ? (
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                    All departments using base ₹{formState.uniformAmount}
                  </div>
                ) : (
                  Object.entries(formState.departmentAmounts).map(([dept, amt]) => (
                    <div key={dept} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                      <span style={{ fontWeight: 700, color: '#1e293b' }}>{dept}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 800, color: '#1d4ed8' }}>₹{Number(amt).toLocaleString('en-IN')}</span>
                        <button
                          type="button"
                          onClick={() => removeEntryFromMap('departmentAmounts', dept)}
                          style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontWeight: 800 }}
                          title="Remove override"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* B. Semester Overrides */}
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#334155' }}>
                Semester-Specific Amounts
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select
                  value={newSemKey}
                  onChange={(e) => setNewSemKey(e.target.value)}
                  style={{ padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff' }}
                >
                  {['1st Sem', '2nd Sem', '3rd Sem', '4th Sem', '5th Sem', '6th Sem', '7th Sem', '8th Sem'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  placeholder="₹ Amount"
                  value={newSemVal}
                  onChange={(e) => setNewSemVal(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                />
                <button
                  type="button"
                  onClick={() => addEntryToMap('semesterAmounts', newSemKey, newSemVal, setNewSemVal)}
                  style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Set
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                {Object.entries(formState.semesterAmounts).length === 0 ? (
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                    All semesters using default amount
                  </div>
                ) : (
                  Object.entries(formState.semesterAmounts).map(([sem, amt]) => (
                    <div key={sem} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                      <span style={{ fontWeight: 700, color: '#1e293b' }}>{sem}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 800, color: '#1d4ed8' }}>₹{Number(amt).toLocaleString('en-IN')}</span>
                        <button
                          type="button"
                          onClick={() => removeEntryFromMap('semesterAmounts', sem)}
                          style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontWeight: 800 }}
                          title="Remove override"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* C. Uniform Package Overrides */}
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#334155' }}>
                Uniform Package Amounts
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="Package (e.g. hosteler)"
                  value={newPkgKey}
                  onChange={(e) => setNewPkgKey(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                />
                <input
                  type="number"
                  min="1"
                  placeholder="₹"
                  value={newPkgVal}
                  onChange={(e) => setNewPkgVal(e.target.value)}
                  style={{ width: '90px', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    addEntryToMap('packageAmounts', newPkgKey, newPkgVal, setNewPkgVal);
                    setNewPkgKey('');
                  }}
                  style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Set
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                {Object.entries(formState.packageAmounts).map(([pkg, amt]) => (
                  <div key={pkg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                    <span style={{ fontWeight: 700, color: '#1e293b', textTransform: 'capitalize' }}>{pkg}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 800, color: '#1d4ed8' }}>₹{Number(amt).toLocaleString('en-IN')}</span>
                      <button
                        type="button"
                        onClick={() => removeEntryFromMap('packageAmounts', pkg)}
                        style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontWeight: 800 }}
                        title="Remove override"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Maintenance Message & Change Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
              Maintenance Message (Displayed when Payment Collection is OFF)
            </label>
            <input
              type="text"
              value={formState.unavailableMessage}
              onChange={(e) => setFormState({ ...formState, unavailableMessage: e.target.value })}
              style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '1.5px solid #cbd5e1', borderRadius: '6px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
              Admin Change Note (Recorded in Immutable History)
            </label>
            <input
              type="text"
              placeholder="e.g. Updated 2026 odd semester uniform fee and range"
              value={formState.changeSummary}
              onChange={(e) => setFormState({ ...formState, changeSummary: e.target.value })}
              style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '1.5px solid #cbd5e1', borderRadius: '6px' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            ✓ Historical Payment Protection Active: Existing student payment records will retain their original locked amounts.
          </span>
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: '9px 20px',
              borderRadius: '8px',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 800,
              border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 6px rgba(37,99,235,0.25)'
            }}
          >
            {busy ? 'Saving Configuration...' : 'Save Configuration Changes'}
          </button>
        </div>
      </form>

      {/* ── 3. PAYMENT CONFIGURATION HISTORY TABLE ── */}
      <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>
              Payment Configuration History
            </h3>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
              Complete audit log of all previous payment amounts, min/max ranges, and mode changes
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#2563eb', fontWeight: 700 }}>
            <History size={14} /> Immutable Ledger
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#475569', textTransform: 'uppercase', fontSize: '11px', fontWeight: 800, borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '10px 14px' }}>Version</th>
                <th style={{ padding: '10px 14px' }}>Prev → New Amount</th>
                <th style={{ padding: '10px 14px' }}>Prev → New Min</th>
                <th style={{ padding: '10px 14px' }}>Prev → New Max</th>
                <th style={{ padding: '10px 14px' }}>Mode</th>
                <th style={{ padding: '10px 14px' }}>Collection</th>
                <th style={{ padding: '10px 14px' }}>Modified By</th>
                <th style={{ padding: '10px 14px' }}>Date & Time</th>
              </tr>
            </thead>
            <tbody style={{ color: '#1e293b' }}>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                    No configuration changes recorded yet. Initial baseline configuration active.
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item._id || item.id || String(item.configVersion)} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 800, fontFamily: 'monospace', color: '#2563eb' }}>
                      v{item.configVersion}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                      ₹{item.previousAmount} → <strong style={{ color: '#166534' }}>₹{item.newAmount}</strong>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      ₹{item.previousMinAmount} → <strong>₹{item.newMinAmount}</strong>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      ₹{item.previousMaxAmount} → <strong>₹{item.newMaxAmount}</strong>
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '11px' }}>
                      {item.previousMode} → <strong style={{ color: '#0f172a' }}>{item.newMode}</strong>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        background: item.newCollectionStatus ? '#dcfce7' : '#fee2e2',
                        color: item.newCollectionStatus ? '#166534' : '#991b1b'
                      }}>
                        {item.newCollectionStatus ? 'ON' : 'OFF'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                      {item.modifiedByName || 'Administrator'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '11px' }}>
                      {new Date(item.modifiedAt).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 4. CONFIRMATION DIALOG BEFORE SAVING SIGNIFICANT CHANGES ── */}
      {confirmModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#ffffff', borderRadius: '14px', maxWidth: '480px', width: '100%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Confirm Payment Configuration Update
              </h3>
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '12.5px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
              You are about to update the institutional payment configuration. Please review the updated settings:
            </p>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div><strong>Configuration Mode:</strong> {formState.paymentMode === 'FLEXIBLE_RANGE' ? 'Mode B: Flexible Range' : 'Mode A: Fixed Amount'}</div>
              <div><strong>Default Uniform Fee:</strong> ₹{Number(formState.uniformAmount).toLocaleString('en-IN')}</div>
              <div><strong>Allowed Range:</strong> ₹{Number(formState.minAmount).toLocaleString('en-IN')} – ₹{Number(formState.maxAmount).toLocaleString('en-IN')}</div>
              <div><strong>Payment Collection:</strong> {formState.isCollectionEnabled ? 'ON (Students can submit)' : 'OFF (Submissions paused)'}</div>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 12px', fontSize: '11.5px', color: '#166534', lineHeight: 1.5 }}>
              ✓ <strong>Historical Payment Protection:</strong> Previously submitted student records will retain their original locked expected amounts and config snapshots. Only new student submissions will use this updated configuration.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
              >
                Confirm & Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

