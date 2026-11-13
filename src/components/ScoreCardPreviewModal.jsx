import { useState } from "react";
import {
  Award,
  CheckCircle2,
  Clock3,
  Download,
  GraduationCap,
  Monitor,
  Camera,
  ShieldCheck,
  X,
  AlertTriangle,
  Printer,
} from "lucide-react";
import { buildSubmissionReasonLabel, formatSeconds } from "../lib/quizUtils.js";
import { buildReferenceCode, downloadScoreCardPdf } from "../lib/scoreCardPdf.js";

export default function ScoreCardPreviewModal({ summary, onClose, onToast }) {
  const [downloading, setDownloading] = useState(false);

  if (!summary) return null;

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

  const reviewItems = Array.isArray(summary.review) ? summary.review : [];
  const totalQ = reviewItems.length;
  const correctQ = reviewItems.filter((r) => r.isCorrect).length;
  const incorrectQ = reviewItems.filter((r) => !r.isCorrect && !r.isUnanswered).length;
  const unansweredQ = reviewItems.filter((r) => r.isUnanswered).length;

  const refCode = buildReferenceCode(summary);
  const formattedDate = summary.submittedAt
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(summary.submittedAt))
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date());

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadScoreCardPdf(summary);
      if (typeof onToast === "function") {
        onToast("LearnForge Score Card PDF downloaded successfully!");
      }
    } catch (err) {
      console.error("Score card download error:", err);
      if (typeof onToast === "function") {
        onToast("Error downloading Score Card: " + (err.message || "Unknown error"));
      }
    } finally {
      setDownloading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div
      className="modal-backdrop scorecard-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal scorecard-modal-content" role="dialog" aria-modal="true" style={{ maxWidth: "860px", width: "100%", padding: "0" }}>
        {/* Modal Top Control Bar */}
        <div className="scorecard-modal-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="scorecard-modal-badge-icon">
              <Award size={18} />
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", color: "var(--ink)" }}>Official Score Card &amp; Certificate</h3>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>
                Verified examination credentials and achievement record
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="button compact"
              onClick={handlePrint}
              title="Print Certificate"
              style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
            >
              <Printer size={13} /> Print
            </button>
            <button
              type="button"
              className="button primary compact"
              disabled={downloading}
              onClick={handleDownload}
              style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "#4f46e5" }}
            >
              <Download size={13} /> {downloading ? "Generating PDF…" : "Download PDF"}
            </button>
            <button
              type="button"
              className="quiet-icon"
              onClick={onClose}
              aria-label="Close Preview"
              style={{ marginLeft: "4px" }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Certificate Body Container */}
        <div className="scorecard-scroll-area" style={{ maxHeight: "calc(88vh - 120px)", overflowY: "auto", padding: "16px" }}>
          <div className="scorecard-paper">
            {/* Corner Decorative Brackets */}
            <div className="scorecard-corner top-left" />
            <div className="scorecard-corner top-right" />
            <div className="scorecard-corner bottom-left" />
            <div className="scorecard-corner bottom-right" />

            {/* Inner Border Frame */}
            <div className="scorecard-inner-frame">
              {/* Header Dark Band */}
              <div className="scorecard-header-band">
                <div className="scorecard-brand-box">
                  <div className="scorecard-logo-tile">
                    <GraduationCap size={20} />
                  </div>
                  <div>
                    <strong className="scorecard-brand-name">LEARNFORGE</strong>
                    <span className="scorecard-brand-sub">ACADEMIC ASSESSMENT &amp; PROCTORING ACADEMY</span>
                  </div>
                </div>

                <div className="scorecard-ref-box">
                  <span className="scorecard-title-pill">OFFICIAL CERTIFICATE &amp; SCORE CARD</span>
                  <div className="scorecard-ref-details">
                    <code>{refCode}</code> · <span>{formattedDate}</span>
                  </div>
                </div>
              </div>

              {/* Certificate Main Body */}
              <div className="scorecard-body">
                <div className="scorecard-recipient-section">
                  <span className="scorecard-certifies-text">THIS CERTIFIES THAT</span>
                  <h1 className="scorecard-candidate-name">{summary.studentName || "Student Candidate"}</h1>
                  {summary.studentEmail && (
                    <span className="scorecard-candidate-email">{summary.studentEmail}</span>
                  )}
                  <p className="scorecard-fulfillment-text">
                    has successfully undertaken and completed the proctored examination for
                  </p>
                  <h2 className="scorecard-exam-title">{summary.examTitle}</h2>
                  {summary.courseName && (
                    <div className="scorecard-course-pill">
                      <span>Course: <strong>{summary.courseName}</strong></span>
                    </div>
                  )}
                </div>

                {/* Score & Evaluation Two-Column Grid */}
                <div className="scorecard-eval-grid">
                  {/* Left Column: Official Gold Seal & Pass/Fail Status */}
                  <div className="scorecard-seal-col">
                    <div className={`scorecard-medallion ${passed ? "passed" : "attempted"}`}>
                      <div className="scorecard-medallion-inner">
                        <Award size={26} className="scorecard-medallion-icon" />
                        <span className="scorecard-medallion-heading">LEARNFORGE</span>
                        <strong className="scorecard-medallion-status">{passed ? "CERTIFIED" : "RECORDED"}</strong>
                        <small className="scorecard-medallion-sub">{passed ? "PASS VERIFIED" : "OFFICIAL SCORE"}</small>
                      </div>
                    </div>

                    <div className={`scorecard-status-banner ${passed ? "status-pass" : "status-fail"}`}>
                      {passed ? (
                        <>
                          <CheckCircle2 size={16} />
                          <span>EXAM PASSED (QUALIFIED)</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={16} />
                          <span>DID NOT PASS THRESHOLD</span>
                        </>
                      )}
                    </div>

                    <div className="scorecard-score-box">
                      <div className="scorecard-score-big">
                        <strong>{score}</strong>
                        <span>/ {maxScore} pts</span>
                      </div>
                      <div className="scorecard-percent-tag">
                        {percentage.toFixed(1)}% Score
                      </div>
                      <span className="scorecard-pass-req">Passing requirement: {passingPercentage}%</span>
                    </div>
                  </div>

                  {/* Right Column: Proctoring & Exam Metrics */}
                  <div className="scorecard-metrics-col">
                    <div className="scorecard-section-label">Proctoring &amp; Examination Log</div>
                    <div className="scorecard-metrics-table">
                      <div className="scorecard-metric-row">
                        <span className="scorecard-metric-name">
                          <Clock3 size={13} /> Time Taken:
                        </span>
                        <strong>{formatSeconds(summary.timeTakenSeconds || 0)}</strong>
                      </div>

                      <div className="scorecard-metric-row">
                        <span className="scorecard-metric-name">
                          <ShieldCheck size={13} /> Submission:
                        </span>
                        <strong>{buildSubmissionReasonLabel(summary.submissionReason)}</strong>
                      </div>

                      <div className="scorecard-metric-row">
                        <span className="scorecard-metric-name">
                          <Monitor size={13} /> Tab Switches:
                        </span>
                        <strong style={{ color: (summary.tabSwitchCount || 0) > 0 ? "#d97706" : "#16a34a" }}>
                          {summary.tabSwitchCount || 0} / {summary.maxTabSwitches || 3}{" "}
                          {(summary.tabSwitchCount || 0) === 0 ? "(Zero Violations)" : "(Detected)"}
                        </strong>
                      </div>

                      <div className="scorecard-metric-row">
                        <span className="scorecard-metric-name">
                          <Camera size={13} /> Webcam Feed:
                        </span>
                        <strong style={{ color: "#16a34a" }}>
                          {summary.cameraStatus || "Verified & Active"}
                        </strong>
                      </div>

                      {totalQ > 0 && (
                        <div className="scorecard-metric-row">
                          <span className="scorecard-metric-name">
                            <CheckCircle2 size={13} /> Performance:
                          </span>
                          <strong>
                            {correctQ} of {totalQ} correct ({Math.round((correctQ / totalQ) * 100)}% accuracy)
                          </strong>
                        </div>
                      )}
                    </div>

                    {totalQ > 0 && (
                      <div className="scorecard-breakdown-wrap">
                        <div className="scorecard-breakdown-labels">
                          <span style={{ color: "#16a34a" }}>● {correctQ} Correct</span>
                          {incorrectQ > 0 && <span style={{ color: "#e11d48" }}>● {incorrectQ} Incorrect</span>}
                          {unansweredQ > 0 && <span style={{ color: "#64748b" }}>● {unansweredQ} Skipped</span>}
                        </div>
                        <div className="scorecard-breakdown-bar">
                          <div style={{ width: `${(correctQ / totalQ) * 100}%`, background: "#16a34a" }} />
                          <div style={{ width: `${(incorrectQ / totalQ) * 100}%`, background: "#e11d48" }} />
                          <div style={{ width: `${(unansweredQ / totalQ) * 100}%`, background: "#cbd5e1" }} />
                        </div>
                      </div>
                    )}

                    <div className="scorecard-crypto-note">
                      <ShieldCheck size={13} style={{ flexShrink: 0, marginTop: "2px", color: "#4f46e5" }} />
                      <span>
                        Cryptographically logged under hash reference <code>{refCode}</code>. This electronic
                        score card is tamper-verified by the LearnForge evaluation engine.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Signature & Verification Block */}
                <div className="scorecard-footer">
                  <div className="scorecard-signature-block">
                    <div className="scorecard-signature-line" />
                    <strong>Academic Assessment Controller</strong>
                    <small>LearnForge Central Examination Council</small>
                  </div>

                  <div className="scorecard-stamp-block">
                    <span className="scorecard-stamp-badge">
                      <CheckCircle2 size={14} /> LEARNFORGE SECURE EXAM RECORD
                    </span>
                    <small>Official Single-Page Electronic Certificate</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer Actions */}
        <div className="scorecard-modal-footer">
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            Need an offline document? Save a certified PDF copy to your device.
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button type="button" className="button" onClick={onClose}>
              Close Preview
            </button>
            <button
              type="button"
              className="button primary"
              disabled={downloading}
              onClick={handleDownload}
              style={{ background: "#4f46e5", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <Download size={15} /> {downloading ? "Generating PDF…" : "Download Score Card (PDF)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
