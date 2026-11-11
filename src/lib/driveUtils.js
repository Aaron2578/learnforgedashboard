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

export function getDriveDownloadExportUrl(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();

  // Google Doc -> PDF
  const docMatch = trimmed.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/i);
  if (docMatch) return `https://docs.google.com/document/d/${docMatch[1]}/export?format=pdf`;

  // Google Spreadsheets -> PDF
  const sheetMatch = trimmed.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
  if (sheetMatch) return `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/export?format=pdf`;

  // Google Presentation -> PDF
  const presMatch = trimmed.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/i);
  if (presMatch) return `https://docs.google.com/presentation/d/${presMatch[1]}/export/pdf`;

  // Google Drive File ID -> direct download
  const fileMatch = trimmed.match(/drive\.google\.com\/file\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/i);
  if (fileMatch) return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;

  return trimmed;
}

export async function resolveStorageSignedUrl(supabase, filePath, fallbackUrl = "") {
  const finalUrl = fallbackUrl || "";
  if (!filePath) return finalUrl;

  if (filePath.startsWith("data:") || filePath.startsWith("http")) {
    return filePath;
  }

  let bucket = "course-materials";
  let cleanPath = filePath;
  if (filePath.startsWith("course-materials:")) {
    cleanPath = filePath.replace("course-materials:", "");
  } else if (filePath.startsWith("assignment-files:")) {
    bucket = "assignment-files";
    cleanPath = filePath.replace("assignment-files:", "");
  }

  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(cleanPath, 3600);
    if (!error && data?.signedUrl) return data.signedUrl;

    const otherBucket = bucket === "course-materials" ? "assignment-files" : "course-materials";
    const { data: fallbackData } = await supabase.storage.from(otherBucket).createSignedUrl(cleanPath, 3600);
    if (fallbackData?.signedUrl) return fallbackData.signedUrl;
  } catch (err) {
    console.warn("Could not resolve signed storage URL:", err?.message || err);
  }

  return finalUrl;
}

const MAX_QUESTION_FILE_SIZE = 20 * 1024 * 1024;

export async function uploadDocumentAttachment(supabase, file, prefix = "assignment_questions") {
  if (!file) return null;
  if (file.size > MAX_QUESTION_FILE_SIZE) {
    throw new Error("Question attachment must be 20 MB or smaller.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `${prefix}/${Date.now()}_${safeName}`;

  const { error: primaryErr } = await supabase.storage
    .from("course-materials")
    .upload(objectPath, file);

  if (!primaryErr) {
    return {
      filePath: `course-materials:${objectPath}`,
      fileName: file.name,
      fileType: file.type || "",
    };
  }

  // Fallback to assignment-files bucket if course-materials rejects
  const { error: fallbackErr } = await supabase.storage
    .from("assignment-files")
    .upload(objectPath, file);

  if (fallbackErr) {
    throw new Error(primaryErr.message || fallbackErr.message || "File upload failed.");
  }

  return {
    filePath: `assignment-files:${objectPath}`,
    fileName: file.name,
    fileType: file.type || "",
  };
}

export async function triggerDocumentDownload(supabase, filePath, fileName = "", fallbackUrl = "") {
  const url = await resolveStorageSignedUrl(supabase, filePath, fallbackUrl);
  if (!url) throw new Error("No download link could be generated for this file.");

  if (/supabase\.co\/storage\/v1\/object\//i.test(url)) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = fileName || "document";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
        return;
      }
    } catch {}
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

