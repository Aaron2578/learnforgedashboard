// Utility helpers for Attendance records & Holiday handling
// Provides full zero-error backward compatibility if the database constraint
// has not yet been migrated in Supabase.

export const HOLIDAY_TAG = "[HOLIDAY]";

/**
 * Checks whether an attendance record represents a Holiday.
 * Handles both native 'holiday' status and the fallback '[HOLIDAY]' note tag.
 */
export function isHolidayRecord(record) {
  if (!record) return false;
  const status = String(record.status || "").toLowerCase().trim();
  const note = String(record.note || "").trim();
  return (
    status === "holiday" ||
    note.startsWith(HOLIDAY_TAG) ||
    note.includes(HOLIDAY_TAG) ||
    note.toLowerCase() === "campus holiday" ||
    note.toLowerCase().startsWith("campus holiday")
  );
}

/**
 * Normalizes any attendance record status to one of:
 * 'present' | 'late' | 'absent' | 'holiday'
 */
export function normalizeAttendanceStatus(record) {
  if (!record) return "present";
  if (isHolidayRecord(record)) return "holiday";
  const st = String(record.status || "present").toLowerCase().trim();
  if (st === "late") return "late";
  if (st === "absent") return "absent";
  return "present";
}

/**
 * Cleans internal tags like [HOLIDAY] from the note body for display.
 */
export function cleanAttendanceNote(note) {
  if (!note) return "";
  return String(note).replace(/\[HOLIDAY\]\s*/gi, "").trim();
}

/**
 * Prepares an attendance record payload before database insertion/update.
 */
export function prepareAttendancePayload(rawRecord) {
  const rawStatus = String(rawRecord.status || "present").toLowerCase().trim();
  const isHoliday = rawStatus === "holiday" || isHolidayRecord(rawRecord);

  if (isHoliday) {
    const cleanNote = cleanAttendanceNote(rawRecord.note);
    return {
      ...rawRecord,
      status: "holiday",
      note: cleanNote ? `${HOLIDAY_TAG} ${cleanNote}` : `${HOLIDAY_TAG} Campus Holiday`,
    };
  }

  return {
    ...rawRecord,
    status: rawStatus === "late" ? "late" : rawStatus === "absent" ? "absent" : "present",
    note: cleanAttendanceNote(rawRecord.note),
  };
}

/**
 * Inserts one or multiple attendance records into Supabase.
 * If the database check constraint rejects 'holiday', transparently
 * falls back to status 'present' + note '[HOLIDAY] ...' with zero user friction.
 */
export async function insertAttendanceWithFallback(supabase, records) {
  const list = Array.isArray(records) ? records : [records];
  const prepared = list.map(prepareAttendancePayload);

  // Attempt direct insert with status 'holiday'
  const { error, data } = await supabase.from("attendance_records").insert(prepared);

  if (!error) {
    return { data, error: null, fallbackApplied: false };
  }

  // If check constraint failed on status (e.g. database only allows 'present','late','absent')
  const isConstraintViolation =
    error.message?.includes("attendance_records_status_check") ||
    error.code === "23514" ||
    error.details?.includes("attendance_records_status_check");

  if (isConstraintViolation) {
    // Graceful fallback: change 'holiday' to 'present' with [HOLIDAY] tag in note
    const fallbackRecords = prepared.map((rec) => {
      if (rec.status === "holiday") {
        const cleanNote = cleanAttendanceNote(rec.note);
        return {
          ...rec,
          status: "present",
          note: cleanNote ? `${HOLIDAY_TAG} ${cleanNote}` : `${HOLIDAY_TAG} Campus Holiday`,
        };
      }
      return rec;
    });

    const retryResult = await supabase.from("attendance_records").insert(fallbackRecords);
    if (retryResult.error) {
      throw retryResult.error;
    }
    return { data: retryResult.data, error: null, fallbackApplied: true };
  }

  throw error;
}

/**
 * Updates an attendance record in Supabase with automatic holiday fallback.
 */
export async function updateAttendanceWithFallback(supabase, recordId, rawPayload) {
  const prepared = prepareAttendancePayload(rawPayload);

  const { error, data } = await supabase
    .from("attendance_records")
    .update(prepared)
    .eq("id", recordId);

  if (!error) {
    return { data, error: null, fallbackApplied: false };
  }

  const isConstraintViolation =
    error.message?.includes("attendance_records_status_check") ||
    error.code === "23514" ||
    error.details?.includes("attendance_records_status_check");

  if (isConstraintViolation) {
    const fallbackPayload = {
      ...prepared,
      status: prepared.status === "holiday" ? "present" : prepared.status,
      note:
        prepared.status === "holiday"
          ? prepared.note && prepared.note.includes(HOLIDAY_TAG)
            ? prepared.note
            : `${HOLIDAY_TAG} ${prepared.note || "Campus Holiday"}`.trim()
          : prepared.note,
    };

    const retryResult = await supabase
      .from("attendance_records")
      .update(fallbackPayload)
      .eq("id", recordId);

    if (retryResult.error) throw retryResult.error;
    return { data: retryResult.data, error: null, fallbackApplied: true };
  }

  throw error;
}

