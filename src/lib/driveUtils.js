/**
 * Utility functions for Google Drive, Google Docs, Sheets, Slides, and cloud documents
 */

export function extractDriveUrl(text) {
  if (!text || typeof text !== "string") return "";
  const match = text.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)*(?:drive\.google\.com|docs\.google\.com|forms\.gle)[^\s"')\]]+/i);
  return match ? match[0] : "";
}

export function cleanNoteBody(text, driveUrl) {
  if (!text) return "";
  if (!driveUrl) return text;
  // Strip out "Drive Link: <url>" or just "<url>" and clean up whitespace
  const escaped = driveUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cleaned = text
    .replace(new RegExp(`(?:Google\\s*)?Drive\\s*Link:\\s*${escaped}`, "gi"), "")
    .replace(new RegExp(escaped, "gi"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned;
}

export function isDriveUrl(url) {
  if (!url || typeof url !== "string") return false;
  return /drive\.google\.com|docs\.google\.com|forms\.gle/i.test(url.trim());
}

export function getDriveDocTypeLabel(url) {
  if (!url) return "Document";
  const lower = url.toLowerCase();
  if (lower.includes("docs.google.com/document")) return "Google Doc";
  if (lower.includes("docs.google.com/presentation")) return "Google Slides";
  if (lower.includes("docs.google.com/spreadsheets")) return "Google Sheets";
  if (lower.includes("docs.google.com/forms") || lower.includes("forms.gle")) return "Google Form";
  if (lower.includes("folders/")) return "Google Drive Folder";
  if (lower.includes(".pdf") || lower.includes("file/d/")) return "Google Drive Document";
  return "Google Drive Document";
}

