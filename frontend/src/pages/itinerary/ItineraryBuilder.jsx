import React, { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } from 'docx';
import { saveAs } from 'file-saver';
import api from '../../services/api';
import useCompanyStore from '../../store/useCompanyStore';

const ACTIVITY_ICONS = ['🚗','🏨','🥾','🌊','🏔️','🎭','🍜','🛺','⛵','🚠','🎪','🌅'];
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const DEFAULT_ITINERARY = {
  title: 'Manali Adventure Package',
  clientName: '',
  clientPhone: '',
  totalPrice: '',
  destination: 'Manali, Himachal Pradesh',
  days: 3,
  coverImage: '',
  dayPlans: [
    {
      dayNumber: 1, title: 'Arrival & Solang Valley', date: '2025-06-15',
      accommodation: 'Sunrise Hotel, Mall Road',
      meals: { breakfast: false, lunch: true, dinner: true },
      imageUrl: '',
      activities: [
        { time: '14:00', activity: 'Arrival at Manali', location: 'Volvo Bus Stand', duration: '—', notes: 'Pick up and transfer to hotel', imageUrl: '' },
        { time: '16:00', activity: 'Solang Valley Visit', location: 'Solang Valley', duration: '3h', notes: 'Snow activities if available', imageUrl: '' },
        { time: '20:00', activity: 'Welcome Dinner', location: 'Khyber Restaurant', duration: '1.5h', notes: 'Authentic Himachali cuisine', imageUrl: '' },
      ],
      transport: 'Tempo Traveller',
    },
    {
      dayNumber: 2, title: 'Rohtang Pass Excursion', date: '2025-06-16',
      accommodation: 'Sunrise Hotel, Mall Road',
      meals: { breakfast: true, lunch: true, dinner: true },
      imageUrl: '',
      activities: [
        { time: '06:00', activity: 'Early Departure for Rohtang', location: 'Hotel Pickup', duration: '—', notes: 'Early start to beat traffic', imageUrl: '' },
        { time: '10:00', activity: 'Rohtang Pass Snow Play', location: 'Rohtang Pass (3978m)', duration: '4h', notes: 'Snow activities, photography', imageUrl: '' },
        { time: '15:00', activity: 'Return to Manali', location: 'Mall Road', duration: '—', notes: 'Shopping at local market', imageUrl: '' },
      ],
      transport: 'Jeep (Permit Included)',
    },
    {
      dayNumber: 3, title: 'Old Manali & Departure', date: '2025-06-17',
      accommodation: '—',
      meals: { breakfast: true, lunch: false, dinner: false },
      imageUrl: '',
      activities: [
        { time: '09:00', activity: 'Old Manali Temples', location: 'Hadimba Temple, Manu Temple', duration: '2h', notes: 'Ancient temples and cedar forest', imageUrl: '' },
        { time: '12:00', activity: 'Volvo Bus Departure', location: 'HRTC Bus Stand', duration: '—', notes: 'Drop off at bus stand', imageUrl: '' },
      ],
      transport: 'Hotel Vehicle',
    },
  ],
  inclusions: ['Hotel accommodation (2 nights)', '2 Jeeps for sightseeing', 'All meals as per plan', 'Rohtang Pass permit', 'Driver & guide charges'],
  exclusions: ['Personal expenses', 'Adventure activities charges', 'Tips', 'Any medical emergencies'],
};

// ── Load image URL → base64 ────────────────────────────────────────────────────
function loadImageAsBase64(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(null);
    img.src = fullUrl;
  });
}

// ── Draw rounded rect helper ───────────────────────────────────────────────────
function fillRoundedRect(pdf, x, y, w, h, r, color) {
  pdf.setFillColor(...color);
  pdf.roundedRect(x, y, w, h, r, r, 'F');
}

// ── Premium PDF builder ────────────────────────────────────────────────────────
async function buildPremiumPDF(itin, company) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  const PW = 210, PH = 297;
  const ML = 14, MR = 14, MW = PW - ML - MR;
  const FOOTER_H = 16;
  const CONTENT_BOTTOM = PH - FOOTER_H - 6;

  // ── Colour palette ──────────────────────────────────────────────────────────
  const C = {
    blue:      [30, 64, 175],
    blueLight: [59, 130, 246],
    bluePale:  [219, 234, 254],
    gold:      [180, 120, 20],
    goldLight: [251, 191, 36],
    dark:      [15, 23, 42],
    gray:      [71, 85, 105],
    muted:     [148, 163, 184],
    green:     [16, 185, 129],
    greenBg:   [236, 253, 245],
    greenBdr:  [110, 231, 183],
    red:       [239, 68, 68],
    redBg:     [254, 242, 242],
    redBdr:    [252, 165, 165],
    border:    [226, 232, 240],
    bgLight:   [248, 250, 252],
    white:     [255, 255, 255],
    navy:      [15, 23, 42],
  };

  let page = 1;
  let y = 0;

  // ── Draw page footer ─────────────────────────────────────────────────────────
  const drawFooter = (pn) => {
    pdf.setPage(pn);
    pdf.setFillColor(...C.navy);
    pdf.rect(0, PH - FOOTER_H, PW, FOOTER_H, 'F');

    // Gold accent line
    pdf.setFillColor(...C.goldLight);
    pdf.rect(0, PH - FOOTER_H, PW, 1, 'F');

    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(200, 210, 230);
    const name = company?.companyName || 'Pakka Tourism Pvt. Ltd.';
    const contact = [company?.companyPhone, company?.companyEmail].filter(Boolean).join('   |   ');
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text(name, ML, PH - FOOTER_H + 6.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(180, 195, 220);
    if (contact) pdf.text(contact, ML, PH - FOOTER_H + 11.5);
    pdf.setTextColor(...C.goldLight);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(`${pn}`, PW - MR, PH - FOOTER_H + 9, { align: 'right' });
  };

  const newPage = () => {
    drawFooter(page);
    pdf.addPage();
    page++;
    y = 10;
  };

  const need = (h) => { if (y + h > CONTENT_BOTTOM) newPage(); };

  // ══════════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ══════════════════════════════════════════════════════════════════════════════

  // Deep navy background
  pdf.setFillColor(...C.navy);
  pdf.rect(0, 0, PW, PH, 'F');

  // Cover image if available
  const coverImgB64 = await loadImageAsBase64(itin.coverImage);
  if (coverImgB64) {
    try {
      pdf.addImage(coverImgB64, 'JPEG', 0, 0, PW, PH * 0.55, undefined, 'FAST');
      // Overlay gradient darkness
      pdf.setGState(new pdf.GState({ opacity: 0.55 }));
      pdf.setFillColor(0, 0, 0);
      pdf.rect(0, 0, PW, PH * 0.55, 'F');
      pdf.setGState(new pdf.GState({ opacity: 1 }));
    } catch (_) {}
  }

  // Gold decorative top bar
  pdf.setFillColor(...C.goldLight);
  pdf.rect(0, 0, PW, 3, 'F');

  // Logo
  const logoB64 = await loadImageAsBase64(company?.companyLogo);
  if (logoB64) {
    try {
      pdf.addImage(logoB64, 'PNG', ML, 12, 30, 30, undefined, 'FAST');
    } catch (_) {}
  }

  // Company name on cover
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  const logoOffsetX = logoB64 ? ML + 34 : ML;
  pdf.text(company?.companyName || 'Pakka Tourism', logoOffsetX, 26);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.goldLight);
  pdf.text('Your Trusted Travel Partner', logoOffsetX, 33);

  // Main title block (lower on cover)
  const titleY = coverImgB64 ? PH * 0.38 : PH * 0.3;

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(28);
  const safeTitle = String(itin.title || 'Itinerary');
  const titleLines = pdf.splitTextToSize(safeTitle, PW - 30);
  pdf.text(titleLines.length ? titleLines : safeTitle, PW / 2, titleY, { align: 'center' });

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.goldLight);
  pdf.text(`Location: ${String(itin.destination || 'Destination')}`, PW / 2, titleY + Math.max(1, titleLines.length) * 11 + 4, { align: 'center' });

  // Gold divider
  const divY = titleY + titleLines.length * 11 + 12;
  pdf.setFillColor(...C.goldLight);
  pdf.rect(PW / 2 - 30, divY, 60, 0.8, 'F');

  // Stats row
  const statsY = divY + 10;
  const stats = [
    [`${itin.days} Days`, `${itin.days > 1 ? itin.days - 1 : 0} Nights`],
    ['For', String(itin.clientName || 'Valued Client')],
    ...(itin.totalPrice ? [['Price', `INR ${itin.totalPrice}`]] : []),
  ];
  const slotW = MW / stats.length;
  stats.forEach(([label, val], i) => {
    const sx = ML + i * slotW + slotW / 2;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...C.muted);
    pdf.text(String(label), sx, statsY, { align: 'center' });
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(255, 255, 255);
    pdf.text(String(val), sx, statsY + 7, { align: 'center' });
  });

  // Prepared date
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(...C.muted);
  pdf.text(`Prepared on ${today}`, PW / 2, PH - FOOTER_H - 10, { align: 'center' });

  // Footer on cover
  drawFooter(page);

  // ══════════════════════════════════════════════════════════════════════════════
  // CONTENT PAGES
  // ══════════════════════════════════════════════════════════════════════════════
  pdf.addPage();
  page++;
  y = 12;

  // White background for all content pages
  pdf.setFillColor(...C.white);

  // ── Section heading helper ──────────────────────────────────────────────────
  const sectionHeading = (text) => {
    need(14);
    pdf.setFillColor(...C.blue);
    pdf.rect(ML, y, 4, 10, 'F');
    pdf.setFillColor(...C.bgLight);
    pdf.rect(ML + 4, y, MW - 4, 10, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...C.blue);
    pdf.text(text, ML + 8, y + 7);
    y += 12;
  };

  // ── Trip summary band ───────────────────────────────────────────────────────
  fillRoundedRect(pdf, ML, y, MW, 28, 3, C.blue);

  // Logo small on content page
  if (logoB64) {
    try { pdf.addImage(logoB64, 'PNG', ML + 3, y + 3, 18, 18, undefined, 'FAST'); } catch (_) {}
  }
  const hdrX = logoB64 ? ML + 25 : ML + 4;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(255, 255, 255);
  // Limit title width so it doesn't overflow into the right-side info
  const summaryTitleMaxW = MW - 35;
  const summaryTitleLines = pdf.splitTextToSize(String(itin.title || 'Itinerary'), summaryTitleMaxW);
  pdf.text(summaryTitleLines[0] || String(itin.title || 'Itinerary'), hdrX, y + 10);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(...C.bluePale);
  const destLines = pdf.splitTextToSize(String(itin.destination || 'Destination'), summaryTitleMaxW);
  pdf.text(destLines[0] || String(itin.destination || 'Destination'), hdrX, y + 17);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(...C.goldLight);
  pdf.text(`${itin.days}D/${itin.days > 1 ? itin.days - 1 : 0}N`, PW - MR - 2, y + 8, { align: 'right' });
  if (itin.clientName) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(255, 255, 255);
    pdf.text(`For: ${itin.clientName}`, PW - MR - 2, y + 15, { align: 'right' });
  }
  if (itin.totalPrice) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...C.goldLight);
    pdf.text(`INR ${itin.totalPrice}`, PW - MR - 2, y + 23, { align: 'right' });
  }
  y += 33;

  // ══════════════════════════════════════════════════════════════════════════════
  // DAY PLANS
  // ══════════════════════════════════════════════════════════════════════════════
  sectionHeading('DAY-WISE ITINERARY');

  for (const d of itin.dayPlans.slice(0, itin.days)) {
    // Day image
    const dayImgB64 = await loadImageAsBase64(d.imageUrl);

    // Calculate min height for this day block header
    need(18);

    // Day number badge + header
    fillRoundedRect(pdf, ML, y, MW, 14, 2, C.dark);

    // Day badge circle
    pdf.setFillColor(...C.goldLight);
    pdf.circle(ML + 9, y + 7, 6, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...C.navy);
    pdf.text(`${d.dayNumber}`, ML + 9, y + 9.5, { align: 'center' });

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(255, 255, 255);
    pdf.text(`Day ${d.dayNumber}: ${String(d.title || 'Day Plan')}`, ML + 18, y + 7);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...C.muted);
    // Right-side info — truncate to fit within margin
    const rightParts = [d.date, d.accommodation ? `Stay: ${d.accommodation}` : null, d.transport ? `Transport: ${d.transport}` : null].filter(Boolean);
    const rightText = rightParts.join('  |  ');
    if (rightText) {
      const rightMaxW = MW - 30; // leave space for day badge + title
      const rightLines = pdf.splitTextToSize(rightText, rightMaxW);
      // Show max 1 line on the right to avoid wrapping over day title
      pdf.text(rightLines[0] || rightText, PW - MR - 2, y + 10.5, { align: 'right' });
    }

    y += 16;

    // Day image if exists
    if (dayImgB64) {
      need(45);
      try {
        pdf.addImage(dayImgB64, 'JPEG', ML, y, MW, 40, undefined, 'FAST');
        // Caption bar
        pdf.setFillColor(0, 0, 0);
        pdf.setGState && pdf.setGState(new pdf.GState({ opacity: 0.45 }));
        pdf.rect(ML, y + 32, MW, 8, 'F');
        pdf.setGState && pdf.setGState(new pdf.GState({ opacity: 1 }));
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.setTextColor(255, 255, 255);
        if (d.title) pdf.text(String(d.title), ML + 3, y + 37.5);
        y += 42;
      } catch (_) { y += 2; }
    }

    // Meals bar
    if (d.meals) {
      need(8);
      pdf.setFillColor(...C.greenBg);
      pdf.setDrawColor(...C.greenBdr);
      pdf.setLineWidth(0.2);
      pdf.rect(ML, y, MW, 7, 'FD');
      const mealLabels = [];
      if (d.meals.breakfast) mealLabels.push('Breakfast');
      if (d.meals.lunch)     mealLabels.push('Lunch');
      if (d.meals.dinner)    mealLabels.push('Dinner');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...C.green);
      pdf.text(mealLabels.length ? `Meals Included: ${mealLabels.join(' | ')}` : 'No meals included', ML + 3, y + 5);
      y += 8;
    }

    // Activities
    for (let i = 0; i < (d.activities || []).length; i++) {
      const act = d.activities[i];
      const actImgB64 = await loadImageAsBase64(act.imageUrl);
      const safeNotes = String(act.notes || ' ');
      const noteLines = pdf.splitTextToSize(safeNotes, MW - 48);
      const baseH = 16;
      const noteH = (act.notes && noteLines.length > 0) ? noteLines.length * 4 : 0;
      const imgH = actImgB64 ? 28 : 0;
      const rowH = Math.max(baseH, baseH + noteH) + imgH;

      need(rowH + 2);

      // Alternating row background
      const rowBg = i % 2 === 0 ? C.white : C.bgLight;
      pdf.setFillColor(...rowBg);
      pdf.rect(ML, y, MW, rowH, 'F');

      // Left time column
      pdf.setFillColor(...C.bluePale);
      pdf.rect(ML, y, 20, rowH, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(...C.blue);
      pdf.text(act.time ? String(act.time) : '-', ML + 10, y + 7, { align: 'center' });
      if (act.duration && act.duration !== '-' && act.duration !== '') {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(...C.gray);
        pdf.text(String(act.duration), ML + 10, y + 12, { align: 'center' });
      }

      // Icon — use ASCII bullet instead of emoji (helvetica cannot render emoji)
      pdf.setFontSize(12);
      pdf.setTextColor(...C.blue);
      pdf.text('>', ML + 23, y + 8);

      // Activity content — clamp to available width to prevent overflow
      const actTitleMaxW = MW - 32;  // MW minus (time col 20 + icon col 10 + padding 2)
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(...C.dark);
      const safeActivity = String(act.activity || 'Activity');
      const actTitleLines = pdf.splitTextToSize(safeActivity, actTitleMaxW);
      pdf.text(actTitleLines[0] || safeActivity, ML + 30, y + 7);

      if (act.location) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...C.gray);
        const locLines = pdf.splitTextToSize(String(act.location), actTitleMaxW - 4);
        pdf.text(locLines[0] || String(act.location), ML + 30, y + 12);
      }

      if (act.notes && noteLines.length > 0) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.setTextColor(...C.muted);
        noteLines.forEach((line, li) => {
          if (line && line.trim() !== '') pdf.text(line, ML + 30, y + 16 + li * 4);
        });
      }

      // Activity image
      if (actImgB64) {
        const imgY = y + baseH + noteH;
        try {
          pdf.addImage(actImgB64, 'JPEG', ML + 22, imgY, MW - 22, 26, undefined, 'FAST');
        } catch (_) {}
      }

      // Bottom divider
      pdf.setDrawColor(...C.border);
      pdf.setLineWidth(0.15);
      pdf.line(ML, y + rowH, ML + MW, y + rowH);

      y += rowH + 1;
    }

    y += 8;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // INCLUSIONS & EXCLUSIONS
  // ══════════════════════════════════════════════════════════════════════════════
  sectionHeading('INCLUSIONS & EXCLUSIONS');

  const incH = itin.inclusions.length * 6.5 + 18;
  const excH = itin.exclusions.length * 6.5 + 18;
  const boxH = Math.max(incH, excH);
  need(boxH + 4);

  const halfW = (MW - 6) / 2;

  // Inclusions box
  pdf.setFillColor(...C.greenBg);
  pdf.setDrawColor(...C.greenBdr);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(ML, y, halfW, boxH, 3, 3, 'FD');
  // Green top band
  pdf.setFillColor(...C.green);
  pdf.roundedRect(ML, y, halfW, 9, 3, 3, 'F');
  pdf.rect(ML, y + 4, halfW, 5, 'F'); // flatten bottom of top band
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(255, 255, 255);
  pdf.text('INCLUSIONS', ML + 4, y + 6.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(30, 80, 50);
  itin.inclusions.forEach((item, idx) => {
    if (!item) return;
    pdf.setFillColor(...C.green);
    pdf.circle(ML + 5.5, y + 14 + idx * 6.5, 1.2, 'F');
    // Wrap long inclusion items to fit within the half-width box
    const incLines = pdf.splitTextToSize(item, halfW - 12);
    pdf.text(incLines[0] || item, ML + 9, y + 14.5 + idx * 6.5);
  });

  // Exclusions box
  const excX = ML + halfW + 6;
  pdf.setFillColor(...C.redBg);
  pdf.setDrawColor(...C.redBdr);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(excX, y, halfW, boxH, 3, 3, 'FD');
  pdf.setFillColor(...C.red);
  pdf.roundedRect(excX, y, halfW, 9, 3, 3, 'F');
  pdf.rect(excX, y + 4, halfW, 5, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(255, 255, 255);
  pdf.text('EXCLUSIONS', excX + 4, y + 6.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(120, 30, 30);
  itin.exclusions.forEach((item, idx) => {
    if (!item) return;
    pdf.setFillColor(...C.red);
    pdf.circle(excX + 5.5, y + 14 + idx * 6.5, 1.2, 'F');
    // Wrap long exclusion items to fit within the half-width box
    const excLines = pdf.splitTextToSize(item, halfW - 12);
    pdf.text(excLines[0] || item, excX + 9, y + 14.5 + idx * 6.5);
  });

  y += boxH + 10;

  // ══════════════════════════════════════════════════════════════════════════════
  // TERMS & SIGNATURE
  // ══════════════════════════════════════════════════════════════════════════════
  need(28);
  pdf.setFillColor(...C.bgLight);
  pdf.setDrawColor(...C.border);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(ML, y, MW, 24, 3, 3, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...C.gray);
  pdf.text('Terms & Conditions', ML + 4, y + 6);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(...C.muted);
  pdf.text('This itinerary is subject to change based on weather, availability, and force majeure. Prices are valid for the mentioned dates only.', ML + 4, y + 11.5, { maxWidth: MW - 8 });
  pdf.text('All payments are to be made as per the payment schedule. Cancellation charges apply as per our policy.', ML + 4, y + 16.5, { maxWidth: MW - 8 });

  // Authorised signature
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(7);
  pdf.setTextColor(...C.gray);
  pdf.text('Authorised Signature:', ML + 4, y + 22);
  pdf.setDrawColor(...C.gray);
  pdf.setLineWidth(0.3);
  pdf.line(ML + 35, y + 22, ML + 80, y + 22);
  pdf.text('Date:', PW - MR - 50, y + 22);
  pdf.line(PW - MR - 35, y + 22, PW - MR, y + 22);

  y += 28;

  // Finalise all footers
  for (let p = 1; p <= page; p++) drawFooter(p);

  return pdf;
}

// ══════════════════════════════════════════════════════════════════════════════
// DOCX BUILDER
// ══════════════════════════════════════════════════════════════════════════════
async function buildItineraryDOCX(itin, company) {
  const children = [];

  const heading = (text, level = HeadingLevel.HEADING_1) =>
    new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });

  const para = (text, opts = {}) =>
    new Paragraph({
      children: [new TextRun({ text: String(text || ''), ...opts })],
      spacing: { after: 80 },
    });

  const boldPara = (label, value) =>
    new Paragraph({
      children: [
        new TextRun({ text: `${label}: `, bold: true }),
        new TextRun({ text: String(value || '—') }),
      ],
      spacing: { after: 60 },
    });

  // Header
  children.push(new Paragraph({
    children: [new TextRun({ text: company?.companyName || 'Pakka Tourism Pvt. Ltd.', bold: true, size: 32, color: '1E3A5F' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'Your Trusted Travel Partner', italics: true, size: 18, color: '64748B' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
  }));

  // Trip Title
  children.push(new Paragraph({
    children: [new TextRun({ text: itin.title, bold: true, size: 40, color: '111827' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  }));
  children.push(para(`Destination: ${itin.destination}   |   ${itin.days} Days / ${itin.days > 1 ? itin.days - 1 : 0} Nights`, { size: 22, color: '6B7280' }));
  if (itin.clientName) children.push(para(`Prepared for: ${itin.clientName}`, { bold: true, size: 24, color: '2563EB' }));
  if (itin.totalPrice) children.push(para(`Total Package Price: Rs.${itin.totalPrice}`, { bold: true, size: 28, color: '16A34A' }));
  children.push(new Paragraph({ children: [], spacing: { after: 200 } }));

  // Day Plans
  children.push(heading('Day-wise Itinerary'));
  for (const d of itin.dayPlans.slice(0, itin.days)) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `Day ${d.dayNumber}: ${d.title || ''}`, bold: true, size: 26, color: 'FFFFFF' })],
      shading: { type: ShadingType.SOLID, color: '2563EB', fill: '2563EB' },
      spacing: { before: 200, after: 60 },
    }));
    if (d.date) children.push(boldPara('Date', d.date));
    if (d.accommodation) children.push(boldPara('Stay', d.accommodation));
    if (d.transport) children.push(boldPara('Transport', d.transport));
    const meals = [];
    if (d.meals?.breakfast) meals.push('Breakfast');
    if (d.meals?.lunch) meals.push('Lunch');
    if (d.meals?.dinner) meals.push('Dinner');
    if (meals.length) children.push(boldPara('Meals Included', meals.join(', ')));
    if (d.activities?.length) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'Activities:', bold: true, size: 20 })], spacing: { before: 100, after: 60 } }));
      const rows = d.activities.map((act) => new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: act.time || '-', bold: true, color: '2563EB' })] })],
            width: { size: 12, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [
              new Paragraph({ children: [new TextRun({ text: act.activity || '', bold: true })] }),
              act.location ? new Paragraph({ children: [new TextRun({ text: act.location, size: 18, color: '6B7280' })] }) : new Paragraph({ children: [] }),
              act.notes ? new Paragraph({ children: [new TextRun({ text: act.notes, italics: true, size: 16, color: '9CA3AF' })] }) : new Paragraph({ children: [] }),
            ],
            width: { size: 70, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: act.duration || '', color: '9CA3AF' })] })],
            width: { size: 18, type: WidthType.PERCENTAGE },
          }),
        ],
      }));
      children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
    }
    children.push(new Paragraph({ children: [], spacing: { after: 160 } }));
  }

  // Inclusions / Exclusions
  children.push(heading('Inclusions'));
  itin.inclusions.forEach(item => children.push(para(`• ${item}`, { color: '16A34A' })));
  children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
  children.push(heading('Exclusions'));
  itin.exclusions.forEach(item => children.push(para(`• ${item}`, { color: 'DC2626' })));
  children.push(new Paragraph({ children: [], spacing: { after: 200 } }));

  // Footer
  const contactParts = [company?.companyName, company?.companyAddress, company?.companyPhone, company?.companyEmail].filter(Boolean);
  children.push(new Paragraph({
    children: [new TextRun({ text: contactParts.join('   |   '), size: 16, color: '64748B', italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 60 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'This itinerary is subject to change. Terms & conditions apply.', size: 14, color: '9CA3AF', italics: true })],
    alignment: AlignmentType.CENTER,
  }));

  return new Document({
    creator: company?.companyName || 'Pakka Tourism',
    title: itin.title,
    description: `Itinerary for ${itin.clientName || 'Client'}`,
    sections: [{ properties: {}, children }],
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MediaUploadButton — upload images OR videos with preview
//   acceptVideo  {boolean}  — if true, also accepts video files (default: false)
//   compact      {boolean}  — small inline mode vs large drop zone
// ══════════════════════════════════════════════════════════════════════════════
function MediaUploadButton({ value, onChange, label = 'Add Photo', compact = false, acceptVideo = false }) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef();

  // Determine if the current value is a video
  const isVideo = value && /\.(mp4|mov|webm|avi|mkv)/i.test(value);
  const accept  = acceptVideo ? 'image/*,video/mp4,video/quicktime,video/webm,video/avi' : 'image/*';

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const isVid = file.type.startsWith('video/');
      const form  = new FormData();

      if (isVid) {
        form.append('video', file);
        const res = await api.post('/itinerary/upload-video', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (res.data.success) onChange(res.data.url);
      } else {
        form.append('image', file);
        const res = await api.post('/itinerary/upload-image', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (res.data.success) onChange(res.data.url);
      }
    } catch (err) {
      alert('❌ Upload failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const fullUrl = value ? (value.startsWith('http') ? value : `${API_BASE}${value}`) : null;

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {fullUrl && (
          <img src={fullUrl} alt="preview" style={{ height: '36px', width: '54px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
        )}
        <button
          type="button"
          className="btn btn-secondary btn-xs"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          style={{ fontSize: '11px', padding: '4px 8px' }}
        >
          {uploading ? '⟳ Uploading…' : (fullUrl ? '🔄 Change' : '📷 ' + label)}
        </button>
        {fullUrl && (
          <button type="button" className="btn btn-ghost btn-xs" style={{ color: 'var(--color-danger)', fontSize: '11px' }} onClick={() => onChange('')}>✕</button>
        )}
        <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      </div>
    );
  }

  return (
    <div>
      {fullUrl ? (
        <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
          <img src={fullUrl} alt="preview" style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', gap: '8px', padding: '8px', justifyContent: 'center' }}>
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => ref.current?.click()} disabled={uploading} style={{ color: '#fff', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)' }}>
              {uploading ? '⟳' : '🔄 Change'}
            </button>
            <button type="button" className="btn btn-ghost btn-xs" style={{ color: '#f87171', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)' }} onClick={() => onChange('')}>✕ Remove</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          style={{
            width: '100%', height: '80px', borderRadius: '10px', border: '2px dashed var(--color-border)',
            background: 'var(--color-bg-secondary)', cursor: 'pointer', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '4px', color: 'var(--color-text-muted)',
            fontSize: '12px', transition: 'all 0.2s',
          }}
        >
          <span style={{ fontSize: '22px' }}>📸</span>
          <span>{uploading ? 'Uploading…' : label}</span>
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function ItineraryBuilder() {
  const [itin, setItin]           = useState(DEFAULT_ITINERARY);
  const [activeDay, setActiveDay] = useState(1);
  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [company, setCompany]     = useState(null);
  const { company: storeCompany, fetchCompany } = useCompanyStore();
  const previewRef = useRef(null);

  useEffect(() => {
    // Use cached company from global store if available, otherwise fetch
    if (storeCompany) {
      setCompany(storeCompany);
    } else {
      fetchCompany();
    }
  }, [storeCompany, fetchCompany]);

  // Sync company state when store updates
  useEffect(() => {
    if (storeCompany) setCompany(storeCompany);
  }, [storeCompany]);

  const day = itin.dayPlans.find(d => d.dayNumber === activeDay);

  const updateDay = (field, value) =>
    setItin(p => ({ ...p, dayPlans: p.dayPlans.map(d => d.dayNumber === activeDay ? { ...d, [field]: value } : d) }));

  const addActivity = () =>
    updateDay('activities', [...(day?.activities || []), { time: '', activity: '', location: '', duration: '', notes: '', imageUrl: '' }]);

  const safeName = itin.title.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_') || 'Itinerary';

  const exportPDF = async () => {
    setExporting(true); setExportFormat('pdf');
    try {
      const pdf = await buildPremiumPDF(itin, company);
      pdf.save(`${safeName}_Itinerary.pdf`);
    } catch (err) {
      console.error(err); alert('PDF export failed: ' + err.message);
    } finally { setExporting(false); setExportFormat(null); }
  };

  const exportDOCX = async () => {
    setExporting(true); setExportFormat('docx');
    try {
      const doc = await buildItineraryDOCX(itin, company);
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${safeName}_Itinerary.docx`);
    } catch (err) {
      console.error(err); alert('Word export failed: ' + err.message);
    } finally { setExporting(false); setExportFormat(null); }
  };

  const exportImage = async () => {
    setExporting(true); setExportFormat('image');
    const wasPreview = showPreview;
    setShowPreview(true);
    await new Promise(r => setTimeout(r, 600));
    try {
      const el = previewRef.current;
      if (!el) throw new Error('Preview not ready. Click Preview first.');
      const canvas = await html2canvas(el, {
        scale: 3, useCORS: true, backgroundColor: '#ffffff',
        logging: false, windowWidth: el.scrollWidth, windowHeight: el.scrollHeight,
      });
      canvas.toBlob(blob => saveAs(blob, `${safeName}_Itinerary.png`), 'image/png');
    } catch (err) {
      console.error(err); alert('Image export failed: ' + err.message);
    } finally {
      setExporting(false); setExportFormat(null);
      if (!wasPreview) setShowPreview(false);
    }
  };

  const handleExport = (fmt) => {
    setShowExportMenu(false);
    if (fmt === 'pdf') exportPDF();
    else if (fmt === 'docx') exportDOCX();
    else if (fmt === 'image') exportImage();
  };

  const handleWhatsAppShare = () => {
    const text = `*${itin.title}*\n📍 ${itin.destination}\n🕒 ${itin.days} Days / ${itin.days > 1 ? itin.days - 1 : 0} Nights\n${itin.totalPrice ? `💰 Price: ₹${itin.totalPrice}\n` : ''}\nHi ${itin.clientName || 'there'},\nHere is your customised itinerary from ${company?.companyName || 'Pakka Tourism'}. Let us know if you'd like any changes!`;
    window.open(`https://wa.me/${itin.clientPhone?.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
  };

  // Ensure dayPlans always has enough days
  useEffect(() => {
    setItin(p => {
      const existing = p.dayPlans;
      const newPlans = Array.from({ length: p.days }, (_, i) => {
        const n = i + 1;
        return existing.find(d => d.dayNumber === n) || {
          dayNumber: n, title: `Day ${n}`, date: '', accommodation: '',
          meals: { breakfast: true, lunch: true, dinner: true },
          activities: [], transport: '', imageUrl: '',
        };
      });
      return { ...p, dayPlans: newPlans };
    });
  }, [itin.days]);

  const fullCoverUrl = itin.coverImage ? (itin.coverImage.startsWith('http') ? itin.coverImage : `${API_BASE}${itin.coverImage}`) : null;

  return (
    <div className="page-content">
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">Itinerary Builder</h1>
          <p className="page-sub">Premium day-wise planner with cover image & PDF export</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowPreview(p => !p)}>
            {showPreview ? '✏️ Edit' : '👁 Preview'}
          </button>

          {/* ── Export Dropdown ── */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowExportMenu(p => !p)}
              disabled={exporting}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                color: '#fff', fontWeight: 700, fontSize: '13px',
                boxShadow: '0 2px 10px rgba(59,130,246,0.4)',
                transition: 'all 0.2s', opacity: exporting ? 0.7 : 1,
              }}
            >
              {exporting ? (
                <>{exportFormat === 'pdf' ? '📄' : exportFormat === 'docx' ? '📝' : '🖼️'}
                  &nbsp;{exportFormat === 'pdf' ? 'Building PDF…' : exportFormat === 'docx' ? 'Building Word…' : 'Capturing…'}
                </>
              ) : (
                <>⬇️ Export <span style={{ fontSize: '10px', opacity: 0.8 }}>▼</span></>
              )}
            </button>

            {showExportMenu && !exporting && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowExportMenu(false)} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)',
                  borderRadius: '16px', boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
                  zIndex: 999, minWidth: '240px', padding: '8px', overflow: 'hidden',
                }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 12px 4px' }}>Choose Format</div>
                  {[
                    { fmt: 'pdf',   icon: '📄', label: 'Export as PDF',           sub: 'Premium A4 with cover page',    color: '#2563EB', bg: '#EFF6FF' },
                    { fmt: 'docx',  icon: '📝', label: 'Export as Word (.docx)',   sub: 'Editable in Microsoft Word',    color: '#0078D4', bg: '#E9F5FF' },
                    { fmt: 'image', icon: '🖼️', label: 'Export as Image (.png)',   sub: 'High-res PNG, 3x quality',     color: '#7C3AED', bg: '#F5F3FF' },
                  ].map(opt => (
                    <button key={opt.fmt}
                      onClick={() => handleExport(opt.fmt)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '10px 12px', borderRadius: '12px', border: 'none',
                        background: 'transparent', cursor: 'pointer', textAlign: 'left',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-secondary)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ width: 38, height: 38, borderRadius: '10px', flexShrink: 0, background: opt.bg, display: 'grid', placeItems: 'center', fontSize: '20px' }}>
                        {opt.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{opt.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '1px' }}>{opt.sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button onClick={handleWhatsAppShare}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              background: '#25D366', color: '#fff', fontWeight: 700, fontSize: '13px',
              boxShadow: '0 2px 10px rgba(37,211,102,0.4)',
            }}>
            💬 WhatsApp
          </button>
        </div>
      </div>

      {/* Company logo status */}
      {company && (
        <div style={{ marginBottom: '14px', padding: '8px 12px', borderRadius: '10px', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
          {company.companyLogo
            ? <><img src={company.companyLogo.startsWith('http') ? company.companyLogo : `${API_BASE}${company.companyLogo}`} alt="logo" style={{ height: '26px', borderRadius: '4px', objectFit: 'contain' }} /><span style={{ color: '#16A34A', fontWeight: 600 }}>✅ Company logo loaded — will appear on PDF cover</span></>
            : <span style={{ color: '#F59E0B', fontWeight: 600 }}>⚠️ No company logo — upload one in Admin → Settings → Company Logo</span>
          }
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: '20px' }}>

        {/* ══ LEFT PANEL ══════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Cover Image */}
          <div className="card">
            <div className="card-title">📸 Cover Image</div>
            <MediaUploadButton
              value={itin.coverImage}
              onChange={v => setItin(p => ({ ...p, coverImage: v }))}
              label="Upload Cover Photo for PDF"
            />
          </div>

          {/* Trip Details */}
          <div className="card">
            <div className="card-title">Trip Details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="form-group"><label className="form-label">Package Title</label><input className="form-input" value={itin.title} onChange={e => setItin(p => ({ ...p, title: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Client Name</label><input className="form-input" placeholder="e.g. Ravi Kumar" value={itin.clientName || ''} onChange={e => setItin(p => ({ ...p, clientName: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Client Phone (WhatsApp)</label><input className="form-input" placeholder="+91 98765 43210" value={itin.clientPhone || ''} onChange={e => setItin(p => ({ ...p, clientPhone: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Total Price (₹)</label><input className="form-input" placeholder="e.g. 25,000" value={itin.totalPrice || ''} onChange={e => setItin(p => ({ ...p, totalPrice: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Destination</label><input className="form-input" value={itin.destination} onChange={e => setItin(p => ({ ...p, destination: e.target.value }))} /></div>
              <div className="form-group">
                <label className="form-label">Duration (Days)</label>
                <select className="form-select" value={itin.days} onChange={e => setItin(p => ({ ...p, days: parseInt(e.target.value) }))}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => <option key={d} value={d}>{d} Day{d > 1 ? 's' : ''}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Day Selector */}
          <div className="card">
            <div className="card-title">Day Selector</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {itin.dayPlans.map(d => (
                <button key={d.dayNumber} onClick={() => setActiveDay(d.dayNumber)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                    borderRadius: '10px', border: `1.5px solid ${activeDay === d.dayNumber ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: activeDay === d.dayNumber ? 'var(--color-accent-subtle)' : 'var(--color-bg-surface)',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s'
                  }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: activeDay === d.dayNumber ? 'var(--color-accent)' : 'var(--color-bg-secondary)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '12px', color: activeDay === d.dayNumber ? '#fff' : 'var(--color-text-primary)', flexShrink: 0 }}>
                    {d.dayNumber}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: activeDay === d.dayNumber ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>{d.title || `Day ${d.dayNumber}`}</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{d.activities?.length || 0} activities{d.imageUrl ? ' · 📷' : ''}</div>
                  </div>
                  {d.imageUrl && <img src={d.imageUrl.startsWith('http') ? d.imageUrl : `${API_BASE}${d.imageUrl}`} alt="" style={{ width: 28, height: 28, borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />}
                </button>
              ))}
            </div>
          </div>

          {/* Inclusions & Exclusions */}
          <div className="card">
            <div className="card-title">Inclusions & Exclusions</div>
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px', color: '#16A34A' }}>✅ Inclusions</div>
              {itin.inclusions.map((inc, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <input className="form-input" value={inc} onChange={e => { const n = [...itin.inclusions]; n[i] = e.target.value; setItin(p => ({ ...p, inclusions: n })); }} style={{ fontSize: '12px' }} />
                  <button className="btn btn-ghost btn-xs" style={{ color: 'var(--color-danger)' }} onClick={() => setItin(p => ({ ...p, inclusions: p.inclusions.filter((_, j) => j !== i) }))}>✕</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-xs" onClick={() => setItin(p => ({ ...p, inclusions: [...p.inclusions, ''] }))}>+ Add Inclusion</button>
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px', color: '#DC2626' }}>❌ Exclusions</div>
              {itin.exclusions.map((exc, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <input className="form-input" value={exc} onChange={e => { const n = [...itin.exclusions]; n[i] = e.target.value; setItin(p => ({ ...p, exclusions: n })); }} style={{ fontSize: '12px' }} />
                  <button className="btn btn-ghost btn-xs" style={{ color: 'var(--color-danger)' }} onClick={() => setItin(p => ({ ...p, exclusions: p.exclusions.filter((_, j) => j !== i) }))}>✕</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-xs" onClick={() => setItin(p => ({ ...p, exclusions: [...p.exclusions, ''] }))}>+ Add Exclusion</button>
            </div>
          </div>
        </div>

        {/* ══ RIGHT PANEL ═════════════════════════════════════════════════════ */}
        <div>
          {!showPreview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Day Header Card */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div className="card-title" style={{ marginBottom: 0 }}>📅 Day {activeDay}</div>
                  <input className="form-input" style={{ width: '200px' }} placeholder="Day title…" value={day?.title || ''} onChange={e => updateDay('title', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                  <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-input" value={day?.date || ''} onChange={e => updateDay('date', e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Accommodation</label><input className="form-input" value={day?.accommodation || ''} onChange={e => updateDay('accommodation', e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Transport</label><input className="form-input" value={day?.transport || ''} onChange={e => updateDay('transport', e.target.value)} /></div>
                  <div className="form-group">
                    <label className="form-label">Meals Included</label>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                      {['breakfast', 'lunch', 'dinner'].map(m => (
                        <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={day?.meals?.[m] || false} onChange={e => updateDay('meals', { ...day?.meals, [m]: e.target.checked })} />{m}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Day Image Upload */}
                <div className="form-group">
                  <label className="form-label">📷 Day Cover Photo (appears in PDF)</label>
                  <MediaUploadButton
                    value={day?.imageUrl || ''}
                    onChange={v => updateDay('imageUrl', v)}
                    label="Upload Day Photo"
                  />
                </div>
              </div>

              {/* Activities */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div className="card-title" style={{ marginBottom: 0 }}>Activities</div>
                  <button className="btn btn-primary btn-sm" onClick={addActivity}>+ Add Activity</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {(day?.activities || []).map((act, i) => (
                    <div key={i} style={{ padding: '14px', background: 'var(--color-bg-secondary)', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '20px' }}>{ACTIVITY_ICONS[i % ACTIVITY_ICONS.length]}</span>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Activity {i + 1}</span>
                        </div>
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--color-danger)' }} onClick={() => { const a = day.activities.filter((_, j) => j !== i); updateDay('activities', a); }}>✕ Remove</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                        <div className="form-group"><label className="form-label">Time</label><input className="form-input" placeholder="09:00" value={act.time} onChange={e => { const a = [...day.activities]; a[i] = { ...a[i], time: e.target.value }; updateDay('activities', a); }} /></div>
                        <div className="form-group"><label className="form-label">Activity *</label><input className="form-input" placeholder="Activity name" value={act.activity} onChange={e => { const a = [...day.activities]; a[i] = { ...a[i], activity: e.target.value }; updateDay('activities', a); }} /></div>
                        <div className="form-group"><label className="form-label">Duration</label><input className="form-input" placeholder="2h" value={act.duration} onChange={e => { const a = [...day.activities]; a[i] = { ...a[i], duration: e.target.value }; updateDay('activities', a); }} /></div>
                        <div className="form-group"><label className="form-label">Location</label><input className="form-input" placeholder="Location" value={act.location || ''} onChange={e => { const a = [...day.activities]; a[i] = { ...a[i], location: e.target.value }; updateDay('activities', a); }} /></div>
                        <div className="form-group" style={{ gridColumn: '1/-1' }}><label className="form-label">Notes / Remarks</label><input className="form-input" placeholder="Notes for the client" value={act.notes} onChange={e => { const a = [...day.activities]; a[i] = { ...a[i], notes: e.target.value }; updateDay('activities', a); }} /></div>
                      </div>
                      {/* Activity Image/Video Upload */}
                      <div className="form-group">
                        <label className="form-label">📷 Activity Photo / 🎥 Video</label>
                        <MediaUploadButton
                          compact
                          acceptVideo
                          value={act.imageUrl || ''}
                          onChange={v => { const a = [...day.activities]; a[i] = { ...a[i], imageUrl: v }; updateDay('activities', a); }}
                          label="Photo or Video"
                        />
                      </div>
                    </div>
                  ))}
                  {(!day?.activities || day.activities.length === 0) && (
                    <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                      No activities yet. Click "+ Add Activity" to get started.
                    </div>
                  )}
                </div>
              </div>
            </div>

          ) : (
            /* ── PREVIEW ── */
            <div ref={previewRef} className="card" style={{ background: '#fff', color: '#1F2937', padding: '0', overflow: 'hidden', borderRadius: '16px' }}>
              {/* Cover preview */}
              <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e3a8a)', padding: '32px 24px', position: 'relative', overflow: 'hidden', minHeight: '160px' }}>
                {fullCoverUrl && <img src={fullCoverUrl} alt="cover" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35 }} />}
                {/* Gold bar */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #fbbf24, #f59e0b)' }} />
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                  {company?.companyLogo && <img src={company.companyLogo.startsWith('http') ? company.companyLogo : `${API_BASE}${company.companyLogo}`} alt="logo" style={{ height: '44px', objectFit: 'contain', borderRadius: '8px' }} />}
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff' }}>{company?.companyName || 'Pakka Tourism'}</div>
                    <div style={{ fontSize: '10px', color: '#fbbf24', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your Trusted Travel Partner</div>
                  </div>
                </div>
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '6px' }}>{itin.title}</div>
                  <div style={{ color: '#fbbf24', fontSize: '13px' }}>📍 {itin.destination} · {itin.days} Days/{itin.days > 1 ? itin.days - 1 : 0} Nights</div>
                  {itin.clientName && <div style={{ color: '#bfdbfe', fontSize: '12px', marginTop: '6px' }}>Prepared for: <strong style={{ color: '#fff' }}>{itin.clientName}</strong></div>}
                  {itin.totalPrice && <div style={{ color: '#6ee7b7', fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>₹{itin.totalPrice}</div>}
                </div>
              </div>

              <div style={{ padding: '24px' }}>
                {/* Day Plans Preview */}
                {itin.dayPlans.slice(0, itin.days).map(d => (
                  <div key={d.dayNumber} style={{ marginBottom: '24px', border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)', color: '#fff', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>Day {d.dayNumber}: {d.title}</div>
                        <div style={{ fontSize: '11px', opacity: 0.8 }}>{d.date}</div>
                      </div>
                      <div style={{ fontSize: '11px', opacity: 0.9, textAlign: 'right' }}>
                        <div>🏨 {d.accommodation}</div>
                        <div>🚗 {d.transport}</div>
                      </div>
                    </div>
                    {d.imageUrl && <img src={d.imageUrl.startsWith('http') ? d.imageUrl : `${API_BASE}${d.imageUrl}`} alt="" style={{ width: '100%', height: '120px', objectFit: 'cover' }} />}
                    {d.meals && (
                      <div style={{ padding: '7px 14px', background: '#F0FDF4', borderBottom: '1px solid #E5E7EB', fontSize: '12px', color: '#16A34A', display: 'flex', gap: '10px' }}>
                        <strong>🍽️ Meals:</strong>
                        {d.meals.breakfast && <span>☕ Breakfast</span>}
                        {d.meals.lunch && <span>🥗 Lunch</span>}
                        {d.meals.dinner && <span>🍜 Dinner</span>}
                      </div>
                    )}
                    <div style={{ padding: '12px 16px' }}>
                      {(d.activities || []).map((act, i) => (
                        <div key={i} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: i < d.activities.length - 1 ? '1px solid #F3F4F6' : 'none', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '18px', flexShrink: 0 }}>{ACTIVITY_ICONS[i % ACTIVITY_ICONS.length]}</span>
                          <div style={{ minWidth: '44px', flexShrink: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#2563EB' }}>{act.time}</div>
                            <div style={{ fontSize: '10px', color: '#9CA3AF' }}>{act.duration}</div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>{act.activity}</div>
                            {act.location && <div style={{ fontSize: '10px', color: '#6B7280' }}>📍 {act.location}</div>}
                            {act.notes && <div style={{ fontSize: '10px', color: '#9CA3AF' }}>{act.notes}</div>}
                          </div>
                          {act.imageUrl && <img src={act.imageUrl.startsWith('http') ? act.imageUrl : `${API_BASE}${act.imageUrl}`} alt="" style={{ width: '48px', height: '36px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Inc / Exc Preview */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ background: '#F0FDF4', borderRadius: '10px', padding: '14px', border: '1px solid #86EFAC' }}>
                    <div style={{ fontWeight: 700, color: '#16A34A', marginBottom: '8px' }}>✅ Inclusions</div>
                    {itin.inclusions.map((item, i) => <div key={i} style={{ fontSize: '12px', color: '#374151', marginBottom: '4px' }}>• {item}</div>)}
                  </div>
                  <div style={{ background: '#FEF2F2', borderRadius: '10px', padding: '14px', border: '1px solid #FCA5A5' }}>
                    <div style={{ fontWeight: 700, color: '#DC2626', marginBottom: '8px' }}>❌ Exclusions</div>
                    {itin.exclusions.map((item, i) => <div key={i} style={{ fontSize: '12px', color: '#374151', marginBottom: '4px' }}>• {item}</div>)}
                  </div>
                </div>

                {/* Footer preview */}
                <div style={{ background: '#0f172a', borderRadius: '10px', padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ color: '#fbbf24', fontSize: '10px', letterSpacing: '0.06em', marginBottom: '4px' }}>— {company?.companyName || 'Pakka Tourism'} —</div>
                  <div style={{ color: '#94a3b8', fontSize: '10px' }}>{[company?.companyAddress, company?.companyPhone, company?.companyEmail].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
