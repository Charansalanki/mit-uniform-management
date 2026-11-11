// Utility to generate a pixel-perfect, 100% Single-Page A4 Student Uniform Registration & Payment Slip
// Matches the official MIT Mysore layout with absolute single-page enforcement.

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import DOMPurify from 'dompurify';
import { MIT_LOGO_BASE64 } from './mitLogoBase64';

export interface StudentSlipData {
  applicationId: string;
  trackingPin?: string;
  registrationId?: string;
  studentName: string;
  usn: string;
  course?: string;
  department: string;
  academicYear: string;
  section: string;
  gender?: string;
  shirtSize: string;
  trouserSize: string;
  blazerSize?: string;
  remarks?: string;
  packageType?: string;
  vendorName?: string;
  vendorId?: string;
  // Payment verification fields
  isPaymentVerified?: boolean;
  paymentStatus?: string;
  paidAmount?: number | null;
  utrNumber?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
}

export function resolveTrackingPinForSlip(data: StudentSlipData): string {
  if (data.trackingPin && data.trackingPin.trim() && data.trackingPin !== '••••••') {
    return data.trackingPin.trim();
  }
  if (typeof window !== 'undefined') {
    try {
      const u = (data.usn || '').toUpperCase().trim();
      const r = (data.registrationId || '').trim();
      const app = (data.applicationId || '').trim();
      const found =
        (r && sessionStorage.getItem(`mit_pin_${r}`)) ||
        (app && sessionStorage.getItem(`mit_pin_${app}`)) ||
        (u && sessionStorage.getItem(`mit_pin_${u}`)) ||
        (r && localStorage.getItem(`mit_pin_${r}`)) ||
        (app && localStorage.getItem(`mit_pin_${app}`)) ||
        (u && localStorage.getItem(`mit_pin_${u}`));
      if (found && found.trim() && found.trim() !== '••••••') return found.trim();
    } catch {}
  }
  return data.trackingPin && data.trackingPin !== '••••••' ? data.trackingPin : '';
}

function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateStudentSlipHtml(data: StudentSlipData): string {
  const isVerified =
    data.isPaymentVerified ||
    data.paymentStatus === 'Payment Successful' ||
    data.paymentStatus === 'Verified' ||
    data.paymentStatus === 'Payment Verified' ||
    data.paymentStatus === 'CASH RECEIVED';

  const rawRegId = data.registrationId || (data.applicationId ? `REG-${data.applicationId.replace(/^MIT-2026-|^MIT-/, '')}` : 'REG-001');
  const displayRegId = escapeHtml(rawRegId);
  const academicYearFormatted = escapeHtml(data.academicYear || '2026–27');
  const docRef = escapeHtml(`MITM / UNIFORM / ${data.academicYear || '2026–27'} / ${rawRegId}`);
  const slipTitle = isVerified ? 'Uniform Registration & Payment Receipt' : 'Uniform Registration Slip';
  const subtitle = isVerified ? 'OFFICIAL VERIFIED STUDENT PAYMENT & UNIFORM COPY' : 'OFFICIAL STUDENT REGISTRATION & TRACKING COPY';
  const displayPin = escapeHtml(resolveTrackingPinForSlip(data));
  const safeAppId = escapeHtml(data.applicationId);
  const safeStudentName = escapeHtml(data.studentName);
  const safeUsn = escapeHtml(data.usn);
  const safeCourse = escapeHtml(data.course || 'B.E.');
  const safeDepartment = escapeHtml(data.department);
  const safeSection = escapeHtml(data.section);
  const safeGender = escapeHtml(data.gender);
  const safeShirtSize = escapeHtml(data.shirtSize || 'Standard');
  const safeTrouserSize = escapeHtml(data.trouserSize || 'Standard');
  const safeBlazerSize = escapeHtml(data.blazerSize);
  const safePackageType = escapeHtml(data.packageType || 'Standard');
  const safeRemarks = escapeHtml(data.remarks ? data.remarks.trim() : '');
  const safeVendorName = escapeHtml(data.vendorName || 'Assigned Uniform Vendor');
  const safeVendorId = escapeHtml(data.vendorId || 'N/A');
  const safePaymentStatus = escapeHtml(data.paymentStatus || 'Payment Successful');
  const safeUtr = escapeHtml(data.utrNumber || 'N/A');
  const safeVerifiedBy = escapeHtml(data.verifiedBy);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${safeAppId} - ${slipTitle}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 12mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .slip-wrapper {
      width: 100%;
      max-width: 186mm;
      margin: 0 auto;
      padding: 0;
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: 275mm;
      justify-content: space-between;
    }
    /* Header Section */
    .slip-header {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding-bottom: 8px;
      border-bottom: 1.5px solid #0f172a;
      position: relative;
    }
    .slip-logo-col {
      width: 62px;
      height: 62px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .slip-logo-col img {
      width: 60px;
      height: 60px;
      object-fit: contain;
    }
    .slip-header-info {
      flex: 1;
    }
    .trust-title {
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #475569;
      text-align: right;
      margin-bottom: 2px;
    }
    .college-name {
      font-size: 19px;
      font-weight: 900;
      color: #c2410c;
      letter-spacing: -0.01em;
      line-height: 1.15;
      margin-bottom: 3px;
    }
    .college-sub {
      font-size: 9.5px;
      color: #334155;
      font-weight: 500;
      line-height: 1.25;
    }
    /* Meta Reference Row */
    .slip-ref-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0 4px 0;
      font-size: 10.5px;
      font-weight: 700;
      color: #334155;
    }
    /* Title Block */
    .slip-title-block {
      text-align: center;
      margin: 4px 0 6px 0;
    }
    .slip-title-block h1 {
      font-size: 18px;
      font-weight: 900;
      color: #0f172a;
      margin: 0;
      line-height: 1.2;
    }
    .slip-title-block .copy-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #c2410c;
      margin-top: 2px;
    }
    .slip-intro-text {
      font-size: 10px;
      color: #334155;
      line-height: 1.35;
      margin-bottom: 8px;
      text-align: left;
    }
    /* Credentials Callout Box */
    .cred-box {
      border: 1.5px solid #ea580c;
      border-radius: 4px;
      padding: 6px 14px 8px 14px;
      margin-bottom: 8px;
      background: #ffffff;
    }
    .cred-title {
      font-size: 10.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #c2410c;
      text-align: center;
      margin-bottom: 4px;
    }
    .cred-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .cred-col label {
      display: block;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      color: #475569;
      letter-spacing: 0.04em;
      margin-bottom: 2px;
    }
    .cred-col .cred-val {
      font-size: 17px;
      font-weight: 900;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #0f172a;
      letter-spacing: 0.05em;
    }
    /* Section Tables */
    .section-title {
      font-size: 11px;
      font-weight: 800;
      color: #0f172a;
      margin: 6px 0 3px 0;
    }
    table.slip-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #94a3b8;
      margin-bottom: 6px;
      font-size: 10.5px;
    }
    table.slip-table tr {
      border-bottom: 1px solid #cbd5e1;
    }
    table.slip-table tr:last-child {
      border-bottom: none;
    }
    table.slip-table td {
      padding: 3.5px 8px;
      vertical-align: middle;
    }
    table.slip-table td.col-lbl {
      width: 34%;
      font-weight: 700;
      color: #334155;
      background: #f8fafc;
      border-right: 1px solid #cbd5e1;
    }
    table.slip-table td.col-val {
      width: 66%;
      font-weight: 600;
      color: #0f172a;
    }
    .badge-verified {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 800;
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
    }
    /* Important Notice Box */
    .notice-box {
      border: 1.5px solid #ea580c;
      background: #fff7ed;
      border-radius: 4px;
      padding: 6px 10px;
      margin: 6px 0 6px 0;
      font-size: 9.5px;
      line-height: 1.35;
      color: #9a3412;
    }
    .notice-box strong {
      font-weight: 800;
    }
    /* Footer */
    .slip-footer {
      border-top: 1.5px solid #0f172a;
      padding-top: 4px;
      margin-top: 4px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .footer-left {
      font-size: 8.5px;
      color: #64748b;
    }
    .footer-right {
      text-align: right;
    }
    .footer-inst {
      font-size: 9.5px;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .footer-addr {
      font-size: 8.5px;
      color: #475569;
    }
    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="slip-wrapper">
    <!-- Header -->
    <div class="slip-header">
      <div class="slip-logo-col">
        <img src="${MIT_LOGO_BASE64}" alt="MIT Mysore Logo" />
      </div>
      <div class="slip-header-info">
        <div class="trust-title">MAHARAJA EDUCATION TRUST (R), MYSURU</div>
        <div class="college-name">Maharaja Institute of Technology Mysore</div>
        <div class="college-sub">An Autonomous Institution affiliated to VTU, Belagavi</div>
        <div class="college-sub">Approved by AICTE, New Delhi | Recognized by Government of Karnataka</div>
        <div class="college-sub">Belawadi, Srirangapatna Taluk, Mandya District – 571477</div>
      </div>
    </div>

    <!-- Meta Ref -->
    <div class="slip-ref-row">
      <div>${docRef}</div>
      <div>Academic Year: ${academicYearFormatted}</div>
    </div>

    <!-- Title -->
    <div class="slip-title-block">
      <h1>${slipTitle}</h1>
      <div class="copy-badge">${subtitle}</div>
    </div>

    <!-- Intro Text -->
    <p class="slip-intro-text">
      This slip confirms the uniform registration details submitted by the student through the MIT Mysore Uniform Management Portal. Keep the tracking credentials safely to check the payment verification and uniform collection status.
    </p>

    <!-- Student Tracking Credentials -->
    <div class="cred-box">
      <div class="cred-title">STUDENT TRACKING CREDENTIALS</div>
      <div class="cred-grid">
        <div class="cred-col">
          <label>REGISTRATION ID</label>
          <div class="cred-val" style="color: #0284c7;">${displayRegId}</div>
        </div>
        <div class="cred-col">
          <label>APPLICATION ID</label>
          <div class="cred-val">${safeAppId}</div>
        </div>
        <div class="cred-col">
          <label>6-DIGIT TRACKING PIN</label>
          <div class="cred-val">${displayPin || '••••••'}</div>
        </div>
      </div>
    </div>

    <!-- 1. Student Details -->
    <div class="section-title">1. Student Details</div>
    <table class="slip-table">
      <tr>
        <td class="col-lbl">Registration ID</td>
        <td class="col-val" style="font-family: monospace; font-weight: 700; color: #0284c7;">${displayRegId}</td>
      </tr>
      <tr>
        <td class="col-lbl">Application ID</td>
        <td class="col-val" style="font-family: monospace; font-weight: 700;">${safeAppId}</td>
      </tr>
      <tr>
        <td class="col-lbl">Student Name</td>
        <td class="col-val">${safeStudentName}</td>
      </tr>
      <tr>
        <td class="col-lbl">USN</td>
        <td class="col-val" style="font-family: monospace; font-weight: 700;">${safeUsn}</td>
      </tr>
      <tr>
        <td class="col-lbl">Course & Department</td>
        <td class="col-val">${safeCourse} – ${safeDepartment}</td>
      </tr>
      <tr>
        <td class="col-lbl">Academic Year & Section</td>
        <td class="col-val">${academicYearFormatted} (Section ${safeSection})</td>
      </tr>
      ${data.gender ? `<tr><td class="col-lbl">Gender</td><td class="col-val">${safeGender}</td></tr>` : ''}
    </table>

    <!-- 2. Submitted Uniform Sizes -->
    <div class="section-title">2. Submitted Uniform Sizes</div>
    <table class="slip-table">
      <tr>
        <td class="col-lbl">Shirt Size</td>
        <td class="col-val">${safeShirtSize}</td>
      </tr>
      <tr>
        <td class="col-lbl">Trouser Size</td>
        <td class="col-val">${safeTrouserSize}"</td>
      </tr>
      ${data.blazerSize ? `
      <tr>
        <td class="col-lbl">Coat / Blazer Size</td>
        <td class="col-val">${safeBlazerSize}</td>
      </tr>
      ` : ''}
      <tr>
        <td class="col-lbl">Package Type</td>
        <td class="col-val">${safePackageType}</td>
      </tr>
      ${data.remarks && data.remarks.trim() ? `
      <tr>
        <td class="col-lbl">Special Fit Remarks</td>
        <td class="col-val" style="font-style: italic; color: #1e293b;">${safeRemarks}</td>
      </tr>
      ` : ''}
    </table>

    <!-- 3. Assigned Uniform Vendor -->
    <div class="section-title">3. Assigned Uniform Vendor</div>
    <table class="slip-table">
      <tr>
        <td class="col-lbl">Vendor Name</td>
        <td class="col-val">${safeVendorName}</td>
      </tr>
      <tr>
        <td class="col-lbl">Vendor ID</td>
        <td class="col-val">${safeVendorId}</td>
      </tr>
    </table>

    <!-- 4. Payment & Verification Details (Included when Verified) -->
    ${
      isVerified
        ? `
    <div class="section-title">4. Fee Payment & Institutional Verification Details</div>
    <table class="slip-table">
      <tr>
        <td class="col-lbl">Payment Status</td>
        <td class="col-val"><span class="badge-verified">✓ ${safePaymentStatus}</span></td>
      </tr>
      <tr>
        <td class="col-lbl">Verified Amount</td>
        <td class="col-val" style="font-weight: 800; color: #166534;">₹${Number(data.paidAmount || 0).toLocaleString('en-IN')}</td>
      </tr>
      <tr>
        <td class="col-lbl">${data.paymentStatus === 'CASH RECEIVED' || (data.utrNumber && data.utrNumber.startsWith('CASH-')) ? 'Cash Payment Reference ID' : 'Bank UTR / Transaction No.'}</td>
        <td class="col-val" style="font-family: monospace; font-weight: 700;">${safeUtr}</td>
      </tr>
      <tr>
        <td class="col-lbl">Verification Timestamp</td>
        <td class="col-val">${data.verifiedAt ? new Date(data.verifiedAt).toLocaleString('en-IN') : 'Verified'} ${safeVerifiedBy ? `(Verified by ${safeVerifiedBy})` : ''}</td>
      </tr>
    </table>
    `
        : ''
    }

    <!-- Important Notice -->
    <div class="notice-box">
      <strong>IMPORTANT:</strong> Keep this Application ID and 6-Digit PIN safe. You can check your live payment verification status from any phone, laptop, or a friend’s device by selecting “Check Payment Status” on the MIT Mysore Uniform website.
    </div>

    <!-- Footer -->
    <div class="slip-footer">
      <div class="footer-left">
        <div>Generated on: ${new Date().toLocaleDateString('en-IN')}</div>
        <div>System Verified Electronic Document</div>
      </div>
      <div class="footer-right">
        <div class="footer-inst">MAHARAJA INSTITUTE OF TECHNOLOGY MYSORE</div>
        <div class="footer-addr">Belawadi, Srirangapatna Taluk, Mandya, Karnataka – 571477</div>
      </div>
    </div>
  </div>

  <script>
    // Auto-trigger print when opened in standalone print window
    if (window.location.search.includes('autoprint=true')) {
      window.onload = function() {
        setTimeout(function() {
          window.print();
        }, 250);
      };
    }
  </script>
</body>
</html>`;
}

// Function to print or save as PDF directly
export function printStudentSlip(data: StudentSlipData) {
  const html = generateStudentSlipHtml(data);
  const sanitizedHtml = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ['style', 'title', 'meta', 'link'],
    ADD_ATTR: ['style', 'data-status'],
    ADD_DATA_URI_TAGS: ['img']
  });
  const printWindow = window.open('', '_blank', 'width=850,height=960');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(DOMPurify.sanitize(sanitizedHtml, { WHOLE_DOCUMENT: true }));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 350);
  } else {
    // Fallback if popup blocked: use hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(DOMPurify.sanitize(sanitizedHtml, { WHOLE_DOCUMENT: true }));
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 1000);
      }, 350);
    }
  }
}

// Function to download official slip as an authentic, high-resolution A4 PDF document
export async function downloadStudentSlip(
  data: StudentSlipData,
  sourceElement?: HTMLElement | null
): Promise<void> {
  const effectivePin = resolveTrackingPinForSlip(data);
  const resolvedData: StudentSlipData = { ...data, trackingPin: effectivePin || data.trackingPin };
  const identifier = resolvedData.registrationId || resolvedData.applicationId || resolvedData.usn || 'Receipt';
  const cleanId = String(identifier).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `MIT_Uniform_Slip_${cleanId}.pdf`;

  let elementToCapture = sourceElement || document.getElementById('mit-official-slip-content');
  let tempContainer: HTMLElement | null = null;

  if (!elementToCapture) {
    tempContainer = document.createElement('div');
    tempContainer.style.position = 'fixed';
    tempContainer.style.left = '-99999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = '794px'; // ~A4 width in px at 96 DPI
    tempContainer.style.background = '#ffffff';
    tempContainer.style.zIndex = '-9999';
    tempContainer.innerHTML = DOMPurify.sanitize(generateStudentSlipHtml(resolvedData), {
      ADD_TAGS: ['style'],
      ADD_ATTR: ['style', 'data-status'],
      ADD_DATA_URI_TAGS: ['img']
    });
    document.body.appendChild(tempContainer);
    elementToCapture = (tempContainer.querySelector('.slip-wrapper') as HTMLElement) || tempContainer;
  }

  try {
    const canvas = await html2canvas(elementToCapture, {
      scale: 2, // 2x retina DPI for razor-sharp typography and borders
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pdfWidth = 210; // A4 standard width in mm
    const pdfHeight = 297; // A4 standard height in mm
    const margin = 8; // 8mm margin
    const contentWidth = pdfWidth - margin * 2; // 194mm
    const contentHeight = (canvas.height * contentWidth) / canvas.width;

    let renderWidth = contentWidth;
    let renderHeight = contentHeight;
    let x = margin;
    let y = margin;

    if (renderHeight > pdfHeight - margin * 2) {
      renderHeight = pdfHeight - margin * 2;
      renderWidth = (canvas.width * renderHeight) / canvas.height;
      x = (pdfWidth - renderWidth) / 2;
    }

    pdf.addImage(imgData, 'JPEG', x, y, renderWidth, renderHeight);
    pdf.save(filename);
  } catch (err) {
    console.error('Error generating PDF slip:', err);
    // Fallback: trigger system print dialog which allows Save as PDF
    printStudentSlip(data);
  } finally {
    if (tempContainer && tempContainer.parentNode) {
      tempContainer.parentNode.removeChild(tempContainer);
    }
  }
}

// Aliases for full backward compatibility
export const downloadStudentSlipPdf = downloadStudentSlip;
export const downloadStudentSlipHtml = downloadStudentSlip;

