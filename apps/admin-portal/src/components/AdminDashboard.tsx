import { useState, useMemo } from 'react';
import { StudentRegistration, DistributionSchedule, AdminSummary } from '../types';
import { DEPARTMENTS, parseCampaignYears, formatAcademicYear } from '../mockData';
import { matchRegistrationId } from '../api';
import {
  Users,
  PackageCheck,
  Clock3,
  GraduationCap,
  Shirt,
  CalendarDays,
  ArrowUpRight,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Download,
  Plus,
  RefreshCw,
  ExternalLink,
  Search
} from 'lucide-react';

interface Props {
  summary: AdminSummary;
  campaign: string;
  registrations: StudentRegistration[];
  schedules: DistributionSchedule[];
  onNavigate: (page: string) => void;
  onRefresh: () => void;
  onToggleCollected: (id: string, collected: boolean) => Promise<void>;
}

export function AdminDashboard({
  summary,
  campaign,
  registrations,
  schedules,
  onNavigate,
  onRefresh,
  onToggleCollected
}: Props) {
  const [searchId, setSearchId] = useState('');
  const [searched, setSearched] = useState(false);
  const [foundStudent, setFoundStudent] = useState<StudentRegistration | null>(null);

  const collectionPct = summary.registered > 0 ? Math.round((summary.collected / summary.registered) * 100) : 0;
  const recentRegistrations = [...registrations].slice(0, 5);
  const upcomingSchedules = schedules.filter(s => s.published && s.status !== 'completed').slice(0, 3);
  const maleCount = registrations.filter(r => (r.gender || 'Male') === 'Male').length;
  const femaleCount = registrations.filter(r => r.gender === 'Female').length;
  const { academicYear } = useMemo(() => parseCampaignYears(campaign), [campaign]);

  const handleIdSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchId.trim();
    if (!q) return;
    const match = registrations.find(r => matchRegistrationId(r.id, q));
    setFoundStudent(match || null);
    setSearched(true);
  };

  return (
    <div className="admin-dashboard">
      {/* Campaign Banner */}
      <div className="campaign-hero">
        <div className="campicon">
          <Shirt size={24} />
        </div>
        <div className="campcopy">
          <div className="camp-tags">
            <span className="pill"><i /> Active Campaign</span>
            <span className="camp-type">Academic Year {academicYear}</span>
          </div>
          <h3>{campaign}</h3>
          <p>Supervising uniform measurements, tailors manufacturing, and hall distributions across MIT Mysore</p>
        </div>
        <div className="camp-actions">
          <button className="primary" onClick={() => onNavigate('Registrations')}>
            <Users size={16} /> Manage Registrations <ArrowUpRight size={15} />
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('Distribution Schedule')}>
            <CalendarDays size={16} /> Schedule Halls
          </button>
        </div>
      </div>

      {/* Registration ID Quick Lookup Card */}
      <div className="reg-search-card">
        <div className="reg-search-header">
          <div className="reg-search-icon"><Search size={20} /></div>
          <div>
            <h3>Quick Registration ID Lookup</h3>
            <p>Search any student uniform registration directly by Registration ID (e.g. <b>#4MH22CS001-1</b> or USN <b>4MH22CS001</b>)</p>
          </div>
        </div>

        <form onSubmit={handleIdSearch} className="reg-search-form">
          <div className="reg-search-input-wrap">
            <span className="hash-prefix">#</span>
            <input
              type="text"
              placeholder="Enter Registration ID (e.g. REG-17931972, reg-001)"
              value={searchId}
              onChange={e => {
                setSearchId(e.target.value);
                if (searched && !e.target.value) setSearched(false);
              }}
              className="reg-search-input"
            />
            {searchId && (
              <button
                type="button"
                className="reg-search-clear"
                onClick={() => {
                  setSearchId('');
                  setFoundStudent(null);
                  setSearched(false);
                }}
              >
                ✕
              </button>
            )}
          </div>
          <button type="submit" className="btn-primary reg-search-btn">
            <Search size={16} /> Search ID
          </button>
        </form>

        {/* Search Result */}
        {searched && (
          foundStudent ? (
            <div className="reg-search-result found">
              <div className="rs-head">
                <div className="rs-badge-ok">✓ Registration Found</div>
                <div className="rs-id-tag">#{foundStudent.id.toUpperCase().replace(/^#/, '')}</div>
              </div>

              <div className="rs-grid">
                <div className="rs-item">
                  <span className="rs-label">Student Name</span>
                  <strong className="rs-val name">{foundStudent.fullName}</strong>
                </div>
                <div className="rs-item">
                  <span className="rs-label">Gender</span>
                  <span className="rs-val">{foundStudent.gender || 'Male'}</span>
                </div>
                <div className="rs-item">
                  <span className="rs-label">USN</span>
                  <span className="rs-val usn-badge">{foundStudent.usn}</span>
                </div>
                <div className="rs-item">
                  <span className="rs-label">Department / Year</span>
                  <span className="rs-val">{foundStudent.department} · {formatAcademicYear(foundStudent.semester)}-{foundStudent.section}</span>
                </div>
                <div className="rs-item">
                  <span className="rs-label">Shirt Size</span>
                  <strong className="rs-val size-chip">{foundStudent.shirtSize}</strong>
                </div>
                <div className="rs-item">
                  <span className="rs-label">Pant / Trouser Size</span>
                  <strong className="rs-val size-chip">{foundStudent.trouserSize}"</strong>
                </div>
                <div className="rs-item">
                  <span className="rs-label">Phone</span>
                  <span className="rs-val">{foundStudent.phone}</span>
                </div>
                <div className="rs-item">
                  <span className="rs-label">Status</span>
                  <span className="rs-val">
                    {foundStudent.collected_at ? (
                      <span className="status-badge collected"><CheckCircle2 size={13} /> Collected</span>
                    ) : (
                      <span className="status-badge pending"><Clock3 size={13} /> Pending Collection</span>
                    )}
                  </span>
                </div>
                <div className="rs-item rs-actions-col">
                  <span className="rs-label">Desk Action</span>
                  <div className="rs-action-btns">
                    <button
                      className={`btn-action ${foundStudent.collected_at ? 'undo' : 'collect'}`}
                      onClick={async () => {
                        await onToggleCollected(foundStudent.id, !foundStudent.collected_at);
                        setFoundStudent(prev => prev ? {
                          ...prev,
                          collected_at: prev.collected_at ? null : new Date().toISOString()
                        } : null);
                      }}
                    >
                      {foundStudent.collected_at ? 'Undo Collection' : '✓ Mark Uniform Collected'}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => onNavigate('Registrations')}
                    >
                      Open in Registrations Table →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="reg-search-result notfound">
              <div className="rs-notfound-icon">⚠️</div>
              <div style={{ flex: 1 }}>
                <b>No student found with ID "{searchId}"</b>
                <p style={{ margin: '3px 0 0', fontSize: '13px' }}>
                  Please verify the ID on the student's confirmation slip, or search by student name/USN in the Registrations table.
                </p>
              </div>
              <button
                className="btn-secondary"
                onClick={() => onNavigate('Registrations')}
              >
                Go to Registrations
              </button>
            </div>
          )
        )}
      </div>

      {/* KPI Stats Grid */}
      <div className="sectionhead">
        <div>
          <h2>Operational Overview</h2>
          <p>Real-time campus statistics & distribution status</p>
        </div>
        <button className="filter" onClick={onRefresh}>
          <RefreshCw size={13} /> Refresh live metrics
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-top">
            <div className="staticon blue"><Users size={18} /></div>
            <span className="trend positive">Live</span>
          </div>
          <div className="statlabel">Total Registrations</div>
          <strong>{summary.registered.toLocaleString('en-IN')}</strong>
          <div className="statsub">Male: {maleCount} · Female: {femaleCount}</div>
          <div className="statline"><span style={{ width: '100%' }} /></div>
        </div>

        <div className="stat">
          <div className="stat-top">
            <div className="staticon green"><PackageCheck size={18} /></div>
            <span className="trend positive">{collectionPct}% Collected</span>
          </div>
          <div className="statlabel">Uniforms Issued</div>
          <strong>{summary.collected.toLocaleString('en-IN')}</strong>
          <div className="statsub">Verified badge collections</div>
          <div className="statline"><span style={{ width: `${collectionPct}%`, background: '#21a879' }} /></div>
        </div>

        <div className="stat">
          <div className="stat-top">
            <div className="staticon orange"><Clock3 size={18} /></div>
            <span className="trend warning">{summary.pending} Awaiting</span>
          </div>
          <div className="statlabel">Pending Pickups</div>
          <strong>{summary.pending.toLocaleString('en-IN')}</strong>
          <div className="statsub">Students yet to collect uniforms</div>
          <div className="statline"><span style={{ width: `${100 - collectionPct}%`, background: '#db9533' }} /></div>
        </div>

        <div className="stat">
          <div className="stat-top">
            <div className="staticon purple"><GraduationCap size={18} /></div>
            <span className="trend neutral">{DEPARTMENTS.length} Active</span>
          </div>
          <div className="statlabel">Academic Branches</div>
          <strong>{summary.departments}</strong>
          <div className="statsub">Departments with submissions</div>
          <div className="statline"><span style={{ width: '85%', background: '#8a66d8' }} /></div>
        </div>
      </div>

      {/* Grid: Department Progress & Quick Actions */}
      <div className="grid2">
        {/* Department Fulfillment Meter */}
        <div className="panel">
          <div className="panelhead">
            <div>
              <h3>Branch-wise Uniform Fulfillment</h3>
              <p>Collection progress across engineering departments</p>
            </div>
            <button className="textbtn" onClick={() => onNavigate('Registrations')}>
              View registrations <ArrowUpRight size={14} />
            </button>
          </div>

          <div className="dept-progress-list">
            {DEPARTMENTS.map(dept => {
              const inDept = registrations.filter(r => r.department === dept.code);
              const collected = inDept.filter(r => r.collected_at).length;
              const pct = inDept.length > 0 ? Math.round((collected / inDept.length) * 100) : 0;

              return (
                <div key={dept.code} className="dept-meter-row">
                  <div className="dept-label-col">
                    <span className="dept-code-pill">{dept.code}</span>
                    <small>{dept.name}</small>
                  </div>
                  <div className="meter-wrapper">
                    <div className="meter-track">
                      <div className="meter-fill green" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="dept-counts">
                    <b>{collected}/{inDept.length}</b>
                    <small>{pct}%</small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions & Upcoming Schedule */}
        <div className="panel">
          <div className="panelhead">
            <div>
              <h3>Quick Administrative Tools</h3>
              <p>Key shortcuts for distribution desk officers</p>
            </div>
          </div>

          <div className="quickgrid">
            <button className="quick" onClick={() => onNavigate('Registrations')}>
              <span><Users size={16} /></span>
              <div>
                <b>Student Registrations</b>
                <small>Search, edit & mark collection</small>
              </div>
              <ArrowUpRight size={14} />
            </button>

            <button className="quick" onClick={() => onNavigate('Size & Production')}>
              <span><Shirt size={16} /></span>
              <div>
                <b>Size & Tailor Report</b>
                <small>Shirt & trouser order totals</small>
              </div>
              <ArrowUpRight size={14} />
            </button>

            <button className="quick" onClick={() => onNavigate('Distribution Schedule')}>
              <span><CalendarDays size={16} /></span>
              <div>
                <b>Distribution Halls</b>
                <small>Manage dates & venues</small>
              </div>
              <ArrowUpRight size={14} />
            </button>


          </div>

          {/* Upcoming Distribution Alert */}
          <div className="upcoming-block">
            <b>Upcoming Distribution Counters:</b>
            {upcomingSchedules.length === 0 ? (
              <small className="muted">No upcoming schedules. Publish slots in Distribution Schedule.</small>
            ) : (
              upcomingSchedules.map(s => (
                <div key={s.id} className="upcoming-item">
                  <CalendarDays size={15} />
                  <div>
                    <b>{s.department} {formatAcademicYear(s.semester)} (Sec {s.section})</b>
                    <small>{s.distribution_date || 'Date TBD'} · {s.building}, {s.room}</small>
                  </div>
                  <span className={`status-pill ${s.status}`}>{s.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Registrations Table */}
      <div className="panel recent-panel">
        <div className="panelhead">
          <div>
            <h3>Recent Student Registrations</h3>
            <p>Latest uniform size submissions received</p>
          </div>
          <button className="textbtn" onClick={() => onNavigate('Registrations')}>
            View full table ({registrations.length}) <ArrowUpRight size={15} />
          </button>
        </div>

        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>USN</th>
                <th>Full Name</th>
                <th>Gender</th>
                <th>Branch</th>
                <th>Sizes (Shirt / Trs)</th>
                <th>Status</th>
                <th>Desk Action</th>
              </tr>
            </thead>
            <tbody>
              {recentRegistrations.map(r => {
                const isCollected = Boolean(r.collected_at);
                return (
                  <tr key={r.id}>
                    <td><span className="usn-badge">{r.usn}</span></td>
                    <td><b>{r.fullName}</b></td>
                    <td>
                      <span className={`gender-badge ${(r.gender || 'Male').toLowerCase()}`}>
                        {r.gender || 'Male'}
                      </span>
                    </td>
                    <td><span className="dept-badge">{r.department} ({formatAcademicYear(r.semester)}-{r.section})</span></td>
                    <td><span className="sizes-pill">Shirt: {r.shirtSize} · Trs: {r.trouserSize}"</span></td>
                    <td>
                      {isCollected ? (
                        <span className="status-badge collected"><CheckCircle2 size={13} /> Collected</span>
                      ) : (
                        <span className="status-badge pending"><Clock3 size={13} /> Pending</span>
                      )}
                    </td>
                    <td>
                      <button
                        className={`btn-action ${isCollected ? 'undo' : 'collect'}`}
                        onClick={() => onToggleCollected(r.id, !isCollected)}
                      >
                        {isCollected ? 'Undo' : 'Mark Collected'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
