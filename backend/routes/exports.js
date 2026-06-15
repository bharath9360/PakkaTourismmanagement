const router    = require('express').Router();
const ExcelJS   = require('exceljs');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const Booking   = require('../models/Booking');
const Lead      = require('../models/Lead');
const User      = require('../models/User');
const Attendance = require('../models/Attendance');

// ─── Shared helper: send a finished ExcelJS workbook as a download response ──
async function sendWorkbook(res, workbook, filename) {
  // Correct MIME type for .xlsx — anything else causes browser to flag as corrupt
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  // The filename= value drives the default save-as name in every browser
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`
  );
  // Prevent proxies / CDN from caching the binary file
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  // Write directly to the HTTP response stream — no tmp file needed
  await workbook.xlsx.write(res);
  res.end();
}

// ─── Shared helper: apply a standard header row style ───────────────────────
function styleHeaderRow(worksheet, columnCount) {
  const headerRow = worksheet.getRow(1);
  headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }; // blue
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height    = 22;

  // Thin border on every header cell
  for (let col = 1; col <= columnCount; col++) {
    headerRow.getCell(col).border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' },
    };
  }
}

// ─── Shared helper: auto-fit column widths from data ─────────────────────────
function autoFitColumns(worksheet) {
  worksheet.columns.forEach(col => {
    let maxLen = 10;
    col.eachCell({ includeEmpty: false }, cell => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 4, 50);
  });
}

// ─── Shared helper: alternate row shading ─────────────────────────────────────
function shadeRows(worksheet) {
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    if (rowNumber % 2 === 0) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      });
    }
    row.height = 18;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/exports/leads
// ─────────────────────────────────────────────────────────────────────────────
router.get('/leads', protect, adminOnly, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const filter = {};
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59));
    }

    const leads = await Lead.find(filter)
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const workbook  = new ExcelJS.Workbook();
    workbook.creator  = 'Pakka Tourism CRM';
    workbook.created  = new Date();

    const sheet = workbook.addWorksheet('Lead Pipeline', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
    });

    // Define columns
    sheet.columns = [
      { header: 'Client Name',   key: 'client',      width: 22 },
      { header: 'Phone',         key: 'phone',        width: 14 },
      { header: 'Destination',   key: 'destination',  width: 20 },
      { header: 'Stage',         key: 'stage',        width: 14 },
      { header: 'Priority',      key: 'priority',     width: 12 },
      { header: 'Pax',           key: 'pax',          width: 8  },
      { header: 'Budget (₹)',    key: 'budget',       width: 14 },
      { header: 'Source',        key: 'source',       width: 14 },
      { header: 'Travel Date',   key: 'travelDate',   width: 14 },
      { header: 'Assigned To',   key: 'assignedTo',   width: 18 },
      { header: 'Follow-up',     key: 'followUp',     width: 14 },
      { header: 'Created At',    key: 'createdAt',    width: 14 },
    ];

    // Add data rows
    leads.forEach(l => {
      sheet.addRow({
        client:      l.clientName,
        phone:       l.phone,
        destination: l.destination,
        stage:       l.stage,
        priority:    l.priority,
        pax:         l.pax,
        budget:      l.budget,
        source:      l.source,
        travelDate:  l.travelDate ? new Date(l.travelDate).toLocaleDateString('en-IN') : '—',
        assignedTo:  l.assignedTo?.name || '—',
        followUp:    l.nextFollowUp ? new Date(l.nextFollowUp).toLocaleDateString('en-IN') : '—',
        createdAt:   new Date(l.createdAt).toLocaleDateString('en-IN'),
      });
    });

    styleHeaderRow(sheet, sheet.columns.length);
    shadeRows(sheet);
    autoFitColumns(sheet);

    // Freeze top header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Summary row at the bottom
    sheet.addRow([]);
    const summaryRow = sheet.addRow([
      `Total: ${leads.length} leads`, '', '', '', '', `${leads.reduce((s, l) => s + (l.pax || 0), 0)} pax`,
      leads.reduce((s, l) => s + (l.budget || 0), 0)
    ]);
    summaryRow.font = { bold: true, color: { argb: 'FF1D4ED8' } };

    await sendWorkbook(res, workbook, 'PakkaTourism_Leads.xlsx');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/exports/bookings
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bookings', protect, adminOnly, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const filter = {};
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59));
    }

    const bookings = await Booking.find(filter)
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Pakka Tourism CRM';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Bookings', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
    });

    sheet.columns = [
      { header: 'Booking #',     key: 'bookingNumber', width: 16 },
      { header: 'Client',        key: 'client',        width: 22 },
      { header: 'Phone',         key: 'phone',         width: 14 },
      { header: 'Destination',   key: 'destination',   width: 20 },
      { header: 'Travel Date',   key: 'travelDate',    width: 14 },
      { header: 'Pax',           key: 'pax',           width: 8  },
      { header: 'Total (₹)',     key: 'total',         width: 14 },
      { header: 'Advance (₹)',   key: 'advance',       width: 14 },
      { header: 'Balance (₹)',   key: 'balance',       width: 14 },
      { header: 'Status',        key: 'status',        width: 14 },
      { header: 'Assigned To',   key: 'assignedTo',    width: 18 },
    ];

    bookings.forEach(b => {
      const row = sheet.addRow({
        bookingNumber: b.bookingNumber,
        client:        b.clientName,
        phone:         b.clientPhone,
        destination:   b.destination,
        travelDate:    b.travelDate ? new Date(b.travelDate).toLocaleDateString('en-IN') : '—',
        pax:           b.pax,
        total:         b.totalAmount,
        advance:       b.advancePaid,
        balance:       b.balanceDue,
        status:        b.status,
        assignedTo:    b.assignedTo?.name || '—',
      });

      // Colour-code status cell
      const statusCell = row.getCell('status');
      if (b.status === 'confirmed') {
        statusCell.font = { bold: true, color: { argb: 'FF059669' } };
      } else if (b.status === 'cancelled') {
        statusCell.font = { bold: true, color: { argb: 'FFDC2626' } };
      }
    });

    styleHeaderRow(sheet, sheet.columns.length);
    shadeRows(sheet);
    autoFitColumns(sheet);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    await sendWorkbook(res, workbook, 'PakkaTourism_Bookings.xlsx');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/exports/attendance
// ─────────────────────────────────────────────────────────────────────────────
router.get('/attendance', protect, adminOnly, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const filter = {};
    if (from) filter.date = { ...filter.date, $gte: from };
    if (to)   filter.date = { ...filter.date, $lte: to };

    const records = await Attendance.find(filter)
      .sort({ date: -1 })
      .lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Pakka Tourism CRM';

    const sheet = workbook.addWorksheet('Attendance');

    sheet.columns = [
      { header: 'Employee',      key: 'name',        width: 22 },
      { header: 'Date',          key: 'date',         width: 14 },
      { header: 'Check In',      key: 'checkIn',      width: 12 },
      { header: 'Check Out',     key: 'checkOut',     width: 12 },
      { header: 'Hours Worked',  key: 'hours',        width: 14 },
      { header: 'Work Mode',     key: 'mode',         width: 12 },
      { header: 'Geo Status',    key: 'geo',          width: 14 },
      { header: 'Status',        key: 'status',       width: 12 },
    ];

    records.forEach(r => {
      sheet.addRow({
        name:     r.employeeName,
        date:     r.date,
        checkIn:  r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString('en-IN', { hour12: false }) : '—',
        checkOut: r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString('en-IN', { hour12: false }) : '—',
        hours:    r.hoursWorked ? `${r.hoursWorked}h` : '—',
        mode:     r.workMode === 'wfh' ? 'WFH' : 'In-Office',
        geo:      r.geoFenceStatus,
        status:   r.attendanceStatus,
      });
    });

    styleHeaderRow(sheet, sheet.columns.length);
    shadeRows(sheet);
    autoFitColumns(sheet);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    await sendWorkbook(res, workbook, 'PakkaTourism_Attendance.xlsx');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/exports/vendors  (simple passthrough — same pattern)
// GET /api/exports/revenue
// GET /api/exports/matrix
// — These endpoints use the same pattern; expand as needed —
// ─────────────────────────────────────────────────────────────────────────────
router.get('/vendors', protect, adminOnly, async (req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Vendors');
    sheet.columns = [
      { header: 'Vendor',     key: 'name',      width: 24 },
      { header: 'Category',   key: 'category',  width: 16 },
      { header: 'Contact',    key: 'contact',   width: 16 },
      { header: 'Total Paid', key: 'paid',      width: 16 },
      { header: 'Pending',    key: 'pending',   width: 16 },
    ];
    styleHeaderRow(sheet, sheet.columns.length);
    autoFitColumns(sheet);
    await sendWorkbook(res, workbook, 'PakkaTourism_Vendors.xlsx');
  } catch (err) { next(err); }
});

router.get('/revenue', protect, adminOnly, async (req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Revenue');
    sheet.columns = [
      { header: 'Date',        key: 'date',     width: 14 },
      { header: 'Type',        key: 'type',     width: 16 },
      { header: 'Description', key: 'desc',     width: 28 },
      { header: 'Amount (₹)', key: 'amount',   width: 16 },
      { header: 'Category',    key: 'category', width: 18 },
    ];
    styleHeaderRow(sheet, sheet.columns.length);
    autoFitColumns(sheet);
    await sendWorkbook(res, workbook, 'PakkaTourism_Revenue.xlsx');
  } catch (err) { next(err); }
});

router.get('/matrix', protect, async (req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tariff Matrix');
    sheet.columns = [
      { header: 'Pax', key: 'pax', width: 8 },
      ...([3,4,5,6,7].map(d => ({ header: `${d}N/${d+1}D`, key: `d${d}`, width: 14 })))
    ];
    for (let pax = 1; pax <= 50; pax++) {
      const row = { pax };
      [3,4,5,6,7].forEach(d => { row[`d${d}`] = 0; });
      sheet.addRow(row);
    }
    styleHeaderRow(sheet, sheet.columns.length);
    shadeRows(sheet);
    await sendWorkbook(res, workbook, 'PakkaTourism_TariffMatrix.xlsx');
  } catch (err) { next(err); }
});

module.exports = router;
