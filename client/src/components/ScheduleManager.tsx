import { useState } from 'react';
import { DistributionSchedule, ScheduleStatus } from '../types';
import { DEPARTMENTS, SEMESTERS, ALL_SECTIONS, formatAcademicYear } from '../mockData';
import {
  CalendarDays,
  Plus,
  Building,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  MapPin,
  FileText,
  Search,
  Calendar,
  AlertCircle,
  User
} from 'lucide-react';

interface Props {
  schedules: DistributionSchedule[];
  onSaveSchedule: (schedule: Omit<DistributionSchedule, 'id' | 'updated_at'> & { id?: string }) => Promise<void>;
  onDeleteSchedule: (id: string) => Promise<void>;
  onRefresh: () => void;
}

export function ScheduleManager({
  schedules,
  onSaveSchedule,
  onDeleteSchedule,
  onRefresh
}: Props) {
  const [viewTab, setViewTab] = useState<'slots' | 'lookup'>('slots');
  const [selectedDept, setSelectedDept] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<DistributionSchedule | null>(null);

  // Lookup state
  const [lookupDept, setLookupDept] = useState('CSE');
  const [lookupSem, setLookupSem] = useState(1);
  const [lookupSec, setLookupSec] = useState('A');
  const [lookupResult, setLookupResult] = useState<DistributionSchedule | null | undefined>(undefined);

  const handleLookup = () => {
    const found = schedules.find(
      s => s.published &&
        s.department === lookupDept &&
        s.semester === Number(lookupSem) &&
        s.section === lookupSec
    );
    setLookupResult(found || null);
  };

  // Form states
  const [dept, setDept] = useState('CSE');
  const [sem, setSem] = useState(1);
  const [sec, setSec] = useState('A');
  const [gender, setGender] = useState<'All' | 'Male' | 'Female'>('All');
  const [status, setStatus] = useState<ScheduleStatus>('scheduled');
  const [date, setDate] = useState('2026-03-12');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('13:00');
  const [building, setBuilding] = useState('Silver Jubilee Block');
  const [room, setRoom] = useState('Room 204');
  const [instructions, setInstructions] = useState('Bring your college ID card and registration slip.');
  const [published, setPublished] = useState(true);
  const [formError, setFormError] = useState('');

  const filtered = schedules.filter(s => {
    if (selectedDept && s.department !== selectedDept) return false;
    return true;
  });

  const openAdd = () => {
    setDept('CSE');
    setSem(1);
    setSec('A');
    setGender('All');
    setStatus('scheduled');
    setDate(new Date().toISOString().slice(0, 10));
    setStartTime('10:00');
    setEndTime('13:00');
    setBuilding('Silver Jubilee Block');
    setRoom('Room 204');
    setInstructions('Bring your college ID card and registration slip.');
    setPublished(true);
    setFormError('');
    setShowAddModal(true);
  };

  const openEdit = (s: DistributionSchedule) => {
    setEditingSchedule(s);
    setDept(s.department);
    setSem(s.semester);
    setSec(s.section);
    setGender(s.gender || 'All');
    setStatus(s.status);
    setDate(s.distribution_date || '');
    setStartTime(s.start_time?.slice(0, 5) || '10:00');
    setEndTime(s.end_time?.slice(0, 5) || '13:00');
    setBuilding(s.building || '');
    setRoom(s.room || '');
    setInstructions(s.instructions || '');
    setPublished(s.published);
    setFormError('');
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await onSaveSchedule({
        id: editingSchedule?.id,
        department: dept,
        semester: sem,
        section: sec,
        gender,
        status,
        distribution_date: date || null,
        start_time: startTime ? `${startTime}:00` : null,
        end_time: endTime ? `${endTime}:00` : null,
        building,
        room,
        instructions,
        published
      });
      setShowAddModal(false);
      setEditingSchedule(null);
    } catch (err: any) {
      setFormError(err.message || 'Could not save schedule.');
    }
  };

  const togglePublish = async (s: DistributionSchedule) => {
    await onSaveSchedule({
      ...s,
      published: !s.published
    });
  };

  return (
    <div className="schedule-manager-container">
      {/* Sub Tabs */}
      <div className="sub-nav-tabs">
        <button
          className={`sub-nav-tab ${viewTab === 'slots' ? 'active' : ''}`}
          onClick={() => setViewTab('slots')}
        >
          <CalendarDays size={15} /> Distribution Slots ({schedules.length})
        </button>
        <button
          className={`sub-nav-tab ${viewTab === 'lookup' ? 'active' : ''}`}
          onClick={() => {
            setViewTab('lookup');
            handleLookup();
          }}
        >
          <Search size={15} /> Check Schedule (Public Lookup)
        </button>
      </div>

      {viewTab === 'lookup' ? (
        <div className="panel lookup-panel">
          <div className="panelhead">
            <div>
              <h3>Check Uniform Distribution Slot & Location</h3>
              <p>Select department, year, and section to view collection dates and venue</p>
            </div>
            <button className="textbtn" onClick={() => setViewTab('slots')}>
              Manage slots →
            </button>
          </div>

          <div className="portal-lookup-controls">
            <label>
              Department:
              <select value={lookupDept} onChange={e => setLookupDept(e.target.value)}>
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
            </label>

            <label>
              Year:
              <select value={lookupSem} onChange={e => setLookupSem(Number(e.target.value))}>
                {SEMESTERS.map(s => (
                  <option key={s.number} value={s.number}>{s.label}</option>
                ))}
              </select>
            </label>

            <label>
              Section:
              <select value={lookupSec} onChange={e => setLookupSec(e.target.value)}>
                {ALL_SECTIONS.map(s => (
                  <option key={s} value={s}>Sec {s}</option>
                ))}
              </select>
            </label>

            <button className="primary" onClick={handleLookup}>
              <Search size={16} /> Search Schedule
            </button>
          </div>

          <div className="lookup-result-area">
            {lookupResult === undefined ? null : lookupResult === null ? (
              <div className="schedule-not-found">
                <AlertCircle size={24} />
                <div>
                  <b>No published distribution schedule yet</b>
                  <p>The uniform distribution schedule for {lookupDept} {formatAcademicYear(lookupSem)} Sec {lookupSec} has not been published yet or is pending coordinator confirmation.</p>
                </div>
              </div>
            ) : (
              <div className="schedule-found-card">
                <div className="found-header">
                  <div className="badge-verified">
                    <CheckCircle2 size={16} /> Confirmed Distribution Schedule
                  </div>
                  <span className={`status-pill ${lookupResult.status}`}>
                    {lookupResult.status.toUpperCase()}
                  </span>
                </div>

                <div className="found-grid">
                  <div className="found-item">
                    <Calendar size={18} />
                    <div>
                      <small>DISTRIBUTION DATE</small>
                      <strong>{lookupResult.distribution_date ? new Date(lookupResult.distribution_date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'To be announced'}</strong>
                    </div>
                  </div>

                  <div className="found-item">
                    <Clock size={18} />
                    <div>
                      <small>TIME WINDOW</small>
                      <strong>{lookupResult.start_time?.slice(0, 5) || '10:00'} to {lookupResult.end_time?.slice(0, 5) || '13:00'} IST</strong>
                    </div>
                  </div>

                  <div className="found-item">
                    <MapPin size={18} />
                    <div>
                      <small>VENUE / COUNTER</small>
                      <strong>{lookupResult.building}, {lookupResult.room}</strong>
                    </div>
                  </div>

                  <div className="found-item">
                    <User size={18} />
                    <div>
                      <small>TARGET GENDER</small>
                      <strong>{lookupResult.gender === 'Male' ? 'Boys Only' : lookupResult.gender === 'Female' ? 'Girls Only' : 'All Genders (Co-ed)'}</strong>
                    </div>
                  </div>
                </div>

                {lookupResult.instructions && (
                  <div className="instructions-notice">
                    <b>Important Instructions:</b>
                    <p>{lookupResult.instructions}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Top Banner & Actions */}
          <div className="table-top-bar">
            <div className="filter-group">
              <label>Filter Department:</label>
              <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
                <option value="">All Departments ({schedules.length})</option>
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
            </div>

            <div className="table-actions">
              <div className="publish-counter">
                <span className="badge-live">
                  <Eye size={13} /> {schedules.filter(s => s.published).length} Published
                </span>
                <span className="badge-draft">
                  <EyeOff size={13} /> {schedules.filter(s => !s.published).length} Drafts
                </span>
              </div>

              <button className="btn-primary" onClick={openAdd}>
                <Plus size={16} /> Create Distribution Slot
              </button>
            </div>
          </div>

          {/* Grid of Schedules */}
          <div className="schedules-grid">
            {filtered.length === 0 ? (
              <div className="empty-card">
                <CalendarDays size={40} />
                <h4>No distribution schedules found</h4>
                <p>Click "Create Distribution Slot" above to define collection dates and locations for student batches.</p>
              </div>
            ) : (
              filtered.map(s => {
                return (
                  <div key={s.id} className={`schedule-card ${s.published ? 'is-published' : 'is-draft'}`}>
                    <div className="schedule-header">
                      <div className="slot-badge">
                        <span className="dept-pill">{s.department}</span>
                        <b>{formatAcademicYear(s.semester)} · Sec {s.section}</b>
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
                      <div className="schedule-status-group">
                        <span className={`status-pill ${s.status}`}>
                          {s.status.toUpperCase()}
                        </span>
                        <button
                          className={`btn-publish-toggle ${s.published ? 'published' : 'draft'}`}
                          onClick={() => togglePublish(s)}
                          title={s.published ? 'Click to unpublish from students' : 'Click to publish to students'}
                        >
                          {s.published ? <><Eye size={13} /> Published</> : <><EyeOff size={13} /> Draft</>}
                        </button>
                      </div>
                    </div>

                    <div className="schedule-details">
                      <div className="detail-item">
                        <CalendarDays size={15} />
                        <span>Date: <b>{s.distribution_date ? new Date(s.distribution_date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}</b></span>
                      </div>

                      <div className="detail-item">
                        <Clock size={15} />
                        <span>Time: <b>{s.start_time?.slice(0, 5) || '10:00'} - {s.end_time?.slice(0, 5) || '13:00'}</b></span>
                      </div>

                      <div className="detail-item">
                        <Building size={15} />
                        <span>Venue: <b>{s.building || 'Main Block'}, {s.room || 'Room 101'}</b></span>
                      </div>

                      {s.instructions && (
                        <div className="instructions-box">
                          <FileText size={14} />
                          <span>{s.instructions}</span>
                        </div>
                      )}
                    </div>

                    <div className="schedule-card-foot">
                      <small>Updated: {new Date(s.updated_at).toLocaleDateString('en-IN')}</small>
                      <div className="card-actions">
                        <button className="btn-icon" onClick={() => openEdit(s)} title="Edit schedule">
                          <Edit3 size={15} /> Edit
                        </button>
                        <button
                          className="btn-icon danger"
                          onClick={() => {
                            if (window.confirm(`Delete distribution schedule for ${s.department} ${formatAcademicYear(s.semester)} Sec ${s.section}?`)) {
                              onDeleteSchedule(s.id);
                            }
                          }}
                          title="Delete slot"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Add / Edit Schedule Modal */}
      {(showAddModal || editingSchedule) && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3>{editingSchedule ? 'Edit Distribution Slot' : 'Create Distribution Slot'}</h3>
                <p>Assign date, venue, and timing for student batch uniform pickup</p>
              </div>
              <button
                className="close-btn"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingSchedule(null);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitForm}>
              <div className="modal-body formgrid">
                <label>
                  Department
                  <select value={dept} onChange={e => setDept(e.target.value)}>
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
                </label>

                <label>
                  Year
                  <select value={sem} onChange={e => setSem(Number(e.target.value))}>
                    {SEMESTERS.map(s => (
                      <option key={s.number} value={s.number}>{s.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Section
                  <select value={sec} onChange={e => setSec(e.target.value)}>
                    {ALL_SECTIONS.map(s => (
                      <option key={s} value={s}>Section {s}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Gender Target
                  <select value={gender} onChange={e => setGender(e.target.value as 'All' | 'Male' | 'Female')}>
                    <option value="All">All Genders (Co-ed)</option>
                    <option value="Male">Male (Boys Only)</option>
                    <option value="Female">Female (Girls Only)</option>
                  </select>
                </label>

                <label>
                  Status
                  <select value={status} onChange={e => setStatus(e.target.value as ScheduleStatus)}>
                    <option value="scheduled">Scheduled</option>
                    <option value="ready">Ready for Pickup</option>
                    <option value="completed">Completed</option>
                    <option value="postponed">Postponed</option>
                    <option value="pending">Pending</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>

                <label>
                  Distribution Date
                  <input
                    required
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                  />
                </label>

                <div className="time-row">
                  <label>
                    Start Time
                    <input
                      required
                      type="time"
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                    />
                  </label>
                  <label>
                    End Time
                    <input
                      required
                      type="time"
                      value={endTime}
                      onChange={e => setEndTime(e.target.value)}
                    />
                  </label>
                </div>

                <label>
                  Building / Block
                  <input
                    required
                    type="text"
                    value={building}
                    onChange={e => setBuilding(e.target.value)}
                    placeholder="e.g. Silver Jubilee Block"
                  />
                </label>

                <label>
                  Room / Counter
                  <input
                    required
                    type="text"
                    value={room}
                    onChange={e => setRoom(e.target.value)}
                    placeholder="e.g. Room 204 (Counter B)"
                  />
                </label>

                <label className="full-width">
                  Instructions for Students
                  <textarea
                    rows={2}
                    value={instructions}
                    onChange={e => setInstructions(e.target.value)}
                    placeholder="e.g. Bring college ID and signed registration receipt."
                  />
                </label>

                <div className="publish-checkbox full-width">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={published}
                      onChange={e => setPublished(e.target.checked)}
                    />
                    <span>Publish schedule immediately to Student Public Portal</span>
                  </label>
                </div>
              </div>

              {formError && <div className="modal-error">{formError}</div>}

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingSchedule(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" id="btn-submit-schedule">
                  {editingSchedule ? '✓ Update Slot' : '✓ Done (Save Slot)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
