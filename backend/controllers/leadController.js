const Lead = require('../models/Lead');
const User = require('../models/User');
const Notification = require('../models/Notification');

// ─── Helper: push activity to timeline ──────────────────────────────────────
async function logActivity(leadId, action, description, performedBy, meta = {}) {
  await Lead.findByIdAndUpdate(leadId, {
    $push: {
      activityTimeline: {
        $each: [{ action, description, performedBy: performedBy._id, performedByName: performedBy.name, timestamp: new Date(), meta }],
        $position: 0
      }
    }
  });
}

// ─── Helper: send notification ───────────────────────────────────────────────
async function sendNotification(io, recipientId, type, title, message, leadId, actionUrl) {
  const notif = await Notification.create({ recipient: recipientId, type, title, message, leadId, actionUrl });
  if (io) io.to(`user_${recipientId}`).emit('notification', notif);
  return notif;
}

// ─── Smart Priority Aggregation Pipeline ─────────────────────────────────────
// Rule: pax >= 6 AND travelDate within next 10 days → highPriority: true → top
// smartScore = composite urgency (daysUntilTravel weight + pax weight + priority weight)
// Final sort: highPriority desc → smartScore desc → new_inquiry first → updatedAt desc
function buildSmartPipeline(matchFilter, skip, limit) {
  const now = new Date();
  const tenDaysLater = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

  // Status priority order: new_inquiry=0, contacted=1, negotiation=2 … lost=7
  const STATUS_ORDER = [
    'new_inquiry', 'contacted', 'negotiation', 'quote_sent',
    'advance_pending', 'confirmed', 'completed', 'lost'
  ];

  return [
    // Stage 1: Apply base filters
    { $match: matchFilter },

    // Stage 2: Compute smart priority fields
    { $addFields: {
      // highPriority: true when pax >= 6 AND travelDate is within next 10 days
      highPriority: {
        $and: [
          { $gte: ['$totalPax', 6] },
          { $ne: ['$travelDate', null] },
          { $gte: ['$travelDate', now] },
          { $lte: ['$travelDate', tenDaysLater] },
        ]
      },
      // daysUntilTravel: how many days until travel date (null if no date)
      daysUntilTravel: {
        $cond: [
          { $and: [{ $ne: ['$travelDate', null] }, { $gte: ['$travelDate', now] }] },
          { $divide: [{ $subtract: ['$travelDate', now] }, 86400000] }, // ms → days
          null
        ]
      },
      // Numeric priority weight: urgent=4, high=3, medium=2, low=1
      priorityWeight: {
        $switch: {
          branches: [
            { case: { $eq: ['$priority', 'urgent'] }, then: 4 },
            { case: { $eq: ['$priority', 'high']   }, then: 3 },
            { case: { $eq: ['$priority', 'medium'] }, then: 2 },
            { case: { $eq: ['$priority', 'low']    }, then: 1 },
          ],
          default: 2
        }
      },
      // Status sort order: new_inquiry=0 sorts first
      statusOrder: {
        $switch: {
          branches: STATUS_ORDER.map((s, i) => ({ case: { $eq: ['$leadStatus', s] }, then: i })),
          default: 99
        }
      },
    }},

    // Stage 3: Compute composite smartScore
    // Higher score = more urgent. Formula:
    //   base: priorityWeight * 10
    //   + pax bonus: min(totalPax, 20) * 0.5
    //   + travel urgency: max(0, 30 - daysUntilTravel) — closer date = higher score
    //   + highPriority bonus: 50 extra points
    { $addFields: {
      smartScore: {
        $add: [
          { $multiply: ['$priorityWeight', 10] },
          { $multiply: [{ $min: [{ $ifNull: ['$totalPax', 1] }, 20] }, 0.5] },
          { $cond: [
            { $ne: ['$daysUntilTravel', null] },
            { $max: [0, { $subtract: [30, '$daysUntilTravel'] }] },
            0
          ]},
          { $cond: ['$highPriority', 50, 0] },
        ]
      }
    }},

    // Stage 4: Sort — highPriority first, then smartScore desc, then status order, then recency
    { $sort: {
      highPriority: -1,   // true (1) before false (0)
      smartScore:   -1,   // highest score first
      statusOrder:   1,   // new_inquiry (0) before contacted (1), etc.
      updatedAt:    -1,   // most recently updated within same tier
    }},

    // Stage 5: Pagination
    ...(skip    !== undefined ? [{ $skip:  skip          }] : []),
    ...(limit   !== undefined ? [{ $limit: parseInt(limit) }] : []),

    // Stage 6: Populate assignedEmployee and createdBy
    { $lookup: { from: 'users', localField: 'assignedEmployee', foreignField: '_id', as: '_emp' } },
    { $lookup: { from: 'users', localField: 'createdBy',        foreignField: '_id', as: '_creator' } },
    { $addFields: {
      assignedEmployee: { $arrayElemAt: [
        { $map: { input: '$_emp', as: 'e', in: { _id: '$$e._id', name: '$$e.name', avatar: '$$e.avatar', email: '$$e.email' } } },
        0
      ]},
      createdBy: { $arrayElemAt: [
        { $map: { input: '$_creator', as: 'c', in: { _id: '$$c._id', name: '$$c.name' } } },
        0
      ]},
    }},
    { $project: { _emp: 0, _creator: 0 } },
  ];
}

// ─── GET /api/leads ──────────────────────────────────────────────────────────
const getLeads = async (req, res, next) => {
  try {
    const {
      leadStatus, assignedEmployee, priority, search,
      page = 1, limit = 50, unassigned, smartSort = 'true'
    } = req.query;

    const filter = {};

    // Employees only see their own leads
    if (req.user.role === 'employee') filter.assignedEmployee = req.user._id;

    if (leadStatus)             filter.leadStatus = leadStatus;
    if (assignedEmployee)       filter.assignedEmployee = new (require('mongoose').Types.ObjectId)(assignedEmployee);
    if (priority)               filter.priority = priority;
    if (unassigned === 'true')  filter.assignedEmployee = null;

    if (search) {
      filter.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { mobileNumber: { $regex: search, $options: 'i' } },
        { destination:  { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Lead.countDocuments(filter);

    let leads;
    if (smartSort !== 'false') {
      // Use Smart Priority aggregation
      leads = await Lead.aggregate(
        buildSmartPipeline(filter, (page - 1) * parseInt(limit), parseInt(limit))
      );
    } else {
      // Fall back to simple sort
      leads = await Lead.find(filter)
        .populate('assignedEmployee', 'name avatar email')
        .populate('createdBy', 'name')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * parseInt(limit))
        .limit(parseInt(limit));
    }

    res.json({ success: true, total, data: leads });
  } catch (err) { next(err); }
};

// ─── POST /api/leads ─────────────────────────────────────────────────────────
const createLead = async (req, res, next) => {
  try {
    const leadData = {
      ...req.body,
      totalPax: (parseInt(req.body.adults) || 1) + (parseInt(req.body.children) || 0),
      createdBy: req.user._id,
    };

    const lead = await Lead.create(leadData);

    // Log activity
    lead.activityTimeline.push({
      action: 'lead_created',
      description: `Lead created by ${req.user.name}`,
      performedBy: req.user._id,
      performedByName: req.user.name,
      timestamp: new Date()
    });
    await lead.save();

    // Notify admins if created by employee
    if (req.user.role === 'employee') {
      const admins = await User.find({ role: 'admin', isActive: true });
      const io = req.app.get('io');
      for (const admin of admins) {
        await sendNotification(io, admin._id, 'general', 'New Lead Created',
          `${req.user.name} created a new lead: ${lead.customerName} (${lead.destination})`,
          lead._id, '/leads');
      }
    }

    res.status(201).json({ success: true, data: lead });
  } catch (err) { next(err); }
};

// ─── GET /api/leads/kanban ───────────────────────────────────────────────────
// Each kanban column is sorted by Smart Priority (highPriority cards float to top)
const getKanban = async (req, res, next) => {
  try {
    const baseFilter = req.user.role === 'employee'
      ? { assignedEmployee: req.user._id }
      : {};

    const stages = ['new_inquiry', 'contacted', 'negotiation', 'quote_sent', 'advance_pending', 'confirmed', 'completed', 'lost'];
    const kanban = {};

    // Run aggregation for each stage in parallel for performance
    await Promise.all(stages.map(async (stage) => {
      const stageFilter = { ...baseFilter, leadStatus: stage };
      kanban[stage] = await Lead.aggregate(
        buildSmartPipeline(stageFilter, 0, 100)
      );
    }));

    res.json({ success: true, data: kanban });
  } catch (err) { next(err); }
};

// ─── GET /api/leads/:id ──────────────────────────────────────────────────────
const getLead = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedEmployee', 'name email avatar phone')
      .populate('createdBy', 'name email')
      .populate('activityTimeline.performedBy', 'name avatar');

    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    // Employees can only access their own leads
    if (req.user.role === 'employee' && String(lead.assignedEmployee?._id) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: lead });
  } catch (err) { next(err); }
};

// ─── PUT /api/leads/:id ──────────────────────────────────────────────────────
const updateLead = async (req, res, next) => {
  try {
    if (req.body.adults !== undefined || req.body.children !== undefined) {
      const adults = parseInt(req.body.adults) || 0;
      const children = parseInt(req.body.children) || 0;
      req.body.totalPax = adults + children;
    }

    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('assignedEmployee', 'name avatar');
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    await logActivity(req.params.id, 'note_added', `Lead updated by ${req.user.name}`, req.user);
    res.json({ success: true, data: lead });
  } catch (err) { next(err); }
};

// ─── PATCH /api/leads/:id/stage ──────────────────────────────────────────────
const updateStage = async (req, res, next) => {
  try {
    const { leadStatus, lostReason } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    const oldStage = lead.leadStatus;
    const update = { leadStatus };
    if (leadStatus === 'lost') { update.lostReason = lostReason; update.lostAt = new Date(); }

    const updated = await Lead.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('assignedEmployee', 'name avatar');

    await logActivity(req.params.id, 'stage_changed', `Stage changed from ${oldStage} to ${leadStatus}`, req.user, { oldStage, newStage: leadStatus });

    // Notify assigned employee on significant stage changes
    const io = req.app.get('io');
    if (updated.assignedEmployee && leadStatus === 'confirmed') {
      await sendNotification(io, updated.assignedEmployee._id, 'lead_converted',
        '🎉 Lead Confirmed!',
        `${updated.customerName} has been confirmed! Great work!`,
        updated._id, '/leads');
    }

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

// ─── POST /api/leads/:id/assign ──────────────────────────────────────────────
const assignLead = async (req, res, next) => {
  try {
    const { employeeId } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    const isReassign = lead.assignedEmployee !== null;
    const employee = await User.findById(employeeId);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    lead.assignedEmployee = employeeId;
    await lead.save();

    // Log activity
    await logActivity(req.params.id,
      isReassign ? 'reassigned' : 'assigned',
      `Lead ${isReassign ? 'reassigned' : 'assigned'} to ${employee.name} by ${req.user.name}`,
      req.user, { assignedTo: employee.name }
    );

    // Notify employee
    const io = req.app.get('io');
    await sendNotification(io, employeeId,
      isReassign ? 'lead_reassigned' : 'lead_assigned',
      isReassign ? 'Lead Reassigned to You' : 'New Lead Assigned',
      `Lead: ${lead.customerName} (${lead.destination}) has been assigned to you.`,
      lead._id, '/leads'
    );

    const updated = await Lead.findById(req.params.id).populate('assignedEmployee', 'name avatar email');
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

// ─── POST /api/leads/auto-assign ─────────────────────────────────────────────
// Round-robin assignment for all unassigned leads
const autoAssignLeads = async (req, res, next) => {
  try {
    const employees = await User.find({ role: 'employee', isActive: true }).sort({ createdAt: 1 });
    if (employees.length === 0) return res.status(400).json({ success: false, message: 'No active employees found' });

    const unassigned = await Lead.find({ assignedEmployee: null, leadStatus: { $ne: 'lost' } });
    if (unassigned.length === 0) return res.json({ success: true, message: 'No unassigned leads', assigned: 0 });

    const io = req.app.get('io');
    let assignedCount = 0;

    // Count existing leads per employee for balanced distribution
    const leadCounts = {};
    for (const emp of employees) {
      leadCounts[emp._id] = await Lead.countDocuments({ assignedEmployee: emp._id, leadStatus: { $nin: ['confirmed', 'completed', 'lost'] } });
    }

    for (const lead of unassigned) {
      // Assign to employee with fewest active leads (round-robin with balance)
      const emp = employees.reduce((min, e) =>
        (leadCounts[e._id] || 0) < (leadCounts[min._id] || 0) ? e : min, employees[0]);

      lead.assignedEmployee = emp._id;
      await lead.save();
      leadCounts[emp._id] = (leadCounts[emp._id] || 0) + 1;

      await logActivity(lead._id, 'assigned',
        `Auto-assigned to ${emp.name} (round-robin) by ${req.user.name}`, req.user,
        { assignedTo: emp.name, autoAssign: true });

      await sendNotification(io, emp._id, 'lead_assigned', 'New Lead Assigned',
        `Lead: ${lead.customerName} (${lead.destination}) auto-assigned to you.`,
        lead._id, '/leads');

      assignedCount++;
    }

    res.json({ success: true, message: `${assignedCount} leads auto-assigned (round-robin)`, assigned: assignedCount });
  } catch (err) { next(err); }
};

// ─── POST /api/leads/:id/followup ────────────────────────────────────────────
const addFollowup = async (req, res, next) => {
  try {
    const { note, followUpDate } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    lead.followUps.push({
      note, followUpDate: followUpDate ? new Date(followUpDate) : null,
      by: req.user._id, byName: req.user.name, createdAt: new Date()
    });
    if (followUpDate) lead.followUpDate = new Date(followUpDate);
    await lead.save();

    await logActivity(lead._id, 'followup_added',
      `Follow-up added: "${note}" — scheduled for ${followUpDate ? new Date(followUpDate).toLocaleDateString('en-IN') : 'N/A'}`,
      req.user);

    res.json({ success: true, data: lead });
  } catch (err) { next(err); }
};

// ─── POST /api/leads/:id/activity ────────────────────────────────────────────
const addActivity = async (req, res, next) => {
  try {
    const { action, description } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    await logActivity(lead._id, action, description, req.user);
    const updated = await Lead.findById(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

// ─── DELETE /api/leads/:id ───────────────────────────────────────────────────
const deleteLead = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
    await Lead.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Lead deleted' });
  } catch (err) { next(err); }
};

// ─── GET /api/leads/analytics (admin) ────────────────────────────────────────
const getLeadAnalytics = async (req, res, next) => {
  try {
    const total = await Lead.countDocuments();
    const assigned = await Lead.countDocuments({ assignedEmployee: { $ne: null } });
    const unassigned = await Lead.countDocuments({ assignedEmployee: null });
    const converted = await Lead.countDocuments({ leadStatus: { $in: ['confirmed', 'completed'] } });
    const lost = await Lead.countDocuments({ leadStatus: 'lost' });
    const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

    // Stage distribution
    const stageDistribution = await Lead.aggregate([
      { $group: { _id: '$leadStatus', count: { $sum: 1 } } }
    ]);

    // Employee-wise performance
    const empPerformance = await Lead.aggregate([
      { $match: { assignedEmployee: { $ne: null } } },
      { $group: { _id: '$assignedEmployee', total: { $sum: 1 }, converted: { $sum: { $cond: [{ $in: ['$leadStatus', ['confirmed', 'completed']] }, 1, 0] } } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'emp' } },
      { $unwind: '$emp' },
      { $project: { name: '$emp.name', total: 1, converted: 1, convRate: { $round: [{ $multiply: [{ $divide: ['$converted', '$total'] }, 100] }, 0] } } },
      { $sort: { converted: -1 } }
    ]);

    // Destination-wise performance
    const destPerformance = await Lead.aggregate([
      { $group: { _id: '$destination', count: { $sum: 1 }, budget: { $sum: '$budget' } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Source distribution
    const sourceDistribution = await Lead.aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } }
    ]);

    // Monthly leads (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const monthlyLeads = await Lead.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        count: { $sum: 1 },
        converted: { $sum: { $cond: [{ $in: ['$leadStatus', ['confirmed', 'completed']] }, 1, 0] } }
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.json({
      success: true,
      data: { total, assigned, unassigned, converted, lost, conversionRate, stageDistribution, empPerformance, destPerformance, sourceDistribution, monthlyLeads }
    });
  } catch (err) { next(err); }
};

module.exports = { getLeads, createLead, getLead, updateLead, updateStage, addFollowup, deleteLead, getKanban, assignLead, autoAssignLeads, addActivity, getLeadAnalytics };
