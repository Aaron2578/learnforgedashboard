import { buildSubmissionReasonLabel, formatSeconds } from "./quizUtils.js";

function sanitizePdfText(value) {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "*")
    .replace(/\u2713/g, "PASS")
    .replace(/\u2717/g, "FAIL")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeSlug(value = "score-card") {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "score-card"
  );
}

export function buildReferenceCode(summary) {
  const raw = `${summary.attemptId || summary.submittedAt || Date.now()}-${summary.studentName || "LF"}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `LF-CERT-${hash.toString(36).toUpperCase().padStart(7, "0")}`;
}

/**
 * Draws the exact LearnForge logo mark from public/favicon.svg
 * (rounded indigo square + white graduation cap + tassel) in crisp vector coordinates.
 */
function drawLearnForgeLogo(doc, x, y, size = 14) {
  const s = size / 32; // favicon.svg uses a 32x32 viewBox

  // Rounded indigo square background (#4f46e5)
  doc.setFillColor(79, 70, 229);
  doc.roundedRect(x, y, size, size, 8 * s, 8 * s, "F");

  // Subtle gold inner border highlight
  doc.setDrawColor(165, 180, 252);
  doc.setLineWidth(0.25);
  doc.roundedRect(x + 0.5, y + 0.5, size - 1, size - 1, 7.2 * s, 7.2 * s, "S");

  // Graduation cap diamond: M16 6 L6 11 L16 16 L26 11 Z
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.35);
  doc.triangle(
    x + 16 * s,
    y + 6 * s,
    x + 6 * s,
    y + 11 * s,
    x + 16 * s,
    y + 16 * s,
    "FD"
  );
  doc.triangle(
    x + 16 * s,
    y + 6 * s,
    x + 26 * s,
    y + 11 * s,
    x + 16 * s,
    y + 16 * s,
    "FD"
  );

  // Cap lower band / crown: U-shaped stroke from (10,13.5) -> (10,20.5) -> curve -> (22,20.5) -> (22,13.5)
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(1.5 * s);
  doc.line(x + 10 * s, y + 13.5 * s, x + 10 * s, y + 20.5 * s);
  doc.line(x + 22 * s, y + 13.5 * s, x + 22 * s, y + 20.5 * s);
  doc.lines(
    [[0, 0, 2.5 * s, 4 * s, 6 * s, 4 * s], [3.5 * s, 0, 6 * s, -2 * s, 6 * s, -4 * s]],
    x + 10 * s,
    y + 20.5 * s
  );

  // Side tassel (M26 11 V19)
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(1.4 * s);
  doc.line(x + 26 * s, y + 11 * s, x + 26 * s, y + 19.2 * s);
  doc.setFillColor(245, 158, 11);
  doc.circle(x + 26 * s, y + 19.8 * s, 1.3 * s, "F");
}

function drawGoldCertificateSeal(doc, cx, cy, passed) {
  const outerR = 13.5;
  const points = 24;

  // Starburst outer gold/amber rosette
  doc.setFillColor(passed ? 245 : 148, passed ? 158 : 163, passed ? 11 : 184);
  for (let i = 0; i < points; i++) {
    const a1 = (i * 2 * Math.PI) / points;
    const a2 = ((i + 0.5) * 2 * Math.PI) / points;
    const a3 = ((i + 1) * 2 * Math.PI) / points;
    doc.triangle(
      cx + Math.cos(a1) * (outerR - 1.6),
      cy + Math.sin(a1) * (outerR - 1.6),
      cx + Math.cos(a2) * (outerR + 1.2),
      cy + Math.sin(a2) * (outerR + 1.2),
      cx + Math.cos(a3) * (outerR - 1.6),
      cy + Math.sin(a3) * (outerR - 1.6),
      "F"
    );
  }

  // Navy & Indigo Inner Medallion
  doc.setFillColor(15, 23, 42);
  doc.circle(cx, cy, outerR - 2.3, "F");
  doc.setDrawColor(251, 191, 36);
  doc.setLineWidth(0.45);
  doc.circle(cx, cy, outerR - 3.3, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.setTextColor(251, 191, 36);
  doc.text("LEARNFORGE", cx, cy - 2.6, { align: "center" });

  doc.setFontSize(7.2);
  doc.setTextColor(255, 255, 255);
  doc.text(passed ? "CERTIFIED" : "RECORDED", cx, cy + 1.4, { align: "center" });

  doc.setFontSize(5.2);
  doc.setTextColor(203, 213, 225);
  doc.text(passed ? "PASS VERIFIED" : "OFFICIAL SCORE", cx, cy + 5, { align: "center" });
}

export async function downloadScoreCardPdf(summary) {
  if (!summary) return;

  const { jsPDF } = await import("jspdf");

  // Single-page Landscape A4 Certificate & Official Score Card (297mm x 210mm)
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297;
  const H = 210;
  const M = 14;
  const innerW = W - M * 2;
  const refCode = buildReferenceCode(summary);

  const score = Number(summary.score) || 0;
  const maxScore = Math.max(1, Number(summary.maxScore) || 100);
  const percentage =
    summary.percentage !== undefined && summary.percentage !== null
      ? Number(summary.percentage)
      : Math.round((score / maxScore) * 10000) / 100;
  const passingPercentage = Math.max(1, Math.min(100, Number(summary.passingPercentage) || 50));
  const passed =
    summary.passed !== undefined && summary.passed !== null
      ? Boolean(summary.passed)
      : percentage >= passingPercentage;
  const showMarks = summary.showMarks !== false;

  const reviewItems = Array.isArray(summary.review) ? summary.review : [];
  const totalQ = reviewItems.length;
  const correctQ = reviewItems.filter((r) => r.isCorrect).length;
  const incorrectQ = reviewItems.filter((r) => !r.isCorrect && !r.isUnanswered).length;
  const unansweredQ = reviewItems.filter((r) => r.isUnanswered).length;

  // Background paper tint
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, "F");

  // Ornate Double Certificate Borders (Navy + Indigo + Gold Accent)
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1.2);
  doc.rect(6, 6, W - 12, H - 12);

  doc.setDrawColor(217, 119, 6); // Warm gold inner rule
  doc.setLineWidth(0.5);
  doc.rect(8.5, 8.5, W - 17, H - 17);

  doc.setDrawColor(79, 70, 229); // Subtle indigo hairline
  doc.setLineWidth(0.25);
  doc.rect(10.5, 10.5, W - 21, H - 21);

  // Ornamental gold corner brackets
  const corners = [
    [10.5, 10.5, 1, 1],
    [W - 10.5, 10.5, -1, 1],
    [10.5, H - 10.5, 1, -1],
    [W - 10.5, H - 10.5, -1, -1],
  ];
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(1.1);
  corners.forEach(([cx, cy, dx, dy]) => {
    doc.line(cx, cy, cx + 10 * dx, cy);
    doc.line(cx, cy, cx, cy + 10 * dy);
  });

  // Top Header Band
  doc.setFillColor(15, 23, 42);
  doc.rect(10.5, 10.5, W - 21, 29, "F");
  doc.setFillColor(79, 70, 229);
  doc.rect(10.5, 38.2, W - 21, 1.8, "F");
  doc.setFillColor(245, 158, 11);
  doc.rect(10.5, 40, W - 21, 0.8, "F");

  // LearnForge Logo Mark (exact match to favicon.svg) + Brand Name
  drawLearnForgeLogo(doc, 17, 17, 15.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17.5);
  doc.setTextColor(255, 255, 255);
  doc.text("LEARNFORGE", 36.5, 24);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(199, 210, 254);
  doc.text("ACADEMIC ASSESSMENT & PROCTORING ACADEMY", 36.5, 29.8);

  // Right Header Certificate Badge
  doc.setFillColor(30, 41, 59);
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(0.35);
  doc.roundedRect(W - 88, 15.5, 71, 18.5, 2.5, 2.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(251, 191, 36);
  doc.text(passed && showMarks ? "CERTIFICATE OF PASS" : "OFFICIAL SCORE CARD", W - 52.5, 22.8, {
    align: "center",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(226, 232, 240);
  doc.text(`Certificate ID: ${refCode}`, W - 52.5, 29.2, { align: "center" });

  // Center Certificate Citation Block
  let y = 51;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(79, 70, 229);
  doc.text(
    passed && showMarks
      ? "CERTIFICATE OF ACHIEVEMENT & OFFICIAL SCORE CARD"
      : "OFFICIAL ASSESSMENT SCORE REPORT",
    W / 2,
    y,
    { align: "center" }
  );

  y += 6.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text("This is proudly presented to", W / 2, y, { align: "center" });

  y += 10.5;
  doc.setFont("times", "bold");
  doc.setFontSize(25);
  doc.setTextColor(15, 23, 42);
  const displayName = sanitizePdfText(summary.studentName || "Student");
  doc.text(displayName, W / 2, y, { align: "center", maxWidth: innerW - 30 });

  // Gold accent underline beneath candidate name
  const nameWidth = Math.min(130, Math.max(68, doc.getTextWidth(displayName) + 18));
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(0.6);
  doc.line(W / 2 - nameWidth / 2, y + 2.5, W / 2 + nameWidth / 2, y + 2.5);

  y += 8.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  const verbPhrase = !showMarks
    ? "for completing the online assessment"
    : passed
    ? "for successfully qualifying and passing the assessment"
    : "for completing the proctored online assessment";
  doc.text(verbPhrase, W / 2, y, { align: "center" });

  y += 7.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14.5);
  doc.setTextColor(67, 56, 202);
  doc.text(sanitizePdfText(summary.examTitle || "Assessment"), W / 2, y, {
    align: "center",
    maxWidth: innerW - 24,
  });

  y += 5.5;
  const subMetaParts = [];
  if (summary.courseName) subMetaParts.push(`Course: ${sanitizePdfText(summary.courseName)}`);
  if (summary.studentEmail) subMetaParts.push(`Email: ${sanitizePdfText(summary.studentEmail)}`);
  const submittedLabel = summary.submittedAt
    ? new Date(summary.submittedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  subMetaParts.push(`Date: ${sanitizePdfText(submittedLabel)}`);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(subMetaParts.join("   |   "), W / 2, y, { align: "center", maxWidth: innerW - 16 });

  // Score Card KPI Panel (4 side-by-side luxury cards)
  y += 7;
  const cardGap = 4.5;
  const cardW = (innerW - cardGap * 3) / 4;
  const cardH = 26;

  const accuracyLine =
    totalQ > 0
      ? `${correctQ}/${totalQ} Correct (${incorrectQ} Wrong${unansweredQ ? `, ${unansweredQ} Skipped` : ""})`
      : summary.isExternal
      ? "Official Recorded Grade"
      : "Single Attempt Scored";

  const kpis = [
    {
      label: "SCORE OBTAINED",
      value: showMarks ? `${score} / ${maxScore}` : "Recorded",
      sub: accuracyLine,
      bg: [248, 250, 252],
      border: [203, 213, 225],
      color: [15, 23, 42],
    },
    {
      label: "PERCENTAGE",
      value: showMarks ? `${percentage}%` : "-",
      sub: `Passing Threshold: ${passingPercentage}%`,
      bg: [238, 242, 255],
      border: [165, 180, 252],
      color: [67, 56, 202],
    },
    {
      label: "FINAL RESULT",
      value: !showMarks ? "SUBMITTED" : passed ? "PASSED" : "NOT PASSED",
      sub: !showMarks
        ? "Pending Evaluation"
        : passed
        ? "Qualified - Certificate Awarded"
        : `Minimum ${passingPercentage}% Required`,
      bg: !showMarks ? [248, 250, 252] : passed ? [236, 253, 245] : [255, 241, 242],
      border: !showMarks ? [203, 213, 225] : passed ? [16, 185, 129] : [244, 63, 94],
      color: !showMarks ? [51, 65, 85] : passed ? [6, 95, 70] : [159, 18, 57],
    },
    {
      label: "TIME TAKEN",
      value: summary.timeTakenSeconds > 0 ? formatSeconds(summary.timeTakenSeconds) : "Verified",
      sub: summary.isExternal ? "External Assessment" : "Attempt: 1 of 1 Allowed",
      bg: [248, 250, 252],
      border: [203, 213, 225],
      color: [15, 23, 42],
    },
  ];

  kpis.forEach((kpi, idx) => {
    const cx = M + idx * (cardW + cardGap);
    doc.setFillColor(...kpi.bg);
    doc.setDrawColor(...kpi.border);
    doc.setLineWidth(0.45);
    doc.roundedRect(cx, y, cardW, cardH, 2.5, 2.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, cx + cardW / 2, y + 6, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13.5);
    doc.setTextColor(...kpi.color);
    doc.text(sanitizePdfText(kpi.value), cx + cardW / 2, y + 14.8, {
      align: "center",
      maxWidth: cardW - 6,
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(sanitizePdfText(kpi.sub), cx + cardW / 2, y + 21.8, {
      align: "center",
      maxWidth: cardW - 6,
    });
  });

  // Compact Score Progress Bar + Proctoring Verification Strip
  y += cardH + 5.5;
  if (showMarks) {
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(M, y, innerW, 3.6, 1.5, 1.5, "F");
    const clamped = Math.max(0, Math.min(100, percentage));
    if (clamped > 0) {
      if (passed) doc.setFillColor(16, 185, 129);
      else doc.setFillColor(244, 63, 94);
      doc.roundedRect(M, y, Math.max(4, (innerW * clamped) / 100), 3.6, 1.5, 1.5, "F");
    }
    // Pass threshold tick mark on progress bar
    const passX = M + (innerW * passingPercentage) / 100;
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.5);
    doc.line(passX, y - 0.8, passX, y + 4.4);
    y += 7;
  }

  // Integrity & Proctoring Verification Bar
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.35);
  doc.roundedRect(M, y, innerW, 11.5, 2, 2, "FD");

  const switchText = summary.isExternal
    ? "External Assessment Mode"
    : summary.trackTabSwitches !== false
    ? `${summary.tabSwitchCount ?? 0} / ${summary.maxTabSwitches ?? 3}`
    : "Disabled";
  const camText = summary.isExternal ? "N/A" : summary.cameraStatus || "Not Required";
  const reasonText = buildSubmissionReasonLabel(summary.submissionReason);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(79, 70, 229);
  doc.text("VERIFIED SESSION:", M + 4, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    sanitizePdfText(
      `Submission: ${reasonText}   |   Tab Switches: ${switchText}   |   Camera: ${camText}   |   Attempt: Single Verified Submission`
    ),
    M + 35,
    y + 7,
    { maxWidth: innerW - 40 }
  );

  // Bottom Certificate Signatures & Official LearnForge Gold Seal
  const footerLineY = H - 22;

  // Left Signature Block
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);
  doc.line(M + 6, footerLineY, M + 74, footerLineY);
  doc.setFont("times", "italic");
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text("LearnForge Academic Board", M + 40, footerLineY - 2.5, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("Academic Program Director", M + 40, footerLineY + 4.2, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("LearnForge Academy", M + 40, footerLineY + 8, { align: "center" });

  // Center Gold Certified Seal
  drawGoldCertificateSeal(doc, W / 2, H - 26, passed || !showMarks);

  // Right Signature / Issue Details Block
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);
  doc.line(W - M - 74, footerLineY, W - M - 6, footerLineY);
  doc.setFont("times", "italic");
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text("Examination Controller", W - M - 40, footerLineY - 2.5, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("Authorized Assessment Cell", W - M - 40, footerLineY + 4.2, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Issued: ${new Date().toLocaleDateString("en-IN", { dateStyle: "medium" })}  |  ${refCode}`,
    W - M - 40,
    footerLineY + 8,
    { align: "center" }
  );

  const slug = safeSlug(`${summary.examTitle}-${summary.studentName || "student"}`);
  doc.save(`learnforge-scorecard-${slug}.pdf`);
}
