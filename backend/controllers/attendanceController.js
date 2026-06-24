const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Leave = require('../models/Leave');

// Haversine distance (meters)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

// ─── POST /api/attendance/checkin ───────────────────────────────────────────
const checkIn = async (req, res, next) => {
  try {
    const { workMode, latitude, longitude, faceVerified, deviceInfo } = req.body;
    const today = getTodayDate();
    const now = new Date();

    // Check already checked in today
    let existing = await Attendance.findOne({ employeeId: req.user._id, date: today });
    if (existing && existing.checkInTime) {
      return res.status(400).json({ success: false, message: 'Already checked in for today' });
    }

    // Geo-fence validation for office mode
    let geoFenceStatus = 'pending';
    let geoFenceDistance = null;

    if (workMode === 'office') {
      if (!latitude || !longitude) {
        return res.status(400).json({ success: false, message: 'Location is required for In-Office check-in' });
      }

      // Use admin's primary configured office location
      const admin = await User.findOne({ role: 'admin', isActive: true });
      const officeLocation = admin?.officeLocations?.[0] ||
                             (await User.findById(req.user._id))?.officeLocation;

      if (officeLocation?.lat && officeLocation?.lng) {
        geoFenceDistance = getDistance(latitude, longitude, officeLocation.lat, officeLocation.lng);
        const radius = officeLocation.radius || 50; // Default 50m precision

        if (geoFenceDistance > radius) {
          geoFenceStatus = 'failed';

          // Notify admin of geo-fence failure
          const admins = await User.find({ role: 'admin', isActive: true });
          for (const adminUser of admins) {
            await Notification.create({
              recipient: adminUser._id,
              type: 'geofence_failure',
              title: 'Geo-fence Failure',
              message: `${req.user.name} is ${Math.round(geoFenceDistance)}m from office "${officeLocation.name || 'Office'}" (limit: ${radius}m). In-Office check-in rejected.`,
              actionUrl: '/attendance'
            });
          }

          return res.status(403).json({
            success: false,
            message: `You are ${Math.round(geoFenceDistance)}m from office. Must be within ${radius}m for In-Office check-in.`,
            geoFenceDistance: Math.round(geoFenceDistance),
            required: radius,
            officeName: officeLocation.name || 'Configured Office'
          });
        }
        geoFenceStatus = 'verified';
      } else {
        // No office location configured — allow but mark as pending
        geoFenceStatus = 'pending';
      }
    } else if (workMode === 'wfh') {
      // WFH: store location but bypass distance check
      geoFenceStatus = 'wfh';
    }

    // Determine attendance status (late = after 9:30 AM)
    const checkInHour = now.getHours();
    const checkInMin = now.getMinutes();
    let attendanceStatus = 'present';
    if (checkInHour > 9 || (checkInHour === 9 && checkInMin > 30)) {
      attendanceStatus = 'late';
    }

    // Upsert attendance record
    const record = await Attendance.findOneAndUpdate(
      { employeeId: req.user._id, date: today },
      {
        $set: {
          employeeId: req.user._id,
          employeeName: req.user.name,
          date: today,
          checkInTime: now,
          workMode,
          latitude: latitude || null,
          longitude: longitude || null,
          geoFenceStatus,
          geoFenceDistance,
          attendanceStatus,
          faceVerified: faceVerified || false,
          deviceInfo: deviceInfo || {},
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Notify admin
    const admins = await User.find({ role: 'admin', isActive: true });
    for (const admin of admins) {
      const notif = await Notification.create({
        recipient: admin._id,
        type: 'attendance_marked',
        title: 'Attendance Marked',
        message: `${req.user.name} checked in at ${now.toLocaleTimeString('en-IN')} (${workMode === 'office' ? 'In-Office' : 'WFH'})`,
        actionUrl: '/attendance'
      });

      // Emit real-time event if socket io available
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${admin._id}`).emit('notification', notif);
      }
    }

    res.json({ success: true, data: record });
  } catch (err) { next(err); }
};

// ─── POST /api/attendance/checkout ──────────────────────────────────────────
const checkOut = async (req, res, next) => {
  try {
    const today = getTodayDate();
    const now   = new Date();
    const { workReport, remarks, selfRating } = req.body;

    const record = await Attendance.findOne({ employeeId: req.user._id, date: today });
    if (!record)           return res.status(404).json({ success: false, message: 'No check-in found for today' });
    if (!record.checkInTime)  return res.status(400).json({ success: false, message: 'Must check in before checking out' });
    if (record.checkOutTime)  return res.status(400).json({ success: false, message: 'Already checked out for today' });

    record.checkOutTime = now;
    const ms = now - record.checkInTime;
    record.hoursWorked = parseFloat((ms / 3600000).toFixed(2));

    // Half day if less than 5 hours
    if (record.hoursWorked < 5 && record.attendanceStatus === 'present') {
      record.attendanceStatus = 'half_day';
    }

    // Save daily work report fields
    if (workReport)  record.workReport  = workReport.trim().substring(0, 2000);
    if (remarks)     record.remarks     = remarks.trim().substring(0, 1000);
    if (selfRating)  record.selfRating  = Math.min(10, Math.max(1, Number(selfRating)));

    await record.save();

    // Notify admin about checkout + work report
    const admins = await User.find({ role: 'admin', isActive: true });
    for (const admin of admins) {
      const notif = await Notification.create({
        recipient:  admin._id,
        type:       'attendance_marked',
        title:      'Employee Checked Out',
        message:    `${req.user.name} checked out at ${now.toLocaleTimeString('en-IN')} (${fmtHours(record.hoursWorked)}). Rating: ${record.selfRating || '—'}/10`,
        actionUrl:  '/attendance'
      });
      const io = req.app.get('io');
      if (io) io.to(`user_${admin._id}`).emit('notification', notif);
    }

    res.json({ success: true, data: record });
  } catch (err) { next(err); }
};

function fmtHours(h) {
  if (!h) return '0h 0m';
  const hrs = Math.floor(h);
  const min = Math.round((h - hrs) * 60);
  return `${hrs}h ${min}m`;
}


// ─── GET /api/attendance/ ────────────────────────────────────────────────────
const getMyAttendance = async (req, res, next) => {
  try {
    const { month, year, page = 1, limit = 31 } = req.query;
    const filter = { employeeId: req.user._id };

    if (month && year) {
      // Filter by month
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      filter.date = { $gte: startDate, $lte: endDate };
    }

    const total = await Attendance.countDocuments(filter);
    const records = await Attendance.find(filter)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Calculate stats for the filtered period
    const presentDays = records.filter(r => r.attendanceStatus === 'present' || r.attendanceStatus === 'late').length;
    const absentDays  = records.filter(r => r.attendanceStatus === 'absent').length;
    const lateDays    = records.filter(r => r.attendanceStatus === 'late').length;
    const wfhDays     = records.filter(r => r.workMode === 'wfh').length;
    const totalHours  = records.reduce((s, r) => s + (r.hoursWorked || 0), 0);

    res.json({
      success: true, total,
      stats: { presentDays, absentDays, lateDays, wfhDays, totalHours: parseFloat(totalHours.toFixed(1)) },
      data: records
    });
  } catch (err) { next(err); }
};

// ─── GET /api/attendance/stats (admin) ──────────────────────────────────────
const getDashboardStats = async (req, res, next) => {
  try {
    const today = getTodayDate();

    // Today's attendance
    const todayRecords = await Attendance.find({ date: today });
    const totalEmployees = await User.countDocuments({ role: 'employee', isActive: true });

    const present = todayRecords.filter(r => ['present', 'late'].includes(r.attendanceStatus)).length;
    const late    = todayRecords.filter(r => r.attendanceStatus === 'late').length;
    const wfh     = todayRecords.filter(r => r.workMode === 'wfh' && r.checkInTime).length;
    const absent  = totalEmployees - present;

    // This month's stats
    const now = new Date();
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthRecords = await Attendance.find({ date: { $gte: startOfMonth } });
    const monthPresent = monthRecords.filter(r => r.attendanceStatus === 'present' || r.attendanceStatus === 'late').length;
    const monthTotal = monthRecords.length;
    const monthlyPct = monthTotal > 0 ? Math.round((monthPresent / monthTotal) * 100) : 0;

    res.json({
      success: true,
      data: {
        today: { present, absent: Math.max(0, absent), late, wfh, totalEmployees, date: today },
        monthly: { attendancePct: monthlyPct, totalRecords: monthTotal }
      }
    });
  } catch (err) { next(err); }
};

// ─── GET /api/attendance/trend ───────────────────────────────────────────────
const getAttendanceTrend = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const results = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      const dayRecords = await Attendance.find({ date: dateStr });
      const totalEmployees = await User.countDocuments({ role: 'employee', isActive: true });
      const present = dayRecords.filter(r => ['present', 'late'].includes(r.attendanceStatus)).length;

      results.push({
        date: dateStr,
        label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        present,
        absent: Math.max(0, totalEmployees - present),
        wfh: dayRecords.filter(r => r.workMode === 'wfh').length,
        late: dayRecords.filter(r => r.attendanceStatus === 'late').length,
      });
    }

    res.json({ success: true, data: results });
  } catch (err) { next(err); }
};

// ─── GET /api/attendance/all (admin) ────────────────────────────────────────
const adminGetAll = async (req, res, next) => {
  try {
    const { date, employeeId, status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (date) filter.date = date;
    if (employeeId) filter.employeeId = employeeId;
    if (status) filter.attendanceStatus = status;

    const total = await Attendance.countDocuments(filter);
    const records = await Attendance.find(filter)
      .populate('employeeId', 'name email department designation')
      .sort({ date: -1, checkInTime: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, total, data: records });
  } catch (err) { next(err); }
};

// ─── POST /api/attendance/manual (admin) ────────────────────────────────────
const markManual = async (req, res, next) => {
  try {
    const { employeeId, date, attendanceStatus, workMode, notes } = req.body;

    const employee = await User.findById(employeeId);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const record = await Attendance.findOneAndUpdate(
      { employeeId, date },
      {
        $set: {
          employeeId, employeeName: employee.name, date,
          attendanceStatus, workMode: workMode || 'office',
          markedManually: true, markedBy: req.user._id,
          notes
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, data: record });
  } catch (err) { next(err); }
};

// ─── GET /api/attendance/monthly (admin) ────────────────────────────────────
const getMonthlyStats = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const m = month || (new Date().getMonth() + 1);
    const y = year || new Date().getFullYear();
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = new Date(y, m, 0).toISOString().split('T')[0];

    const employees = await User.find({ role: 'employee', isActive: true });
    const stats = [];

    for (const emp of employees) {
      const records = await Attendance.find({
        employeeId: emp._id,
        date: { $gte: startDate, $lte: endDate }
      });
      const present = records.filter(r => ['present', 'late'].includes(r.attendanceStatus)).length;
      const totalHours = records.reduce((s, r) => s + (r.hoursWorked || 0), 0);

      stats.push({
        employee: { _id: emp._id, name: emp.name, department: emp.department },
        present, absent: records.filter(r => r.attendanceStatus === 'absent').length,
        late: records.filter(r => r.attendanceStatus === 'late').length,
        wfh: records.filter(r => r.workMode === 'wfh').length,
        totalHours: parseFloat(totalHours.toFixed(1)),
        attendancePct: records.length > 0 ? Math.round((present / records.length) * 100) : 0
      });
    }

    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
};

// ─── POST /api/attendance/leave/apply ───────────────────────────────────────
const applyLeave = async (req, res, next) => {
  try {
    const { startDate, endDate, type, reason } = req.body;
    
    // Calculate simple days diff (inclusive)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

    const leave = await Leave.create({
      employeeId: req.user._id,
      employeeName: req.user.name,
      startDate, endDate, days, type, reason, status: 'pending'
    });

    // Notify admins
    const admins = await User.find({ role: 'admin', isActive: true });
    for (const admin of admins) {
      await Notification.create({
        recipient: admin._id,
        type: 'leave_request',
        title: 'New Leave Request',
        message: `${req.user.name} applied for ${days} day(s) leave (${type}).`,
        actionUrl: '/attendance'
      });
    }

    res.json({ success: true, data: leave });
  } catch (err) { next(err); }
};

// ─── GET /api/attendance/leave ──────────────────────────────────────────────
const getLeaves = async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { employeeId: req.user._id };
    const leaves = await Leave.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: leaves });
  } catch (err) { next(err); }
};

// ─── PUT /api/attendance/leave/:id/status (admin) ───────────────────────────
const updateLeaveStatus = async (req, res, next) => {
  try {
    const { status, adminNotes } = req.body;
    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });

    leave.status = status;
    leave.approvedBy = req.user._id;
    if (adminNotes) leave.adminNotes = adminNotes;
    await leave.save();

    // If approved, create Attendance records for each day
    if (status === 'approved') {
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        // skip weekends (0=Sun)
        if (d.getDay() !== 0) {
          await Attendance.findOneAndUpdate(
            { employeeId: leave.employeeId, date: dateStr },
            {
              $set: {
                employeeId: leave.employeeId, employeeName: leave.employeeName, date: dateStr,
                attendanceStatus: 'on_leave', workMode: 'office', markedManually: true, markedBy: req.user._id,
                notes: `Approved ${leave.type} leave: ${leave.reason}`
              }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
      }
    }

    // Notify employee
    await Notification.create({
      recipient: leave.employeeId,
      type: 'leave_update',
      title: 'Leave Request Update',
      message: `Your leave request for ${leave.startDate} has been ${status}.`,
      actionUrl: '/attendance'
    });

    res.json({ success: true, data: leave });
  } catch (err) { next(err); }
};

// ─── POST /api/attendance/auto-absent (admin/cron) ──────────────────────────
const markAutoAbsent = async (req, res, next) => {
  try {
    const { date } = req.body;
    const targetDate = date || getTodayDate();
    
    // Get all active employees
    const employees = await User.find({ role: 'employee', isActive: true });
    let markedCount = 0;

    for (const emp of employees) {
      const existing = await Attendance.findOne({ employeeId: emp._id, date: targetDate });
      if (!existing) {
        await Attendance.create({
          employeeId: emp._id,
          employeeName: emp.name,
          date: targetDate,
          attendanceStatus: 'absent',
          workMode: 'office', // default
          markedManually: true, // or system
          notes: 'Auto-marked absent by system'
        });
        markedCount++;
      }
    }

    res.json({ success: true, message: `Auto-marked ${markedCount} employees absent for ${targetDate}` });
  } catch (err) { next(err); }
};

module.exports = { 
  checkIn, checkOut, getMyAttendance, getDashboardStats, getAttendanceTrend, 
  adminGetAll, markManual, getMonthlyStats,
  applyLeave, getLeaves, updateLeaveStatus, markAutoAbsent
};
