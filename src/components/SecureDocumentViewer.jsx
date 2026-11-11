import React, { useState, useEffect } from "react";
import {
  X,
  Shield,
  Download,
  Lock,
  Clock,
  Eye,
  AlertCircle,
  ExternalLink,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { getDriveDownloadExportUrl } from "../lib/driveUtils.js";

function getFileExtension(text = "") {
  const clean = text.split(/[?#]/)[0].trim().toLowerCase();
  const match = clean.match(/\.([a-z0-9]{1,8})$/);
  return match ? match[1] : "";
}

function isNonInlineOfficeOrArchive(nameOrUrl = "", mimeType = "") {
  const ext = getFileExtension(nameOrUrl);
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip", "rar", "7z", "tar"].includes(ext)) {
    return true;
  }
  return /msword|wordprocessingml|spreadsheetml|presentationml|application\/zip|x-zip/i.test(mimeType || "");
}

function isImageFile(nameOrUrl = "", mimeType = "") {
  const ext = getFileExtension(nameOrUrl);
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return true;
  return /^image\//i.test(mimeType || "");
}

function isPdfFile(nameOrUrl = "", mimeType = "") {
  const ext = getFileExtension(nameOrUrl);
  if (ext === "pdf") return true;
  return /application\/pdf/i.test(mimeType || "");
}

/**
 * Transforms various Google Drive / Docs / Forms & PDF URLs into clean embeddable preview URLs
 */
export function getEmbedUrl(rawUrl, forcePdfToolbarHint = false) {
  if (!rawUrl) return "";
  const url = rawUrl.trim();

  // Data URLs or Blob URLs
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    if (forcePdfToolbarHint && url.startsWith("blob:") && !url.includes("#")) {
      return `${url}#toolbar=0&navpanes=0&scrollbar=0`;
    }
    return url;
  }

  // Google Drive Folder embed (handles /u/0/ or /a/domain/)
  const driveFolder = url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/i);
  if (driveFolder) {
    return `https://drive.google.com/embeddedfolderview?id=${driveFolder[1]}#grid`;
  }

  // Google Drive File preview (handles /file/d/ and /file/u/0/d/)
  const driveFile = url.match(/drive\.google\.com\/file\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/i);
  if (driveFile) {
    return `https://drive.google.com/file/d/${driveFile[1]}/preview`;
  }

  // Google Drive open?id= or uc?id= (anywhere in query string)
  const driveQuery = url.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i);
  if (driveQuery) {
    return `https://drive.google.com/file/d/${driveQuery[1]}/preview`;
  }

  // Google Docs (handles optional /a/domain/ and /u/0/)
  const doc = url.match(/docs\.google\.com\/(?:a\/[^/]+\/)?document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/i);
  if (doc) {
    return `https://docs.google.com/document/d/${doc[1]}/preview`;
  }

  // Google Sheets
  const sheet = url.match(/docs\.google\.com\/(?:a\/[^/]+\/)?spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/i);
  if (sheet) {
    return `https://docs.google.com/spreadsheets/d/${sheet[1]}/preview`;
  }

  // Google Slides
  const slide = url.match(/docs\.google\.com\/(?:a\/[^/]+\/)?presentation\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/i);
  if (slide) {
    return `https://docs.google.com/presentation/d/${slide[1]}/preview`;
  }

  // Google Forms (Quizzes / Tests)
  const form = url.match(/docs\.google\.com\/(?:a\/[^/]+\/)?forms\/(?:u\/\d+\/)?d\/(e\/[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+)/i);
  if (form) {
    return `https://docs.google.com/forms/d/${form[1]}/viewform?embedded=true`;
  }

  // PDF direct URLs: add toolbar=0 to hide browser download / print controls
  if (forcePdfToolbarHint || /\.pdf(?:$|[?#])/i.test(url)) {
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
  fileName = "",
  fileType = "",
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

  // Convert Base64 data: URLs and Supabase Storage signed URLs into safe same-origin Blob URLs
  // so Chrome/Edge never block framing due to storage CSP/X-Frame headers.
  const [blobUrl, setBlobUrl] = useState(null);
  const [resolvedMime, setResolvedMime] = useState(fileType || "");
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl = null;
    const controller = new AbortController();

    async function preparePreview() {
      setBlobUrl(null);
      setResolvedMime(fileType || "");

      if (!url) return;

      // Case 1: Inline base64 data URL -> convert to Blob URL
      if (url.startsWith("data:")) {
        try {
          const parts = url.split(",");
          const mimeMatch = parts[0].match(/:(.*?);/);
          const mime = mimeMatch ? mimeMatch[1] : (fileType || "application/pdf");
          const byteString = atob(parts[1]);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i += 1) {
            ia[i] = byteString.charCodeAt(i);
          }
          const blob = new Blob([ab], { type: mime });
          createdUrl = URL.createObjectURL(blob);
          if (active) {
            setResolvedMime(mime);
            setBlobUrl(createdUrl);
          }
        } catch (err) {
          console.warn("Could not convert data URL to Blob URL:", err);
        }
        return;
      }

      // Case 2: Supabase Storage URL -> fetch into same-origin typed Blob URL
      if (/supabase\.co\/storage\/v1\/object\//i.test(url)) {
        if (isNonInlineOfficeOrArchive(fileName || url, fileType)) {
          return;
        }
        setLoadingPreview(true);
        try {
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const rawBlob = await res.blob();
          const serverType = res.headers.get("content-type") || rawBlob.type || fileType || "";
          const isPdf = isPdfFile(fileName || url, serverType);
          const effectiveMime = isPdf ? "application/pdf" : (serverType.split(";")[0] || "application/octet-stream");

          if (isNonInlineOfficeOrArchive(fileName || url, effectiveMime)) {
            if (active) setResolvedMime(effectiveMime);
            return;
          }

          const typedBlob = rawBlob.type === effectiveMime ? rawBlob : new Blob([rawBlob], { type: effectiveMime });
          createdUrl = URL.createObjectURL(typedBlob);
          if (active) {
            setResolvedMime(effectiveMime);
            setBlobUrl(createdUrl);
          }
        } catch (err) {
          if (err?.name !== "AbortError") {
            console.warn("Falling back to direct storage preview URL:", err?.message || err);
          }
        } finally {
          if (active) setLoadingPreview(false);
        }
      }
    }

    preparePreview();

    return () => {
      active = false;
      controller.abort();
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [url, fileName, fileType]);

  const effectiveHintName = fileName || url || "";
  const isOfficeDoc = isNonInlineOfficeOrArchive(effectiveHintName, resolvedMime);
  const isImage = !isOfficeDoc && isImageFile(effectiveHintName, resolvedMime);
  const isPdf = isPdfFile(effectiveHintName, resolvedMime);

  const activeUrl = blobUrl || url;
  const embedUrl = isOfficeDoc ? "" : getEmbedUrl(activeUrl, isPdf);
  const canDownload = isSuperuser || isTrainer || downloadStatus === "approved";

  function handleOpenInNewTab() {
    const target = blobUrl || directDownloadUrl || embedUrl || url;
    if (target) {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  }

  function handleDownloadAction() {
    if (onDownload) {
      onDownload();
      return;
    }
    const target = blobUrl || directDownloadUrl || (url ? getDriveDownloadExportUrl(url) : "");
    if (!target) return;
    const link = document.createElement("a");
    link.href = target;
    if (fileName) {
      link.download = fileName;
    } else if (blobUrl && title) {
      const cleanTitle = title.replace(/[^a-zA-Z0-9._-]+/g, "_");
      link.download = isPdf && !cleanTitle.toLowerCase().endsWith(".pdf") ? `${cleanTitle}.pdf` : cleanTitle;
    }
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
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
                onClick={handleDownloadAction}
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

            {/* Direct Open in New Tab Button */}
            {!isOfficeDoc && (
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
            )}

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
          {/* Subtle anti-leak watermark overlay */}
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

          {loadingPreview ? (
            <div className="secure-viewer-empty" style={{ flex: 1 }}>
              <span className="compiler-spinner" style={{ width: "26px", height: "26px" }} />
              <strong>Loading protected document…</strong>
              <p>Preparing secure in-dashboard preview.</p>
            </div>
          ) : isOfficeDoc ? (
            <div className="secure-viewer-empty" style={{ flex: 1 }}>
              <FileText size={32} />
              <strong>{fileName || title || "Document File"}</strong>
              <p style={{ maxWidth: "460px" }}>
                Word, Excel, PowerPoint, and archive files cannot be rendered natively inside a browser frame.
              </p>
              <div style={{ display: "flex", gap: "10px", marginTop: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                {canDownload ? (
                  <button className="button primary" type="button" onClick={handleDownloadAction}>
                    <Download size={14} /> Download File to View
                  </button>
                ) : onRequestDownload ? (
                  <button className="button primary" type="button" onClick={() => setShowRequestDialog(true)}>
                    <Lock size={14} /> Request Download Access
                  </button>
                ) : (
                  <button className="button primary" type="button" onClick={handleOpenInNewTab}>
                    <ExternalLink size={14} /> Open File
                  </button>
                )}
              </div>
            </div>
          ) : isImage && activeUrl ? (
            <div style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", overflow: "auto", background: "#0f172a" }}>
              <img
                src={activeUrl}
                alt={title || "Document preview"}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "8px" }}
              />
            </div>
          ) : embedUrl ? (
            <>
              <iframe
                src={embedUrl}
                title={title || "Document Preview"}
                className="secure-viewer-frame"
                allow="autoplay; encrypted-media; fullscreen"
                loading="eager"
              />
              <div
                className="secure-viewer-bottom-bar"
                style={{
                  width: "100%",
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
                  flexShrink: 0,
                  zIndex: 12,
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
            <div className="secure-viewer-empty" style={{ flex: 1 }}>
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
