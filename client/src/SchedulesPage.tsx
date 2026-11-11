import { useState, useEffect, useMemo } from 'react';
import { DistributionSchedule } from './types';
import { DEPARTMENTS, SEMESTERS, parseCampaignYears, formatAcademicYear } from './mockData';
import { api } from './api';
import { MIT_SEAL_LOGO_BASE64 } from './utils/mitLogoBase64';
import {
  CalendarDays,
  Clock,
  Building,
  FileText,
  AlertCircle,
  ArrowLeft,
  Sparkles,
  Compass
} from 'lucide-react';

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<DistributionSchedule[]>([]);
  const [campaign, setCampaign] = useState('Uniform Distribution 2027');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedSem, setSelectedSem] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);

  const { currentYear, academicYear } = useMemo(() => parseCampaignYears(campaign), [campaign]);

  useEffect(() => {
    Promise.all([
      api.getCampaignName().then(setCampaign).catch(() => { }),
      api.getSchedules().then(data => {
        setSchedules(data || []);
      }).catch(() => { })
    ]).finally(() => setLoading(false));
  }, []);

  // Filter schedules - strictly show published announcements only
  const publishedSchedules = useMemo(() => {
    return schedules.filter(s => Boolean(s.published));
  }, [schedules]);

  const filtered = useMemo(() => {
    return publishedSchedules.filter(s => {
      if (selectedDept && s.department !== selectedDept) return false;
      if (selectedSem !== '' && s.semester !== selectedSem) return false;
      return true;
    });
  }, [publishedSchedules, selectedDept, selectedSem]);

  return (
    <div className="portal-page">
      {/* ── Top Navbar ── */}
      <nav className="portal-navbar">
        <div className="nav-brand">
          <div className="nav-logo">
            <img
              src="/logo.png"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.startsWith('data:')) {
                  target.src = MIT_SEAL_LOGO_BASE64;
                }
              }}
              alt="MIT Mysore Logo"
              className="mit-official-logo"
            />
          </div>
          <div className="nav-title">
            <b>MIT MYSORE</b>
            <small>Uniform Distribution Schedules</small>
          </div>
        </div>
        <div className="nav-right">
          <span className="nav-badge"><CalendarDays size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />{campaign}</span>
          <a
            href="/navigation.html"
            className="nav-sched-btn"
            style={{ background: '#16a34a', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none' }}
            title="Go to Campus Room Navigation"
          >
            <Compass size={13} /> Find the Room
          </a>
          <a
            href="/"
            className="nav-sched-btn"
            title="Go Back to Registration Portal"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
          >
            <ArrowLeft size={14} /> Go Back
          </a>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <div className="portal-hero">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
          <Sparkles size={14} /> Official Campus Distribution Notice
        </div>
        <h1>Uniform Collection Schedules & Venues</h1>
        <p className="hero-sub">
          Official pickup dates, batch slot timings, and hall counter locations published by the MIT Mysore Uniform Coordination Office.
        </p>

        <div className="hero-chips">
          <span className="hero-chip">{publishedSchedules.length} Published Batches</span>
          <span className="hero-chip">ID Card Mandatory</span>
          <span className="hero-chip">Verified Campus Counters</span>
        </div>
      </div>

      {/* ── Main Content Container ── */}
      <div className="portal-wrap">
        <div style={{ maxWidth: '960px', margin: '0 auto 14px auto', display: 'flex', alignItems: 'center' }}>
          <a
            href="/"
            className="p-btn p-btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'none'
            }}
            title="Go Back to Registration Portal"
          >
            <ArrowLeft size={15} /> Go Back
          </a>
        </div>

        <div className="portal-form-card" style={{ maxWidth: '960px', margin: '0 auto', padding: '24px' }}>

          {/* Filter & Action Controls Bar */}
          <div className="sched-public-filters" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Department Filter */}
              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '13px', background: '#fff', color: '#334155', fontWeight: 500 }}
              >
                <option value="">All Branches</option>
                <optgroup label="Undergraduate Engineering (B.E.)">
                  {DEPARTMENTS.filter(d => d.category === 'Undergraduate (B.E.)').map(d => (
                    <option key={d.code} value={d.code}>{d.code} – {d.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Postgraduate Programs">
                  {DEPARTMENTS.filter(d => d.category === 'Postgraduate').map(d => (
                    <option key={d.code} value={d.code}>{d.code} – {d.name}</option>
                  ))}
                </optgroup>
              </select>

              {/* Year Filter */}
              <select
                value={selectedSem}
                onChange={e => setSelectedSem(e.target.value ? Number(e.target.value) : '')}
                style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '13px', background: '#fff', color: '#334155', fontWeight: 500 }}
              >
                <option value="">All Years</option>
                {SEMESTERS.map(s => (
                  <option key={s.number} value={s.number}>{s.label}</option>
                ))}
              </select>

              {(selectedDept || selectedSem !== '') && (
                <button
                  onClick={() => {
                    setSelectedDept('');
                    setSelectedSem('');
                  }}
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: '6px 10px' }}
                >
                  Reset
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Find the Room Page Link */}
              <a
                href="/navigation.html"
                className="p-btn p-btn-primary"
                style={{ background: '#16a34a', color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
                title="Go to Campus Room Navigation"
              >
                <Compass size={15} /> Find the Room
              </a>
            </div>
          </div>

          {/* Important Notice Banner */}
          <div className="p-notice" style={{ margin: '20px 0', borderRadius: '10px' }}>
            <AlertCircle size={18} />
            <div>
              <strong>Collection Day Instructions:</strong>
              <span style={{ display: 'block', marginTop: '2px' }}>
                All students must bring their official <strong>College Student ID card</strong> and their uniform <strong>Registration ID</strong> (e.g. <code>#4MH22CS001-1</code>) to the assigned room counter.
              </span>
            </div>
          </div>

          {/* Schedule Cards Grid */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              <div className="p-spinner" style={{ margin: '0 auto 12px', width: '28px', height: '28px', borderColor: 'rgba(37,99,235,0.2)', borderTopColor: '#2563eb' }} />
              Loading published schedules...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              <FileText size={36} style={{ color: '#94a3b8', margin: '0 auto 12px' }} />
              <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px' }}>
                {publishedSchedules.length === 0 ? 'No Distribution Schedules Published Yet' : 'No Schedules Matched Your Filters'}
              </h3>
              <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '13px' }}>
                {publishedSchedules.length === 0
                  ? 'Distribution slots are currently being scheduled by the college desk. Please check back soon.'
                  : 'Try selecting another department or year, or reset your filters.'}
              </p>
              <a href="/" className="p-btn p-btn-primary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
                ← Go to Student Registration
              </a>
            </div>
          ) : (
            <div className="sched-public-grid">
              {filtered.map(s => {
                return (
                  <div key={s.id} className="schedule-card is-published public-sched-card">
                    <div className="schedule-header">
                      <div className="slot-badge">
                        <span className="dept-pill">{s.department}</span>
                        <b>{formatAcademicYear(s.semester)} · Section {s.section}</b>
                        {s.gender && s.gender !== 'All' ? (
                          <span className={`gender-badge ${s.gender.toLowerCase()}`} style={{ marginLeft: '6px' }}>
                            {s.gender === 'Male' ? 'Boys Only' : 'Girls Only'}
                          </span>
                        ) : (
                          <span className="gender-badge all" style={{ marginLeft: '6px' }}>
                            All Genders
                          </span>
                        )}
                      </div>
                      <span className={`status-pill ${s.status}`}>
                        {s.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="schedule-details">
                      <div className="detail-item">
                        <CalendarDays size={16} />
                        <span>Date: <b>{s.distribution_date ? new Date(s.distribution_date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date to be announced'}</b></span>
                      </div>

                      <div className="detail-item">
                        <Clock size={16} />
                        <span>Time: <b>{s.start_time?.slice(0, 5) || '10:00'} – {s.end_time?.slice(0, 5) || '13:00'}</b></span>
                      </div>

                      <div className="detail-item" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        <Building size={16} />
                        <span>Venue: <b>{s.building || 'Main Block'}, {s.room || 'Room 101'}</b></span>
                        <a
                          href={`/navigation.html?room=${encodeURIComponent((s.room || '').replace(/^Room\s*/i, '').trim())}`}
                          className="venue-nav-btn"
                          style={{ textDecoration: 'none' }}
                          title={`Navigate to ${s.room}`}
                        >
                          <Compass size={12} />
                          <span>Find the Room</span>
                        </a>
                      </div>

                      {s.instructions && (
                        <div className="instructions-box" style={{ marginTop: '10px' }}>
                          <FileText size={15} />
                          <div>
                            <b>Instructions:</b> {s.instructions}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="schedule-card-foot" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px', marginTop: 'auto' }}>
                      <small style={{ color: '#94a3b8' }}>
                        Batch slot published by MIT Mysore Administration
                      </small>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#10b981' }}>
                        ✓ Active Slot
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom Back Button */}
          <div style={{ marginTop: '30px', textAlign: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
            <a
              href="/"
              className="p-btn p-btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}
              title="Return to Student Registration Portal"
            >
              <ArrowLeft size={16} /> Go Back to Registration Portal
            </a>
          </div>

        </div>

        {/* ── Footer ── */}
        <footer className="portal-footer" style={{ marginTop: '1.5rem', borderRadius: '12px' }}>
          © {currentYear} Maharaja Institute of Technology Mysore · Campus Uniform Distribution System
          <br />
          <span style={{ display: 'block', marginTop: '0.3rem' }}>
            Academic Year {academicYear} · Belagola, Srirangapatna
          </span>
        </footer>
      </div>
    </div>
  );
}
