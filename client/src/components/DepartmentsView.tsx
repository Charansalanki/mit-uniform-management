import { StudentRegistration } from '../types';
import { DEPARTMENTS } from '../mockData';
import { GraduationCap, Users, CheckCircle2, Clock3, ArrowUpRight } from 'lucide-react';

interface Props {
  registrations: StudentRegistration[];
  onSelectDept: (deptCode: string) => void;
}

export function DepartmentsView({ registrations, onSelectDept }: Props) {
  const ugDepts = DEPARTMENTS.filter(d => d.category === 'Undergraduate (B.E.)');
  const pgDepts = DEPARTMENTS.filter(d => d.category === 'Postgraduate');

  const renderDeptCard = (dept: typeof DEPARTMENTS[0]) => {
    const deptRegs = registrations.filter(r => r.department === dept.code);
    const collected = deptRegs.filter(r => r.collected_at).length;
    const pending = deptRegs.length - collected;
    const pct = deptRegs.length > 0 ? Math.round((collected / deptRegs.length) * 100) : 0;

    return (
      <div key={dept.code} className="dept-card">
        <div className="dept-card-top">
          <div className="dept-badge-big">{dept.code}</div>
          <div className="dept-info-header">
            <h4>{dept.name}</h4>
            <small>HOD: {dept.hodName}</small>
          </div>
        </div>

        <div className="dept-sections-row">
          <span className="sec-label">Configured Sections (A to G):</span>
          <div className="sec-pills">
            {dept.sections.map(sec => (
              <span key={sec} className="sec-pill">Sec {sec}</span>
            ))}
          </div>
        </div>

        <div className="dept-metrics">
          <div className="dept-metric">
            <Users size={14} />
            <span><b>{deptRegs.length}</b> Registered</span>
          </div>
          <div className="dept-metric green">
            <CheckCircle2 size={14} />
            <span><b>{collected}</b> Issued</span>
          </div>
          <div className="dept-metric orange">
            <Clock3 size={14} />
            <span><b>{pending}</b> Pending</span>
          </div>
        </div>

        <div className="dept-progress-block">
          <div className="progress-labels">
            <span>Distribution Completion</span>
            <b>{pct}%</b>
          </div>
          <div className="meter-track">
            <div className="meter-fill green" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <button
          className="dept-action-btn"
          onClick={() => onSelectDept(dept.code)}
        >
          <span>View Department Students ({deptRegs.length})</span>
          <ArrowUpRight size={15} />
        </button>
      </div>
    );
  };

  return (
    <div className="departments-view">
      <div className="sectionhead">
        <div>
          <h2>Academic Departments & Section Management</h2>
          <p>Configured undergraduate and postgraduate programs, sections (A–G), and live uniform fulfillment</p>
        </div>
      </div>

      <div style={{ marginBottom: '28px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 14px' }}>
          <GraduationCap size={18} /> Undergraduate Engineering (B.E. Branches) · {ugDepts.length} Branches
        </h3>
        <div className="dept-cards-grid">
          {ugDepts.map(renderDeptCard)}
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 14px' }}>
          <GraduationCap size={18} /> Postgraduate Programs · {pgDepts.length} Programs
        </h3>
        <div className="dept-cards-grid">
          {pgDepts.map(renderDeptCard)}
        </div>
      </div>
    </div>
  );
}
