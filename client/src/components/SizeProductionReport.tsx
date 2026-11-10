import { useState, useMemo } from 'react';
import { StudentRegistration, ShirtSize, TrouserSize } from '../types';
import { DEPARTMENTS, formatAcademicYear } from '../mockData';
import { matchRegistrationId } from '../api';
import {
  Shirt,
  Scissors,
  Users,
  Download,
  Printer,
  Search,
  Filter,
  CheckCircle2,
  Clock3,
  User,
  Hash,
  Building2,
  Phone,
  AlertCircle,
  CreditCard
} from 'lucide-react';

interface Props {
  registrations: StudentRegistration[];
  onToggleCollected?: (id: string, collected: boolean) => Promise<void>;
}

const ALL_SHIRT_SIZES: ShirtSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const ALL_TROUSER_SIZES: TrouserSize[] = ['28', '30', '32', '34', '36', '38', '40', '42', '44'];

export function SizeProductionReport({ registrations, onToggleCollected }: Props) {
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedGender, setSelectedGender] = useState<string>('');
  const [selectedShirtSize, setSelectedShirtSize] = useState<string>('');
  const [selectedTrouserSize, setSelectedTrouserSize] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'collected' | 'pending'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'pending' | 'unpaid'>('all');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Filtered student registrations
  const filteredStudents = useMemo(() => {
    return registrations.filter(r => {
      if (selectedDept && r.department !== selectedDept) return false;
      if (selectedGender && (r.gender || 'Male') !== selectedGender) return false;
      if (selectedShirtSize && r.shirtSize !== selectedShirtSize) return false;
      if (selectedTrouserSize && r.trouserSize !== selectedTrouserSize) return false;
      if (statusFilter === 'collected' && !r.collected_at) return false;
      if (statusFilter === 'pending' && r.collected_at) return false;

      // Payment Status Filter
      if (paymentFilter === 'paid') {
        const isPaid = Boolean(r.paymentVerified || r.paymentStatus === 'Payment Verified');
        if (!isPaid) return false;
      } else if (paymentFilter === 'pending') {
        const isPending = r.paymentStatus === 'Payment Submitted' || r.paymentStatus === 'Under Verification';
        if (!isPending) return false;
      } else if (paymentFilter === 'unpaid') {
        const isPaid = Boolean(r.paymentVerified || r.paymentStatus === 'Payment Verified');
        const isPending = r.paymentStatus === 'Payment Submitted' || r.paymentStatus === 'Under Verification';
        if (isPaid || isPending) return false;
      }

      if (search) {
        const q = search.toLowerCase().trim();
        const matchesName = r.fullName.toLowerCase().includes(q);
        const matchesUsn = r.usn.toLowerCase().includes(q);
        const matchesPhone = r.phone.includes(q);
        const matchesId = matchRegistrationId(r.id, q);
        if (!matchesName && !matchesUsn && !matchesPhone && !matchesId) return false;
      }
      return true;
    });
  }, [registrations, search, selectedDept, selectedGender, selectedShirtSize, selectedTrouserSize, statusFilter, paymentFilter]);

  // Size tally for summary chips
  const shirtCounts = useMemo(() => {
    const map: Record<string, number> = {};
    registrations.forEach(r => {
      map[r.shirtSize] = (map[r.shirtSize] || 0) + 1;
    });
    return map;
  }, [registrations]);

  const trouserCounts = useMemo(() => {
    const map: Record<string, number> = {};
    registrations.forEach(r => {
      map[r.trouserSize] = (map[r.trouserSize] || 0) + 1;
    });
    return map;
  }, [registrations]);

  const paymentCounts = useMemo(() => {
    let paid = 0;
    let pending = 0;
    let unpaid = 0;
    registrations.forEach(r => {
      if (r.paymentVerified || r.paymentStatus === 'Payment Verified') {
        paid++;
      } else if (r.paymentStatus === 'Payment Submitted' || r.paymentStatus === 'Under Verification') {
        pending++;
      } else {
        unpaid++;
      }
    });
    return { paid, pending, unpaid };
  }, [registrations]);

  const hasActiveFilters = Boolean(
    selectedDept || selectedGender || selectedShirtSize || selectedTrouserSize || statusFilter !== 'all' || paymentFilter !== 'all' || search.trim()
  );

  const activeFilterDescriptions = useMemo(() => {
    const list: string[] = [];
    if (selectedDept) list.push(`Branch: ${selectedDept}`);
    if (selectedGender) list.push(`Gender: ${selectedGender}`);
    if (selectedShirtSize) list.push(`Shirt Size: ${selectedShirtSize}`);
    if (selectedTrouserSize) list.push(`Pant Size: ${selectedTrouserSize}"`);
    if (statusFilter !== 'all') list.push(`Collection: ${statusFilter === 'collected' ? 'Collected' : 'Pending'}`);
    if (paymentFilter !== 'all') {
      const label = paymentFilter === 'paid' ? 'Paid (Verified)' : paymentFilter === 'pending' ? 'Pending Verification' : 'Not Paid';
      list.push(`Payment: ${label}`);
    }
    if (search.trim()) list.push(`Search: "${search.trim()}"`);
    return list;
  }, [selectedDept, selectedGender, selectedShirtSize, selectedTrouserSize, statusFilter, paymentFilter, search]);

  // Export CSV of students with their shirt and pant sizes based on current filters
  const exportStudentSizesCSV = () => {
    if (filteredStudents.length === 0) {
      alert(
        hasActiveFilters
          ? `⚠️ No students found matching your selected filters (${activeFilterDescriptions.join(', ')}).\n\nPlease change or reset your filters before downloading.`
          : '⚠️ No student uniform records found in the database to export.'
      );
      return;
    }

    const headers = [
      'Registration ID',
      'Student Name',
      'Gender',
      'USN',
      'Department / Branch',
      'Year',
      'Section',
      'Shirt Size',
      'Pant (Trouser) Size',
      'Payment Status',
      'Shirt Units (x2)',
      'Trouser Units (x2)',
      'Phone Number',
      'Collection Status',
      'Collection Date',
      'Collected By',
      'Submission Date'
    ];

    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '""';
      let s = String(val).replace(/"/g, '""');
      if (/^[=\+\-@\t\r]/.test(s)) {
        s = `'${s}`;
      }
      return `"${s}"`;
    };

    const rows = filteredStudents.map(r => {
      const isPaid = Boolean(r.paymentVerified || r.paymentStatus === 'Payment Verified');
      const payLabel = isPaid
        ? 'Paid'
        : r.paymentStatus === 'Payment Submitted' || r.paymentStatus === 'Under Verification'
        ? 'Pending Verification'
        : r.paymentStatus === 'Payment Rejected'
        ? 'Rejected'
        : 'Not Paid';

      return [
        r.id.toUpperCase().startsWith('#') ? r.id.toUpperCase() : `#${r.id.toUpperCase()}`,
        r.fullName,
        r.gender || 'Male',
        r.usn,
        r.department,
        formatAcademicYear(r.semester),
        r.section,
        r.shirtSize,
        `${r.trouserSize}" inches`,
        payLabel,
        '2 pcs',
        '2 pcs',
        r.phone,
        r.collected_at ? 'Collected' : 'Pending',
        r.collected_at ? new Date(r.collected_at).toLocaleString('en-IN') : 'Pending Collection',
        r.collected_by || (r.collected_at ? 'Admin Desk' : 'N/A'),
        new Date(r.submitted_at).toLocaleDateString('en-IN')
      ];
    });

    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...rows.map(e => e.map(escapeCSV).join(','))
    ].join('\r\n');

    // Create Blob with UTF-8 BOM so Excel opens with proper character encoding
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Dynamic filename based on selected filters
    const filterParts: string[] = [];
    if (selectedDept) filterParts.push(`Branch-${selectedDept}`);
    if (selectedShirtSize) filterParts.push(`Shirt-${selectedShirtSize}`);
    if (selectedTrouserSize) filterParts.push(`Pant-${selectedTrouserSize}`);
    if (statusFilter !== 'all') filterParts.push(`Status-${statusFilter}`);

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = filterParts.length > 0
      ? `MIT_Uniform_Sizes_${filterParts.join('_')}_${dateStr}.csv`
      : `MIT_Student_Uniform_Sizes_Master_Roster_${dateStr}.csv`;

    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportNotice(`✓ Successfully downloaded ${filteredStudents.length} student records (${fileName})`);
    setTimeout(() => setExportNotice(null), 4500);
  };

  return (
    <div className="production-report-container">
      {/* Top Bar */}
      <div className="table-top-bar">
        <div>
          <h3>Student Uniform Size & Production Roster</h3>
          <p className="muted">Master tailor registry: Student name, shirt size, and trouser (pant) size allocations</p>
        </div>

        <div className="table-actions">
          <button 
            className="btn-secondary" 
            onClick={exportStudentSizesCSV}
            title={
              hasActiveFilters 
                ? `Download CSV of ${filteredStudents.length} selected students (${activeFilterDescriptions.join(', ')})`
                : `Download CSV of all ${filteredStudents.length} students`
            }
          >
            <Download size={15} /> 
            {hasActiveFilters 
              ? `Download Selected Sizes (${filteredStudents.length} Students) (.CSV)`
              : `Export Sizes (${filteredStudents.length} Students) (.CSV)`
            }
          </button>
          <button className="btn-primary" onClick={() => window.print()}>
            <Printer size={15} /> Print Size Sheet
          </button>
        </div>
      </div>

      {/* Active Filter Scope Notice */}
      {hasActiveFilters && (
        <div className="filter-scope-banner">
          <div className="fsb-left">
            <span className="fsb-badge">Filter Active</span>
            <span className="fsb-text">
              Export will only download:
              {selectedDept && <b> [Branch: {selectedDept}]</b>}
              {selectedGender && <b> [Gender: {selectedGender}]</b>}
              {selectedShirtSize && <b> [Shirt: {selectedShirtSize}]</b>}
              {selectedTrouserSize && <b> [Pant: {selectedTrouserSize}"]</b>}
              {statusFilter !== 'all' && <b> [Status: {statusFilter === 'collected' ? 'Collected' : 'Pending'}]</b>}
              {paymentFilter !== 'all' && <b> [Payment: {paymentFilter === 'paid' ? 'Paid' : paymentFilter === 'pending' ? 'Pending' : 'Not Paid'}]</b>}
              {search.trim() && <b> [Search: "{search.trim()}"]</b>}
              {' '}— <strong>{filteredStudents.length} student(s) selected</strong>
            </span>
          </div>
          <button
            className="btn-text-clear"
            onClick={() => {
              setSearch('');
              setSelectedDept('');
              setSelectedGender('');
              setSelectedShirtSize('');
              setSelectedTrouserSize('');
              setStatusFilter('all');
              setPaymentFilter('all');
            }}
          >
            Reset Filters (Show All {registrations.length})
          </button>
        </div>
      )}

      {exportNotice && (
        <div className="export-success-notice">
          <CheckCircle2 size={16} /> {exportNotice}
        </div>
      )}

      {/* Summary Chips Bar */}
      <div className="size-summary-bar">
        <div className="ss-card">
          <div className="ss-icon blue"><Shirt size={18} /></div>
          <div className="ss-body">
            <span className="ss-label">Shirt Size Tally (Total {registrations.length})</span>
            <div className="ss-chips">
              {ALL_SHIRT_SIZES.map(sz => (
                <span
                  key={sz}
                  className={`size-tally-chip ${selectedShirtSize === sz ? 'active' : ''}`}
                  onClick={() => setSelectedShirtSize(selectedShirtSize === sz ? '' : sz)}
                  title={`Click to filter Size ${sz}`}
                >
                  <b>{sz}:</b> {shirtCounts[sz] || 0}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="ss-card">
          <div className="ss-icon purple"><Scissors size={18} /></div>
          <div className="ss-body">
            <span className="ss-label">Trouser (Pant) Waist Tally</span>
            <div className="ss-chips">
              {ALL_TROUSER_SIZES.map(sz => (
                <span
                  key={sz}
                  className={`size-tally-chip purple ${selectedTrouserSize === sz ? 'active' : ''}`}
                  onClick={() => setSelectedTrouserSize(selectedTrouserSize === sz ? '' : sz)}
                  title={`Click to filter ${sz}"`}
                >
                  <b>{sz}":</b> {trouserCounts[sz] || 0}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="ss-card">
          <div className="ss-icon green"><Users size={18} /></div>
          <div className="ss-body">
            <span className="ss-label">Gender Tally</span>
            <div className="ss-chips">
              <span
                className={`size-tally-chip ${selectedGender === 'Male' ? 'active' : ''}`}
                onClick={() => setSelectedGender(selectedGender === 'Male' ? '' : 'Male')}
                title="Click to filter Male"
              >
                <b>Male:</b> {registrations.filter(r => (r.gender || 'Male') === 'Male').length}
              </span>
              <span
                className={`size-tally-chip purple ${selectedGender === 'Female' ? 'active' : ''}`}
                onClick={() => setSelectedGender(selectedGender === 'Female' ? '' : 'Female')}
                title="Click to filter Female"
              >
                <b>Female:</b> {registrations.filter(r => r.gender === 'Female').length}
              </span>
            </div>
          </div>
        </div>

        <div className="ss-card">
          <div className="ss-icon" style={{ background: '#ecfdf5', color: '#16a34a' }}><CreditCard size={18} /></div>
          <div className="ss-body">
            <span className="ss-label">Payment Tally</span>
            <div className="ss-chips">
              <span
                className={`size-tally-chip ${paymentFilter === 'paid' ? 'active' : ''}`}
                style={{ background: paymentFilter === 'paid' ? '#16a34a' : '#dcfce7', color: paymentFilter === 'paid' ? '#fff' : '#15803d', borderColor: '#86efac' }}
                onClick={() => setPaymentFilter(paymentFilter === 'paid' ? 'all' : 'paid')}
                title="Click to filter Paid (Verified)"
              >
                <b>Paid:</b> {paymentCounts.paid}
              </span>
              <span
                className={`size-tally-chip ${paymentFilter === 'pending' ? 'active' : ''}`}
                style={{ background: paymentFilter === 'pending' ? '#d97706' : '#fef3c7', color: paymentFilter === 'pending' ? '#fff' : '#92400e', borderColor: '#fde68a' }}
                onClick={() => setPaymentFilter(paymentFilter === 'pending' ? 'all' : 'pending')}
                title="Click to filter Pending Verification"
              >
                <b>Pending:</b> {paymentCounts.pending}
              </span>
              <span
                className={`size-tally-chip ${paymentFilter === 'unpaid' ? 'active' : ''}`}
                style={{ background: paymentFilter === 'unpaid' ? '#475569' : '#f1f5f9', color: paymentFilter === 'unpaid' ? '#fff' : '#64748b', borderColor: '#cbd5e1' }}
                onClick={() => setPaymentFilter(paymentFilter === 'unpaid' ? 'all' : 'unpaid')}
                title="Click to filter Not Paid"
              >
                <b>Not Paid:</b> {paymentCounts.unpaid}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="size-filter-row">
        <div className="search-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by student name, USN, or Registration ID (e.g. #4MH22CS001-1)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
          />
          {search && (
            <button className="clear-search" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div className="filter-group">
          {/* Dept filter */}
          <select
            value={selectedDept}
            onChange={e => setSelectedDept(e.target.value)}
            className="filter-select"
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

          {/* Gender filter */}
          <select
            value={selectedGender}
            onChange={e => setSelectedGender(e.target.value)}
            className="filter-select"
          >
            <option value="">All Genders</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>

          {/* Shirt Size filter */}
          <select
            value={selectedShirtSize}
            onChange={e => setSelectedShirtSize(e.target.value)}
            className="filter-select"
          >
            <option value="">All Shirts</option>
            {ALL_SHIRT_SIZES.map(sz => (
              <option key={sz} value={sz}>Shirt: {sz}</option>
            ))}
          </select>

          {/* Trouser Size filter */}
          <select
            value={selectedTrouserSize}
            onChange={e => setSelectedTrouserSize(e.target.value)}
            className="filter-select"
          >
            <option value="">All Pants</option>
            {ALL_TROUSER_SIZES.map(sz => (
              <option key={sz} value={sz}>Pant: {sz}"</option>
            ))}
          </select>

          {/* Payment filter */}
          <select
            value={paymentFilter}
            onChange={e => setPaymentFilter(e.target.value as any)}
            className="filter-select"
            style={{ fontWeight: 600 }}
          >
            <option value="all">All Payments</option>
            <option value="paid">Paid (Verified)</option>
            <option value="pending">Pending Verification</option>
            <option value="unpaid">Not Paid</option>
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending Collection</option>
            <option value="collected">Collected</option>
          </select>

          {(search || selectedDept || selectedGender || selectedShirtSize || selectedTrouserSize || statusFilter !== 'all' || paymentFilter !== 'all') && (
            <button
              className="btn-text-clear"
              onClick={() => {
                setSearch('');
                setSelectedDept('');
                setSelectedGender('');
                setSelectedShirtSize('');
                setSelectedTrouserSize('');
                setStatusFilter('all');
                setPaymentFilter('all');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Student Size Table */}
      <div className="panel student-sizes-panel">
        <div className="panelhead">
          <div>
            <h3>
              Student Uniform List ({filteredStudents.length} of {registrations.length})
            </h3>
            <p>Showing full student name with assigned shirt size & pant waist size</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="pill">
              {filteredStudents.length} Students Listed
            </span>
            <button 
              className="btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={exportStudentSizesCSV}
              title="Download CSV of current filtered students"
            >
              <Download size={13} /> {hasActiveFilters ? `Download Filtered (${filteredStudents.length})` : `Download All (${filteredStudents.length})`}
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="admin-table size-roster-table">
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Reg ID</th>
                <th>Student Full Name</th>
                <th>Gender</th>
                <th>USN</th>
                <th>Branch / Class</th>
                <th style={{ background: '#f0f7ff', color: '#1e40af' }}>Shirt Size</th>
                <th style={{ background: '#faf5ff', color: '#6b21a8' }}>Pant Size</th>
                <th style={{ background: '#ecfdf5', color: '#065f46' }}>Payment</th>
                <th>Phone</th>
                <th>Status</th>
                {onToggleCollected && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={onToggleCollected ? 11 : 10} style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ color: '#64748b', fontSize: '15px' }}>
                      No student registrations matched your search / filters.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map(student => {
                  const isCollected = Boolean(student.collected_at);
                  const isPaid = Boolean(student.paymentVerified || student.paymentStatus === 'Payment Verified');
                  const displayId = `#${student.id.toUpperCase().replace(/^#/, '')}`;

                  return (
                    <tr key={student.id}>
                      <td>
                        <span className="roster-reg-id" title={student.id}>
                          {displayId}
                        </span>
                      </td>

                      <td>
                        <div className="roster-student-name">
                          <div className="avatar-chip">
                            {student.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <b>{student.fullName}</b>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className={`gender-badge ${(student.gender || 'Male').toLowerCase()}`}>
                          {student.gender || 'Male'}
                        </span>
                      </td>

                      <td>
                        <span className="usn-badge">{student.usn}</span>
                      </td>

                      <td>
                        <span className="dept-badge">
                          {student.department} · {formatAcademicYear(student.semester)}-{student.section}
                        </span>
                      </td>

                      <td style={{ background: '#f8fafc' }}>
                        <span className="size-badge-shirt">
                          <Shirt size={14} /> Size {student.shirtSize}
                        </span>
                      </td>

                      <td style={{ background: '#f8fafc' }}>
                        <span className="size-badge-trouser">
                          <Scissors size={14} /> {student.trouserSize}" Waist
                        </span>
                      </td>

                      {/* Payment Status Column */}
                      <td>
                        {isPaid ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 10px',
                              borderRadius: '20px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              background: '#dcfce7',
                              color: '#15803d',
                              border: '1px solid #86efac',
                              letterSpacing: '0.03em'
                            }}
                            title="Payment Verified against official bank statement"
                          >
                            <CheckCircle2 size={13} /> Paid
                          </span>
                        ) : student.paymentStatus === 'Payment Submitted' || student.paymentStatus === 'Under Verification' ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 10px',
                              borderRadius: '20px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: '#fef3c7',
                              color: '#92400e',
                              border: '1px solid #fde68a'
                            }}
                            title="Payment submitted, awaiting admin verification"
                          >
                            <Clock3 size={12} /> Pending Verification
                          </span>
                        ) : student.paymentStatus === 'Payment Rejected' ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 10px',
                              borderRadius: '20px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: '#fee2e2',
                              color: '#991b1b',
                              border: '1px solid #fca5a5'
                            }}
                          >
                            <AlertCircle size={12} /> Rejected
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 10px',
                              borderRadius: '20px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: '#f1f5f9',
                              color: '#64748b',
                              border: '1px solid #cbd5e1'
                            }}
                          >
                            Not Paid
                          </span>
                        )}
                      </td>

                      <td>
                        <span className="phone-cell">{student.phone}</span>
                      </td>

                      <td>
                        {isCollected ? (
                          <span className="status-badge collected">
                            <CheckCircle2 size={13} /> Collected
                          </span>
                        ) : (
                          <span className="status-badge pending">
                            <Clock3 size={13} /> Pending
                          </span>
                        )}
                      </td>

                      {onToggleCollected && (
                        <td>
                          <button
                            className={`btn-action ${isCollected ? 'undo' : 'collect'}`}
                            onClick={() => onToggleCollected(student.id, !isCollected)}
                          >
                            {isCollected ? 'Undo' : 'Mark Collected'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
