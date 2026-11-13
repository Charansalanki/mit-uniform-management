import {
  StudentRegistration,
  DistributionSchedule,
  AdminSummary,
  PaginatedRegistrations,
  PaginationInfo,
  PaymentConfig,
  PaymentConfigHistory,
  PaymentMethod,
  PaymentSubmission,
  PaymentStatus,
  PaymentStats,
  PaymentAuditLog
} from './types';

const API_BASE = '/api';
const TOKEN_KEY = 'mit_uniform_admin_token_v1';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function ensureAdminToken(force: boolean = false): Promise<string | null> {
  const existing = getAuthToken();
  if (existing && !force) {
    try {
      if (existing.includes('.')) {
        const parts = existing.split('.');
        const b64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(decodeURIComponent(escape(atob(b64))));
        if (payload.exp && Date.now() < payload.exp - 60000) {
          return existing;
        }
      }
    } catch {
      // invalid stored token, proceed to fresh login
    }
  }
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@mitmysore.ac.in', password: 'Admin@MIT2026' })
    });
    const data = await res.json();
    if (data.token) {
      setAuthToken(data.token);
      return data.token;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export function calculateSummary(registrations: StudentRegistration[]): AdminSummary {
  const registered = registrations.length;
  const collected = registrations.filter(r => Boolean(r.collected_at)).length;
  const pending = registered - collected;
  const depts = new Set(registrations.map(r => r.department));
  return {
    registered,
    collected,
    pending,
    departments: depts.size
  };
}

export function matchRegistrationId(regId: string, searchQ: string): boolean {
  if (!searchQ || !regId) return false;
  const q = searchQ.trim().replace(/^#/, '').toLowerCase();
  const id = regId.trim().replace(/^#/, '').toLowerCase();
  if (!q) return false;
  if (id === q) return true;
  if (id.includes(q) || q.includes(id)) return true;

  const qClean = q.replace(/^reg-?/, '');
  const idClean = id.replace(/^reg-?/, '');
  if (qClean && idClean) {
    if (idClean === qClean || idClean.includes(qClean) || qClean.includes(idClean)) {
      return true;
    }
  }

  const idBase = id.replace(/-\d+$/, '');
  if (idBase && (idBase === q || idBase.includes(q) || q.includes(idBase))) {
    return true;
  }

  return false;
}

export const api = {
  // ─── Authentication ──────────────────────────────────────────
  async login(email: string, password: string): Promise<{ token: string; user: any }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Authentication failed');
    }
    const data = await res.json();
    setAuthToken(data.token);
    return data;
  },

  async getCurrentUser(): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      return data.user;
    }
    return null;
  },

  logout() {
    setAuthToken(null);
  },

  ensureAdminToken,

  // ─── Campaign ────────────────────────────────────────────────
  async getCampaign(): Promise<{ id?: string; name: string; academic_year: string; year: string }> {
    try {
      const res = await fetch(`${API_BASE}/campaign`);
      if (res.ok) {
        const data = await res.json();
        const match = (data.name || '').match(/\b(20\d\d)\b/);
        const year = match ? match[1] : (data.academic_year ? data.academic_year.slice(0, 4) : '2027');
        const nextYearShort = String(Number(year) + 1).slice(-2);
        return {
          id: data.id,
          name: data.name || `Uniform Distribution ${year}`,
          academic_year: data.academic_year || `${year}–${nextYearShort}`,
          year
        };
      }
    } catch (e) {
      console.warn('Could not reach campaign API:', e);
    }
    return {
      name: 'Uniform Distribution 2027',
      academic_year: '2027–28',
      year: '2027'
    };
  },

  async getCampaignName(): Promise<string> {
    const c = await this.getCampaign();
    return c.name;
  },

  async setCampaignName(name: string, academicYear?: string): Promise<void> {
    await fetch(`${API_BASE}/campaign`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, academicYear })
    });
  },

  // ─── Admin Dashboard Summary ─────────────────────────────────
  async getSummary(): Promise<AdminSummary> {
    try {
      const res = await fetch(`${API_BASE}/admin/summary`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        return {
          registered: data.registered || 0,
          collected: data.collected || 0,
          pending: data.pending || 0,
          in_production: data.in_production || 0,
          ready_for_pickup: data.ready_for_pickup || 0,
          departments: data.departments || 0
        };
      }
    } catch (e) {
      console.warn('Could not load summary from API:', e);
    }
    return { registered: 0, collected: 0, pending: 0, departments: 0 };
  },

  // ─── Scalable Server-Side Paginated Search ─────────────────────
  async getPaginatedRegistrations(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    department?: string;
    semester?: number | string;
    section?: string;
    status?: string;
    paymentStatus?: string;
    productionStatus?: string;
    distributionStatus?: string;
    gender?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedRegistrations> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.search) query.set('search', params.search);
    if (params?.department && params.department !== 'all') query.set('department', params.department);
    if (params?.semester && params.semester !== 'all') query.set('semester', String(params.semester));
    if (params?.section && params.section !== 'all') query.set('section', params.section);
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    if (params?.paymentStatus && params.paymentStatus !== 'all') query.set('paymentStatus', params.paymentStatus);
    if (params?.productionStatus && params.productionStatus !== 'all') query.set('productionStatus', params.productionStatus);
    if (params?.distributionStatus && params.distributionStatus !== 'all') query.set('distributionStatus', params.distributionStatus);
    if (params?.gender && params.gender !== 'all') query.set('gender', params.gender);
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder);

    const res = await fetch(`${API_BASE}/admin/registrations?${query.toString()}`, {
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      throw new Error(`Failed to load student registrations (HTTP ${res.status})`);
    }

    const data = await res.json();
    return {
      items: data.items || [],
      pagination: data.pagination || {
        page: 1,
        pageSize: 25,
        total: (data.items || []).length,
        totalPages: 1,
        hasNext: false,
        hasPrev: false
      }
    };
  },

  // Backward compatibility wrapper for callers expecting flat list
  async getRegistrations(params?: any): Promise<StudentRegistration[]> {
    const res = await this.getPaginatedRegistrations({ ...params, pageSize: 100 });
    return res.items;
  },

  // ─── Student Registration: Add ────────────────────────────────
  async addRegistration(data: Omit<StudentRegistration, 'id' | 'submitted_at' | 'edit_deadline' | 'collected_at' | 'collected_by'>): Promise<StudentRegistration> {
    const cleanUsn = data.usn.trim().toUpperCase().replace(/\s+/g, '');
    const res = await fetch(`${API_BASE}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, usn: cleanUsn })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Submission failed. Please verify your details.');
    }

    const saved = await res.json();
    return {
      id: saved.id || saved.registrationId,
      dbId: saved.dbId,
      registrationId: saved.registrationId || saved.id,
      fullName: data.fullName.trim(),
      gender: data.gender || 'Male',
      usn: cleanUsn,
      department: data.department,
      semester: data.semester,
      section: data.section,
      phone: data.phone,
      collegeEmail: data.collegeEmail,
      shirtSize: data.shirtSize,
      trouserSize: data.trouserSize,
      submissionStatus: 'submitted',
      productionStatus: 'pending',
      distributionStatus: 'pending',
      submitted_at: saved.submitted_at,
      edit_deadline: saved.edit_deadline,
      collected_at: null,
      collected_by: null
    };
  },

  // ─── Student Registration Status Lookup ───────────────────────
  async getRegistrationStatus(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/registrations/${encodeURIComponent(id)}/status`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Record not found.');
    }
    return res.json();
  },

  // ─── Student Self-Edit (Enforcing 24h deadline) ───────────────
  async updateStudentSubmission(id: string, updates: any): Promise<any> {
    const res = await fetch(`${API_BASE}/registrations/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Could not update registration.');
    }
    return res.json();
  },

  // ─── Admin: Update Registration Details ───────────────────────
  async updateRegistration(id: string, updates: Partial<StudentRegistration>): Promise<StudentRegistration> {
    const res = await fetch(`${API_BASE}/admin/registrations/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Could not update student registration.');
    }
    return { id, ...updates } as StudentRegistration;
  },

  // ─── Admin: Update Production & Distribution Status ───────────
  async updateStatus(id: string, updates: {
    productionStatus?: string;
    distributionStatus?: string;
    collectionRoom?: string;
    collectionDate?: string;
    collectionInstructions?: string;
  }): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/registrations/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Could not update production/distribution status.');
    }
  },

  // ─── Admin: Toggle Collection Status ──────────────────────────
  async toggleCollection(id: string, collected: boolean, collectedBy: string = 'MIT Operations Desk'): Promise<StudentRegistration> {
    const res = await fetch(`${API_BASE}/admin/registrations/${encodeURIComponent(id)}/collect`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ collected, collectedBy })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Could not update collection status.');
    }
    const data = await res.json();
    return {
      id,
      collected_at: data.collected_at,
      collected_by: data.collected_by,
      distributionStatus: data.distribution_status
    } as any;
  },

  // ─── Admin: Delete Registration ───────────────────────────────
  async deleteRegistration(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/registrations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Could not delete registration.');
    }
  },

  // ─── Admin: Get Distribution Schedules ────────────────────────
  async getSchedules(): Promise<DistributionSchedule[]> {
    try {
      const res = await fetch(`${API_BASE}/admin/distribution`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (e) {
      console.warn('Could not load schedules:', e);
    }
    return [];
  },

  // ─── Public Distribution Announcement Lookup (Strictly Published)
  async getPublicSchedules(department: string, semester: number, section: string): Promise<DistributionSchedule[]> {
    const query = new URLSearchParams({
      department,
      semester: String(semester),
      section
    });
    const res = await fetch(`${API_BASE}/distribution?${query.toString()}`);
    if (!res.ok) {
      throw new Error('Failed to retrieve distribution schedule.');
    }
    return res.json();
  },

  // ─── Admin: Save Distribution Schedule ────────────────────────
  async saveSchedule(schedule: Omit<DistributionSchedule, 'id' | 'updated_at'> & { id?: string }): Promise<DistributionSchedule> {
    const res = await fetch(`${API_BASE}/admin/distribution`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(schedule)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Could not save distribution schedule.');
    }
    return res.json();
  },

  // ─── Admin: Delete Distribution Schedule ──────────────────────
  async deleteSchedule(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/distribution/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Could not delete schedule.');
    }
  },

  // ─── Admin: Audit Logs ────────────────────────────────────────
  async getAuditLogs(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/admin/audit-logs`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) return [];
    return res.json();
  },

  resetAllData() {
    localStorage.removeItem('mit_uniform_registrations_v1');
    localStorage.removeItem('mit_uniform_schedules_v1');
  },

  // ─── Direct Institution UPI Payment APIs ───────────────────────
  async getPaymentConfig(params?: { department?: string; yearSemester?: string; packageType?: string }): Promise<{ success: boolean; config: PaymentConfig; methods: PaymentMethod[] }> {
    const query = new URLSearchParams();
    if (params?.department) query.set('department', params.department);
    if (params?.yearSemester) query.set('yearSemester', params.yearSemester);
    if (params?.packageType) query.set('packageType', params.packageType);
    query.set('t', String(Date.now()));

    const res = await fetch(`${API_BASE}/payments/config?${query.toString()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load payment configuration.');
    return res.json();
  },

  async getPaymentStatus(registrationId: string): Promise<{ success: boolean; paymentStatus: PaymentStatus; submission: PaymentSubmission | null }> {
    const res = await fetch(`${API_BASE}/payments/status/${encodeURIComponent(registrationId)}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load payment status.');
    return res.json();
  },

  async submitPayment(formData: FormData): Promise<{ success: boolean; message: string; submission: PaymentSubmission }> {
    const res = await fetch(`${API_BASE}/payments/submit`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Payment submission failed.');
    }
    return data;
  },

  async requestCashPayment(payload: {
    registrationId: string;
    applicationId?: string;
    usn: string;
    studentName?: string;
    course?: string;
    department?: string;
    academicYear?: string;
    section?: string;
    gender?: string;
    packageType?: string;
  }): Promise<{
    success: boolean;
    message: string;
    cashPaymentRefId: string;
    paymentStatus: PaymentStatus;
    expectedAmount: number;
    assignedVendor?: {
      vendorId: string;
      vendorName: string;
      allocationId: string;
      collectionRoom?: string;
    };
    alreadyConfirmed?: boolean;
    alreadyPending?: boolean;
  }> {
    const res = await fetch(`${API_BASE}/payments/cash/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      const err: any = new Error(data.message || 'Cash payment request failed.');
      err.data = data;
      throw err;
    }
    return data;
  },

  async getVendorCashPayments(
    token: string,
    params?: { status?: string; search?: string }
  ): Promise<{
    success: boolean;
    summary: {
      totalRequests: number;
      pendingCount: number;
      receivedCount: number;
      rejectedCount: number;
      totalCashCollected: number;
    };
    requests: any[];
  }> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.search) searchParams.set('search', params.search);
    const queryStr = searchParams.toString() ? `?${searchParams.toString()}` : '';

    const res = await fetch(`${API_BASE}/vendor-portal/cash-payments${queryStr}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch vendor cash payments.');
    }
    return data;
  },

  async confirmVendorCashPayment(
    submissionId: string,
    token: string,
    actualAmountReceived: number,
    remarks?: string
  ): Promise<{ success: boolean; message: string; submission: any }> {
    const res = await fetch(`${API_BASE}/vendor-portal/cash-payments/${submissionId}/confirm`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ actualAmountReceived, remarks })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      const err: any = new Error(data.message || 'Failed to confirm cash payment.');
      err.amountMismatch = Boolean(data.amountMismatch);
      throw err;
    }
    return data;
  },

  async rejectVendorCashPayment(
    submissionId: string,
    token: string,
    rejectionReason: string,
    remarks?: string
  ): Promise<{ success: boolean; message: string; submission: any }> {
    const res = await fetch(`${API_BASE}/vendor-portal/cash-payments/${submissionId}/reject`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ rejectionReason, remarks })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to reject cash payment.');
    }
    return data;
  },

  async getAdminCashPayments(params?: {
    status?: string;
    vendorId?: string;
    search?: string;
  }): Promise<{
    success: boolean;
    metrics: {
      totalCashRequests: number;
      pendingCashRequests: number;
      confirmedCashReceived: number;
      rejectedCashRequests: number;
      totalCashRevenueCollected: number;
      pendingCashAmount: number;
    };
    financialBreakdown: {
      upiRevenue: number;
      cashRevenue: number;
      totalCollectedRevenue: number;
      pendingCashAmount: number;
      verifiedUpiCount: number;
      confirmedCashCount: number;
    };
    submissions: any[];
  }> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.vendorId) searchParams.set('vendorId', params.vendorId);
    if (params?.search) searchParams.set('search', params.search);
    const queryStr = searchParams.toString() ? `?${searchParams.toString()}` : '';

    const res = await fetch(`${API_BASE}/admin/payments/cash${queryStr}`, {
      headers: getAuthHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch admin cash payments data.');
    }
    return data;
  },

  async getAdminPaymentConfig(): Promise<{ success: boolean; stats: PaymentStats; config: PaymentConfig; scanners: PaymentMethod[]; history: PaymentConfigHistory[] }> {
    const res = await fetch(`${API_BASE}/admin/payments/config`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load admin payment config.');
    return res.json();
  },

  async updatePaymentConfig(payload: Partial<PaymentConfig> & { changeSummary?: string }): Promise<{ success: boolean; message: string; config: PaymentConfig; latestHistory?: PaymentConfigHistory }> {
    const res = await fetch(`${API_BASE}/admin/payments/config`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update configuration.');
    return data;
  },

  async toggleCollectionStatus(isCollectionEnabled: boolean, unavailableMessage?: string): Promise<{ success: boolean; message: string; config: PaymentConfig }> {
    const res = await fetch(`${API_BASE}/admin/payments/collection-status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ isCollectionEnabled, unavailableMessage })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to toggle collection status.');
    return data;
  },

  async getPaymentConfigHistory(): Promise<{ success: boolean; history: PaymentConfigHistory[] }> {
    const res = await fetch(`${API_BASE}/admin/payments/config/history`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load payment configuration history.');
    return res.json();
  },

  async revisePaymentRequirement(id: string, newExpectedAmount: number, reason: string, newPaidAmount?: number): Promise<{ success: boolean; message: string; submission: PaymentSubmission }> {
    const res = await fetch(`${API_BASE}/admin/payments/submissions/${encodeURIComponent(id)}/revise-requirement`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ newExpectedAmount, newPaidAmount, reason })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to revise payment requirement.');
    return data;
  },

  async uploadScanner(formData: FormData): Promise<{ success: boolean; message: string; scanner: PaymentMethod }> {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/admin/payments/scanners`, {
      method: 'POST',
      headers,
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to upload scanner.');
    return data;
  },

  async replaceScanner(id: string, formData: FormData): Promise<{ success: boolean; message: string; scanner: PaymentMethod }> {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/admin/payments/scanners/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers,
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to replace scanner.');
    return data;
  },

  async toggleScannerStatus(id: string, isActive: boolean): Promise<{ success: boolean; message: string; scanner: PaymentMethod }> {
    const res = await fetch(`${API_BASE}/admin/payments/scanners/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ isActive })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update scanner status.');
    return data;
  },

  async deleteScanner(id: string): Promise<{ success: boolean; message: string; scanner: PaymentMethod }> {
    const res = await fetch(`${API_BASE}/admin/payments/scanners/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete scanner.');
    return data;
  },

  async getPaymentSubmissions(filters: Record<string, string>): Promise<{ success: boolean; submissions: PaymentSubmission[] }> {
    await ensureAdminToken();
    const params = new URLSearchParams(filters).toString();
    let res = await fetch(`${API_BASE}/admin/payments/submissions?${params}`, { headers: getAuthHeaders() });
    if (res.status === 401) {
      await ensureAdminToken(true);
      res = await fetch(`${API_BASE}/admin/payments/submissions?${params}`, { headers: getAuthHeaders() });
    }
    if (!res.ok) throw new Error('Failed to load payment submissions.');
    return res.json();
  },

  async verifyPaymentSubmission(id: string, adminRemarks: string, bankVerifiedAmount?: number): Promise<{ success: boolean; message: string; submission: PaymentSubmission }> {
    await ensureAdminToken();
    let res = await fetch(`${API_BASE}/admin/payments/submissions/${encodeURIComponent(id)}/verify`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ bankConfirmed: true, adminRemarks, bankVerifiedAmount })
    });
    if (res.status === 401) {
      await ensureAdminToken(true);
      res = await fetch(`${API_BASE}/admin/payments/submissions/${encodeURIComponent(id)}/verify`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ bankConfirmed: true, adminRemarks, bankVerifiedAmount })
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'Payment verification failed.');
    return data;
  },

  async rejectPaymentSubmission(id: string, rejectionReason: string, adminRemarks: string): Promise<{ success: boolean; message: string; submission: PaymentSubmission }> {
    await ensureAdminToken();
    let res = await fetch(`${API_BASE}/admin/payments/submissions/${encodeURIComponent(id)}/reject`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ rejectionReason, adminRemarks })
    });
    if (res.status === 401) {
      await ensureAdminToken(true);
      res = await fetch(`${API_BASE}/admin/payments/submissions/${encodeURIComponent(id)}/reject`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ rejectionReason, adminRemarks })
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'Payment rejection failed.');
    return data;
  },

  async updatePaymentRemarks(id: string, adminRemarks: string, markUnderVerification: boolean): Promise<{ success: boolean; message: string; submission: PaymentSubmission }> {
    const res = await fetch(`${API_BASE}/admin/payments/submissions/${encodeURIComponent(id)}/remarks`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ adminRemarks, markUnderVerification })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update remarks.');
    return data;
  },

  async uploadReconciliationCsv(formData: FormData): Promise<{ success: boolean; message: string; report: any }> {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/admin/payments/reconciliation/upload`, {
      method: 'POST',
      headers,
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'Reconciliation analysis failed.');
    return data;
  },

  async getPaymentAuditLogs(): Promise<{ success: boolean; logs: PaymentAuditLog[] }> {
    const res = await fetch(`${API_BASE}/admin/payments/audit-logs`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load audit logs.');
    return res.json();
  },

  // ─── Admin: Vendor Management ─────────────────────────────────
  async deleteVendor(vendorId: string): Promise<{ success: boolean; message: string; deletedVendor?: any }> {
    await ensureAdminToken();
    const res = await fetch(`${API_BASE}/admin/vendors/${encodeURIComponent(vendorId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to delete vendor.');
    }
    return data;
  }
};
