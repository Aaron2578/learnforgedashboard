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

function buildReferenceCode(summary) {
  const raw = `${summary.attemptId || summary.submittedAt || Date.now()}-${summary.studentName || "LF"}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `LF-${hash.toString(36).toUpperCase().padStart(7, "0")}`;
}

function drawFooter(doc, pageNumber, totalPages, refCode) {
  const pageWidth = 210;
  const pageHeight = 297;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`LearnForge Academic Portal  |  Official Score Card  |  Ref: ${refCode}`, 14, pageHeight - 10);
  doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: "right" });
}

export async function downloadScoreCardPdf(summary) {
  if (!summary) return;

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const refCode = buildReferenceCode(summary);

  const score = Number(summary.score) || 0;
  const maxScore = Math.max(1, Number(summary.maxScore) || 100);
  const percentage =
    summary.percentage !== undefined && summary.percentage !== null
      ? Number(summary.percentage)
      : Math.round((score / maxScore) * 10000) / 100;
  const passingPercentage = Number(summary.passingPercentage) || 50;
  const passed =
    summary.passed !== undefined && summary.passed !== null
      ? Boolean(summary.passed)
      : percentage >= passingPercentage;
  const showMarks = summary.showMarks !== false;

  // Outer Institutional Frame
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.rect(7, 7, pageWidth - 14, pageHeight - 14);
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(0.25);
  doc.rect(9.5, 9.5, pageWidth - 19, pageHeight - 19);

  // Header Banner (Navy + Indigo + Gold Accent)
  doc.setFillColor(15, 23, 42);
  doc.rect(10, 10, pageWidth - 20, 32, "F");
  doc.setFillColor(79, 70, 229);
  doc.rect(10, 40.5, pageWidth - 20, 2, "F");
  doc.setFillColor(245, 158, 11);
  doc.rect(10, 42.5, 48, 1, "F");

  // LearnForge Emblem Circle + LF Monogram
  doc.setFillColor(79, 70, 229);
  doc.circle(23, 26, 7.5, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.circle(23, 26, 6.2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text("LF", 23, 27.6, { align: "center" });

  // Brand Title & Subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text("LEARNFORGE", 34, 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text("Academic Assessment & Proctoring Portal", 34, 30);

  // Right Banner Badge
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(pageWidth - 68, 16.5, 54, 17, 2.5, 2.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(248, 250, 252);
  doc.text("OFFICIAL SCORE CARD", pageWidth - 41, 23.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(165, 180, 252);
  doc.text(`Ref: ${refCode}`, pageWidth - 41, 29.5, { align: "center" });

  let y = 52;

  // Candidate & Assessment Info Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.35);
  doc.roundedRect(margin, y, contentWidth, 34, 2.5, 2.5, "FD");

  const leftColX = margin + 5;
  const rightColX = margin + contentWidth / 2 + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("STUDENT NAME", leftColX, y + 6.5);
  doc.text("ASSESSMENT TITLE", rightColX, y + 6.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(sanitizePdfText(summary.studentName || "Student"), leftColX, y + 12, {
    maxWidth: contentWidth / 2 - 8,
  });
  const titleLines = doc.splitTextToSize(sanitizePdfText(summary.examTitle || "Assessment"), contentWidth / 2 - 8);
  doc.text(titleLines.slice(0, 2), rightColX, y + 12);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(summary.studentEmail ? "STUDENT EMAIL" : "COURSE / PROGRAM", leftColX, y + 21.5);
  doc.text("SUBMITTED ON", rightColX, y + 21.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    sanitizePdfText(summary.studentEmail || summary.courseName || "LearnForge Assessment Program"),
    leftColX,
    y + 27,
    { maxWidth: contentWidth / 2 - 8 }
  );
  const submittedLabel = summary.submittedAt
    ? new Date(summary.submittedAt).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  doc.text(sanitizePdfText(submittedLabel), rightColX, y + 27);

  y += 41;

  // Score KPI Cards (4 Tiles)
  const cardGap = 3.5;
  const cardWidth = (contentWidth - cardGap * 3) / 4;
  const cardHeight = 25;

  const kpis = [
    {
      label: "MARKS OBTAINED",
      value: showMarks ? `${score} / ${maxScore}` : "Pending",
      sub:
        showMarks && Array.isArray(summary.review) && summary.review.length > 0
          ? `${summary.review.filter((r) => r.isCorrect).length} of ${summary.review.length} correct`
          : "Official Score",
      bg: [248, 250, 252],
      border: [226, 232, 240],
      valColor: [15, 23, 42],
    },
    {
      label: "PERCENTAGE",
      value: showMarks ? `${percentage}%` : "-",
      sub: `Pass Mark: ${passingPercentage}%`,
      bg: [238, 242, 255],
      border: [199, 210, 254],
      valColor: [67, 56, 202],
    },
    {
      label: "RESULT STATUS",
      value: !showMarks ? "SUBMITTED" : passed ? "PASSED" : "FAILED",
      sub: !showMarks ? "Awaiting release" : passed ? "Criteria Met" : "Below Pass Mark",
      bg: !showMarks ? [248, 250, 252] : passed ? [236, 253, 245] : [255, 241, 242],
      border: !showMarks ? [226, 232, 240] : passed ? [167, 243, 208] : [254, 205, 211],
      valColor: !showMarks ? [51, 65, 85] : passed ? [6, 95, 70] : [159, 18, 57],
    },
    {
      label: "TIME TAKEN",
      value: summary.timeTakenSeconds > 0 ? formatSeconds(summary.timeTakenSeconds) : "Recorded",
      sub: summary.isExternal ? "External Test" : "Proctored Session",
      bg: [248, 250, 252],
      border: [226, 232, 240],
      valColor: [15, 23, 42],
    },
  ];

  kpis.forEach((kpi, idx) => {
    const cx = margin + idx * (cardWidth + cardGap);
    doc.setFillColor(...kpi.bg);
    doc.setDrawColor(...kpi.border);
    doc.setLineWidth(0.35);
    doc.roundedRect(cx, y, cardWidth, cardHeight, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, cx + 3.5, y + 6);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...kpi.valColor);
    doc.text(sanitizePdfText(kpi.value), cx + 3.5, y + 14.5, { maxWidth: cardWidth - 7 });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(sanitizePdfText(kpi.sub), cx + 3.5, y + 21, { maxWidth: cardWidth - 7 });
  });

  y += cardHeight + 7;

  // Percentage Bar
  if (showMarks) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text("OVERALL PERFORMANCE PROGRESS", margin, y);
    doc.text(`${percentage}%`, pageWidth - margin, y, { align: "right" });

    y += 2.5;
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 4.5, 1.5, 1.5, "F");

    const clampedPct = Math.max(0, Math.min(100, percentage));
    if (clampedPct > 0) {
      if (passed) doc.setFillColor(16, 185, 129);
      else doc.setFillColor(244, 63, 94);
      doc.roundedRect(margin, y, Math.max(3, (contentWidth * clampedPct) / 100), 4.5, 1.5, 1.5, "F");
    }
    y += 10;
  }

  // Proctoring & Session Summary Section
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 21, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(79, 70, 229);
  doc.text("ASSESSMENT INTEGRITY & PROCTORING RECORD", margin + 4, y + 5.8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const switchSummary = summary.isExternal
    ? "External Assessment"
    : summary.trackTabSwitches !== false
    ? `${summary.tabSwitchCount ?? 0} / ${summary.maxTabSwitches ?? 3}`
    : "Tracking Disabled";

  doc.text(`Submission Mode: ${sanitizePdfText(buildSubmissionReasonLabel(summary.submissionReason))}`, margin + 4, y + 12);
  doc.text(`Screen / Tab Switches: ${sanitizePdfText(switchSummary)}`, margin + 4, y + 17.2);
  doc.text(
    `Camera Status: ${sanitizePdfText(summary.cameraStatus || (summary.isExternal ? "N/A" : "Not Required"))}`,
    margin + contentWidth / 2 + 4,
    y + 12
  );
  doc.text("Attempt Policy: Single Attempt Verified (1/1)", margin + contentWidth / 2 + 4, y + 17.2);

  y += 28;

  // Detailed Question-by-Question Score Breakdown (if available)
  const reviewItems = showMarks && Array.isArray(summary.review) ? summary.review : [];
  if (reviewItems.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Question-by-Question Answer Summary (${reviewItems.length} Questions)`, margin, y);
    y += 4.5;

    const colQ = margin;
    const colPrompt = margin + 10;
    const colAns = margin + 96;
    const colCorrect = margin + 134;
    const colStatus = margin + 170;

    const drawTableHeader = (headerY) => {
      doc.setFillColor(15, 23, 42);
      doc.rect(margin, headerY, contentWidth, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text("#", colQ + 2, headerY + 4.7);
      doc.text("QUESTION", colPrompt, headerY + 4.7);
      doc.text("YOUR ANSWER", colAns, headerY + 4.7);
      doc.text("CORRECT ANSWER", colCorrect, headerY + 4.7);
      doc.text("SCORE", colStatus, headerY + 4.7);
      return headerY + 7;
    };

    y = drawTableHeader(y);

    reviewItems.forEach((item, index) => {
      const qLines = doc.splitTextToSize(sanitizePdfText(item.question), 83);
      const selLines = doc.splitTextToSize(sanitizePdfText(item.selectedAnswer || "Unanswered"), 35);
      const corLines = doc.splitTextToSize(sanitizePdfText(item.correctAnswer || "-"), 33);
      const lineCount = Math.max(qLines.length, selLines.length, corLines.length, 1);
      const rowHeight = Math.max(7, lineCount * 3.8 + 3);

      if (y + rowHeight > pageHeight - 28) {
        doc.addPage();
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);
        doc.rect(7, 7, pageWidth - 14, pageHeight - 14);
        y = 18;
        y = drawTableHeader(y);
      }

      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, rowHeight, "F");
      }
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`${index + 1}`, colQ + 2, y + 4.5);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      doc.text(qLines, colPrompt, y + 4.5);

      doc.setTextColor(item.isCorrect ? 6 : item.isUnanswered ? 146 : 159, item.isCorrect ? 95 : item.isUnanswered ? 64 : 18, item.isCorrect ? 70 : item.isUnanswered ? 14 : 57);
      doc.text(selLines, colAns, y + 4.5);

      doc.setTextColor(6, 95, 70);
      doc.text(corLines, colCorrect, y + 4.5);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(item.isCorrect ? 6 : 159, item.isCorrect ? 95 : 18, item.isCorrect ? 70 : 57);
      doc.text(`${item.pointsEarned}/${item.points}`, colStatus, y + 4.5);

      y += rowHeight;
    });

    y += 8;
  }

  // Verification Stamp & Authorized LearnForge Sign-Off
  if (y + 26 > pageHeight - 20) {
    doc.addPage();
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.rect(7, 7, pageWidth - 14, pageHeight - 14);
    y = 24;
  }

  const sealY = Math.max(y + 4, pageHeight - 44);
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(0.5);
  doc.circle(margin + 13, sealY + 9, 10, "S");
  doc.setLineWidth(0.25);
  doc.circle(margin + 13, sealY + 9, 8.2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.setTextColor(79, 70, 229);
  doc.text("LEARNFORGE", margin + 13, sealY + 7.5, { align: "center" });
  doc.text("VERIFIED", margin + 13, sealY + 11.2, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("Issued by LearnForge Academy", margin + 28, sealY + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "This computer-generated Score Card officially certifies the assessment result recorded in LearnForge.",
    margin + 28,
    sealY + 12,
    { maxWidth: 96 }
  );

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.35);
  doc.line(pageWidth - margin - 46, sealY + 10, pageWidth - margin, sealY + 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("LearnForge Examination Cell", pageWidth - margin - 23, sealY + 14.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Issued ${new Date().toLocaleDateString("en-IN", { dateStyle: "medium" })}`, pageWidth - margin - 23, sealY + 18.5, {
    align: "center",
  });

  // Add Footers to Every Page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages, refCode);
  }

  const slug = safeSlug(`${summary.examTitle}-${summary.studentName || "student"}`);
  doc.save(`learnforge-scorecard-${slug}.pdf`);
}
