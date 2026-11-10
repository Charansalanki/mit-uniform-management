import React, { useState, useEffect, useCallback } from 'react';

interface PortalAccessData {
  vendorId: string;
  vendorName: string;
  registeredMobile: string;
  accessStatus: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'SUSPENDED';
  portalLink: string;
  linkCreatedAt: string | null;
  expiresAt: string | null;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  sessionVersion: number;
}

interface ActivityLog {
  _id?: string;
  id?: string;
  action: string;
  timestamp: string;
  newValue?: any;
}

interface VendorPortalAccessCardProps {
  vendorId: string;
  apiBaseUrl?: string;
  authToken?: string;
}

export default function VendorPortalAccessCard({
  vendorId,
  apiBaseUrl = '',
  authToken = localStorage.getItem('mit_uniform_admin_token_v1') || localStorage.getItem('adminToken') || localStorage.getItem('token') || ''
}: VendorPortalAccessCardProps) {
  const [accessData, setAccessData] = useState<PortalAccessData | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const authHeaders = useCallback(() => {
    const h: Record<string, string> = {};
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const loadPortalAccess = useCallback(async () => {
    if (!vendorId) return;
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/admin/vendors/${vendorId}/portal-access`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (data.success) {
        setAccessData(data.portalAccess);
        setActivityLogs(data.activityLogs || []);
      }
    } catch (err) {
      console.error('Failed to load vendor portal access:', err);
    }
  }, [apiBaseUrl, vendorId, authHeaders]);

  useEffect(() => {
    if (vendorId) {
      loadPortalAccess();
    }
  }, [vendorId, loadPortalAccess]);

  const handleCopyLink = () => {
    if (!accessData?.portalLink) return;
    navigator.clipboard.writeText(accessData.portalLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // Manual Admin Share to Vendor's Registered Mobile via WhatsApp
  const handleShareToVendorMobile = () => {
    if (!accessData?.portalLink) return;
    const digits = String(accessData.registeredMobile || '').replace(/\D/g, '');
    const phoneWithCountry = digits.length === 10 ? `91${digits}` : digits;
    const msg = encodeURIComponent(
      `MIT Mysore Uniform Management – Official Vendor Portal Access\n\nVendor: ${accessData.vendorName} (${accessData.vendorId})\nPrivate Portal Link: ${accessData.portalLink}\n\nSign in using your registered mobile number and the first 4 digits of your registered phone number.`
    );
    window.open(`https://wa.me/${phoneWithCountry}?text=${msg}`, '_blank');
  };

  const handleRegenerateLink = async () => {
    if (
      !window.confirm(
        'Regenerate a new portal access link? The previous link and any active vendor sessions will be immediately invalidated.'
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      const res = await fetch(
        `${apiBaseUrl}/api/admin/vendors/${vendorId}/portal-access/generate`,
        { method: 'POST', headers: authHeaders() }
      );
      const data = await res.json();
      if (data.success) {
        setNotice(data.message);
        loadPortalAccess();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeAccess = async () => {
    if (
      !window.confirm(
        'Revoke portal access for this vendor? They will be logged out and unable to open the portal until a new link is generated.'
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      const res = await fetch(
        `${apiBaseUrl}/api/admin/vendors/${vendorId}/portal-access/revoke`,
        { method: 'PATCH', headers: authHeaders() }
      );
      const data = await res.json();
      if (data.success) {
        setNotice(data.message);
        loadPortalAccess();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!accessData) return null;

  const isAccessActive = accessData.accessStatus === 'ACTIVE';

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: '14px',
        border: '2px solid #2563eb',
        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.08)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        marginTop: '16px',
        marginBottom: '16px'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '14px'
        }}
      >
        <div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#2563eb',
              display: 'block',
              marginBottom: '4px'
            }}
          >
            Vendor Management → Vendor Portal Access
          </span>
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Unique Private Vendor Portal Link & Security Controls
          </h3>
        </div>
        <span
          style={{
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 800,
            background: isAccessActive ? '#ecfdf5' : '#fef2f2',
            color: isAccessActive ? '#047857' : '#b91c1c',
            border: `1px solid ${isAccessActive ? '#a7f3d0' : '#fca5a5'}`
          }}
        >
          Portal Status: {accessData.accessStatus}
        </span>
      </div>

      {notice && (
        <div
          style={{
            padding: '12px 16px',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            color: '#1e40af',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 700
          }}
        >
          {notice}
        </div>
      )}

      {/* Link Box + Copy / Share / Regenerate / Revoke Controls */}
      <div
        style={{
          background: '#f8fafc',
          padding: '18px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}
      >
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155' }}>
          Generated Private Vendor Portal URL
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            readOnly
            value={accessData.portalLink || 'Link revoked or not generated'}
            style={{
              flex: '1 1 320px',
              padding: '10px 14px',
              fontSize: '12px',
              fontFamily: 'monospace',
              background: '#ffffff',
              border: '1.5px solid #cbd5e1',
              borderRadius: '8px',
              color: '#1e293b',
              outline: 'none'
            }}
          />
          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              padding: '10px 18px',
              background: copied ? '#16a34a' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.15s ease'
            }}
          >
            {copied ? '✓ Copied!' : 'Copy Link'}
          </button>
          <button
            type="button"
            onClick={handleShareToVendorMobile}
            style={{
              padding: '10px 18px',
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.15s ease'
            }}
          >
            Share to Vendor ({accessData.registeredMobile})
          </button>
        </div>

        {/* Metadata Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '14px',
            paddingTop: '8px',
            borderTop: '1px solid #f1f5f9'
          }}
        >
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
              Registered Mobile
            </span>
            <strong style={{ fontSize: '14px', color: '#0f172a' }}>{accessData.registeredMobile}</strong>
          </div>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
              Link Created
            </span>
            <strong style={{ fontSize: '13px', color: '#0f172a' }}>
              {accessData.linkCreatedAt ? new Date(accessData.linkCreatedAt).toLocaleString('en-IN') : '—'}
            </strong>
          </div>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
              Last Login
            </span>
            <strong style={{ fontSize: '13px', color: '#0f172a' }}>
              {accessData.lastLoginAt ? new Date(accessData.lastLoginAt).toLocaleString('en-IN') : 'Never'}
            </strong>
          </div>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
              Last Activity
            </span>
            <strong style={{ fontSize: '13px', color: '#0f172a' }}>
              {accessData.lastActivityAt ? new Date(accessData.lastActivityAt).toLocaleString('en-IN') : '—'}
            </strong>
          </div>
        </div>

        {/* Regenerate / Revoke Actions */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            paddingTop: '12px',
            borderTop: '1px solid #e2e8f0'
          }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={handleRegenerateLink}
            style={{
              padding: '8px 16px',
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >
            ↻ Regenerate Access Link
          </button>
          {isAccessActive && (
            <button
              type="button"
              disabled={busy}
              onClick={handleRevokeAccess}
              style={{
                padding: '8px 16px',
                background: '#fef2f2',
                color: '#b91c1c',
                border: '1px solid #fca5a5',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer'
              }}
            >
              ✕ Revoke Portal Access
            </button>
          )}
        </div>
      </div>

      {/* Recent Activity Logs */}
      {activityLogs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: '#475569' }}>
            Recent Vendor Portal Activity & Verification Audit
          </h4>
          <div
            style={{
              maxHeight: '180px',
              overflowY: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              background: '#ffffff',
              fontSize: '12px'
            }}
          >
            {activityLogs.slice(0, 10).map((log, index) => (
              <div
                key={log._id || log.id || index}
                style={{
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: index < activityLogs.length - 1 ? '1px solid #f1f5f9' : 'none'
                }}
              >
                <span style={{ fontWeight: 700, color: '#1e293b' }}>{log.action}</span>
                <span style={{ color: '#64748b', fontSize: '11px' }}>
                  {log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN') : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

