import React, { useState, useEffect } from "react";
import {
  X,
  Shield,
  Download,
  Lock,
  Unlock,
  Clock,
  Eye,
  AlertCircle,
  ExternalLink,
  FileText,
  CheckCircle2,
} from "lucide-react";

/**
 * Transforms various Google Drive / Docs / Forms URLs into clean embeddable preview URLs
 */
export function getEmbedUrl(rawUrl) {
  if (!rawUrl) return "";
  const url = rawUrl.trim();

  // Direct Data URLs (Base64 PDF / document)
  if (url.startsWith("data:")) {
    return url;
  }

  // Google Drive Folder embed
  const driveFolder = url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/i);
  if (driveFolder) {
    return `https://drive.google.com/embeddedfolderview?id=${driveFolder[1]}#grid`;
  }

  // Google Drive File preview
  const driveFile = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (driveFile) {
    return `https://drive.google.com/file/d/${driveFile[1]}/preview`;
  }

  // Google Drive open?id=
  const driveId = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i);
  if (driveId) {
    return `https://drive.google.com/file/d/${driveId[1]}/preview`;
  }

  // Google Drive uc?id=
  const driveUc = url.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/i);
  if (driveUc) {
    return `https://drive.google.com/file/d/${driveUc[1]}/preview`;
  }

  // Google Docs
  const doc = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/i);
  if (doc) {
    return `https://docs.google.com/document/d/${doc[1]}/preview`;
  }

  // Google Sheets
  const sheet = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
  if (sheet) {
    return `https://docs.google.com/spreadsheets/d/${sheet[1]}/preview`;
  }

  // Google Slides
  const slide = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/i);
  if (slide) {
    return `https://docs.google.com/presentation/d/${slide[1]}/preview`;
  }

  // Google Forms (Quizzes / Tests)
  const form = url.match(/docs\.google\.com\/forms\/d\/(e\/[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+)\/(viewform|edit)?/i);
  if (form) {
    return `https://docs.google.com/forms/d/${form[1]}/viewform?embedded=true`;
  }

  // PDF direct URLs: add toolbar=0 to hide browser download / print controls
  if (url.toLowerCase().endsWith(".pdf") || url.includes("/course-materials/") || url.includes("/assignment-files/")) {
    const separator = url.includes("#") ? "&" : "#";
    return `${url}${separator}toolbar=0&navpanes=0&scrollbar=0`;
  }

  return url;
}

export default function SecureDocumentViewer({
  title,
  subtitle,
  url,
  directDownloadUrl,
  userEmail,
  isSuperuser = false,
  isTrainer = false,
  downloadStatus = null, // 'pending' | 'approved' | 'rejected' | 'revoked' | null
  onRequestDownload,
  onDownload,
  onMarkCompleted,
  onClose,
}) {
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [requestReason, setRequestReason] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Convert Base64 data: URLs to safe Blob URLs so Chrome & Edge never block them in iframes or window.open
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    if (url && url.startsWith("data:")) {
      try {
        const parts = url.split(",");
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : "application/pdf";
        const byteString = atob(parts[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mime });
        const createdBlobUrl = URL.createObjectURL(blob);
        setBlobUrl(createdBlobUrl);
        return () => {
          URL.revokeObjectURL(createdBlobUrl);
        };
      } catch (err) {
        console.warn("Could not convert data URL to Blob URL:", err);
      }
    } else {
      setBlobUrl(null);
    }
  }, [url]);

  const activeUrl = blobUrl || url;
  const embedUrl = getEmbedUrl(activeUrl);
  const isGoogleSource = /drive\.google\.com|docs\.google\.com|forms\.gle/i.test(url || "");
  const canDownload = isSuperuser || isTrainer || downloadStatus === "approved";

  function handleOpenInNewTab() {
    const target = blobUrl || directDownloadUrl || url || embedUrl;
    if (target) {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  }

  async function handleSendRequest(e) {
    e.preventDefault();
    if (!onRequestDownload) return;
    setSubmittingRequest(true);
    try {
      await onRequestDownload(requestReason);
      setShowRequestDialog(false);
      setRequestReason("");
    } finally {
      setSubmittingRequest(false);
    }
  }

  return (
    <div
      className="secure-viewer-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Secure document viewer: ${title}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="secure-viewer-container">
        {/* Top Action Bar */}
        <header className="secure-viewer-header">
          <div className="secure-viewer-header-info">
            <span className="secure-shield-badge" title="Protected viewing active">
              <Shield size={16} />
              <span>Protected View</span>
            </span>
            <div>
              <h2 className="secure-viewer-title">{title || "Document Viewer"}</h2>
              {subtitle && <p className="secure-viewer-subtitle">{subtitle}</p>}
            </div>
          </div>

          <div className="secure-viewer-actions">
            {/* Download Status & Buttons */}
            {canDownload ? (
              <button
                className="button primary secure-download-btn"
                type="button"
                onClick={onDownload}
                title="Download verified and approved by admin"
              >
                <Download size={14} />
                <span>{isSuperuser ? "Admin Download" : "Download File"}</span>
              </button>
            ) : downloadStatus === "pending" ? (
              <span className="secure-status-pill pending" title="Your request has been sent to the administrator">
                <Clock size={13} />
                <span>Download Pending Approval</span>
              </span>
            ) : downloadStatus === "revoked" ? (
              <div className="secure-status-group">
                <span className="secure-status-pill revoked" title="Administrator revoked download permission">
                  <Lock size={13} />
                  <span>Access Revoked</span>
                </span>
                {onRequestDownload && (
                  <button
                    className="button secure-request-btn"
                    type="button"
                    onClick={() => setShowRequestDialog(true)}
                  >
                    Request Again
                  </button>
                )}
              </div>
            ) : (
              <div className="secure-status-group">
                <span className="secure-status-pill view-only" title="Students can only view this document">
                  <Eye size={13} />
                  <span>View Only (Download Locked)</span>
                </span>
                {onRequestDownload && (
                  <button
                    className="button secure-request-btn"
                    type="button"
                    onClick={() => setShowRequestDialog(true)}
                  >
                    <Lock size={13} />
                    <span>Request to Download</span>
                  </button>
                )}
              </div>
            )}

            {/* Optional Mark as Submitted for Assessments */}
            {onMarkCompleted && (
              <button
                className="button primary compact"
                type="button"
                onClick={onMarkCompleted}
                title="Mark this external exam as submitted and send to admin"
                style={{ minHeight: "34px", padding: "0 12px", fontSize: "12px", gap: "6px" }}
              >
                <CheckCircle2 size={14} />
                <span>Mark as Submitted</span>
              </button>
            )}

            {/* Direct Open in New Tab Button for all viewers if browser restricts iframe preview */}
            <button
              className="button compact"
              type="button"
              onClick={handleOpenInNewTab}
              title="Open document directly in a new browser tab"
              style={{ minHeight: "34px", padding: "0 10px", fontSize: "12px", gap: "6px" }}
            >
              <ExternalLink size={13} />
              <span>Open in New Tab</span>
            </button>

            {/* Close Modal Button */}
            <button
              className="quiet-icon secure-close-btn"
              type="button"
              onClick={onClose}
              aria-label="Close document viewer"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Viewer Notice Banner */}
        <aside className="secure-viewer-notice">
          <Shield size={14} />
          <span>
            <strong>Protected Institutional Material:</strong> You may view and study this document inside the dashboard.
          </span>
          <span style={{ marginLeft: "auto", fontSize: "11.5px", color: "var(--muted)" }}>
            Tip: Click <strong>Open in New Tab</strong> if your device or browser restricts embedded previews.
          </span>
          {downloadStatus === "approved" && (
            <span className="secure-approved-tag">
              <CheckCircle2 size={13} /> Approved by Admin
            </span>
          )}
        </aside>

        {/* Viewer Viewport with Watermark Overlay */}
        <div className="secure-viewer-viewport">
          {/* Subtle anti-leak watermark overlay with student email */}
          {userEmail && (
            <div className="secure-watermark-overlay" aria-hidden="true">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div key={idx} className="watermark-row">
                  <span>LEARNFORGE · {userEmail}</span>
                  <span>CONFIDENTIAL &amp; VIEW-ONLY</span>
                  <span>LEARNFORGE · {userEmail}</span>
                </div>
              ))}
            </div>
          )}

          {/* Embedded Content - standard un-sandboxed iframe enables Google Drive & Docs preview */}
          {embedUrl ? (
            <>
              <iframe
                src={embedUrl}
                title={title}
                className="secure-viewer-frame"
                allow="autoplay; encrypted-media; fullscreen"
                loading="eager"
              />
              <div
                className="secure-viewer-bottom-bar"
                style={{
                  padding: "8px 16px",
                  background: "#f8fafc",
                  borderTop: "1px solid var(--line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  color: "var(--muted)",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <span>Having trouble reading the document in this frame?</span>
                <button
                  type="button"
                  className="text-link"
                  style={{
                    fontSize: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontWeight: 600,
                    color: "var(--blue)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                  onClick={handleOpenInNewTab}
                >
                  <ExternalLink size={13} /> Open full document in new tab
                </button>
              </div>
            </>
          ) : (
            <div className="secure-viewer-empty">
              <AlertCircle size={28} />
              <strong>No preview URL available</strong>
              <p>This file or link could not be loaded directly.</p>
              <button
                className="button primary compact"
                type="button"
                onClick={handleOpenInNewTab}
                style={{ marginTop: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <ExternalLink size={13} /> Try opening in new tab
              </button>
            </div>
          )}
        </div>

        {/* Optional Request to Download Dialog */}
        {showRequestDialog && (
          <div className="secure-request-dialog-backdrop">
            <div className="card secure-request-dialog">
              <div className="panel-heading">
                <div>
                  <h3>Request Download Permission</h3>
                  <p>Send a request to the administrator to unlock offline downloading for this file.</p>
                </div>
                <button
                  className="quiet-icon"
                  type="button"
                  onClick={() => setShowRequestDialog(false)}
                  aria-label="Close dialog"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSendRequest}>
                <div className="secure-request-details">
                  <strong>File:</strong> <span>{title}</span>
                </div>

                <label className="form-field">
                  <span>Reason for download (optional)</span>
                  <textarea
                    rows={3}
                    maxLength={300}
                    placeholder="e.g. Offline study on bus commute, print for notes..."
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                  />
                </label>

                <div className="form-actions">
                  <button
                    className="button"
                    type="button"
                    onClick={() => setShowRequestDialog(false)}
                    disabled={submittingRequest}
                  >
                    Cancel
                  </button>
                  <button
                    className="button primary"
                    type="submit"
                    disabled={submittingRequest}
                  >
                    {submittingRequest ? "Submitting..." : "Send Request to Admin"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

