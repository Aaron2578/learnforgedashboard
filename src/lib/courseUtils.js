// Shared course classification utilities for IT vs SAP tracks and Code Lab access

const SAP_PATTERN = /\bSAP\b|FICO|\bMM\b|\bSD\b|ABAP|HANA|S\/4HANA/i;
const IT_PATTERN = /JAVA|PYTHON|REACT|WEB|SQL|CLOUD|NODE|FULL\s*STACK|DATA\s*ANALYTICS|POWER\s*BI|TABLEAU|MERN|TESTING|SELENIUM|JUNIT|C\+\+|\bC\s*(?:PROGRAMMING|LANG(?:UAGE)?)?\b|HTML|CSS|JAVASCRIPT|\bJS\b|SOFTWARE/i;

export function isSapCourse(course) {
  if (!course) return false;
  const dept = (course.department || "").trim().toUpperCase();
  const code = (course.code || "").trim().toUpperCase();
  const name = course.name || "";
  if (dept === "SAP" || code.startsWith("TMSAP")) return true;
  if (dept === "IT" || code.startsWith("TMIT")) return false;
  return SAP_PATTERN.test(name);
}

export function isItCourse(course) {
  if (!course) return false;
  if (isSapCourse(course)) return false;
  const dept = (course.department || "").trim().toUpperCase();
  const code = (course.code || "").trim().toUpperCase();
  const name = course.name || "";
  return dept === "IT" || code.startsWith("TMIT") || IT_PATTERN.test(name);
}

/**
 * Maps an enrolled IT course list to recommended default lab mode & highlighted tracks.
 */
export function getCourseLabRecommendations(itCourses = []) {
  const recommended = new Set();
  for (const course of itCourses) {
    const text = `${course.code || ""} ${course.name || ""} ${course.description || ""}`;
    if (/PYTHON/i.test(text)) {
      recommended.add("python");
      if (/FULL\s*STACK/i.test(text)) {
        recommended.add("web");
        recommended.add("sql");
      }
    }
    if (/DATA\s*ANALYTICS|PANDAS|NUMPY|DATA\s*SCIENCE/i.test(text)) {
      recommended.add("data-analytics");
      recommended.add("python");
      recommended.add("sql");
      recommended.add("bi-studio");
    }
    if (/POWER\s*BI|TABLEAU|VISUALIZATION|\bBI\b/i.test(text)) {
      recommended.add("bi-studio");
      recommended.add("sql");
      recommended.add("data-analytics");
    }
    if (/JAVA/i.test(text)) {
      recommended.add("java");
      if (/FULL\s*STACK/i.test(text)) {
        recommended.add("web");
        recommended.add("react");
        recommended.add("sql");
      }
    }
    if (/\bC\+\+|CPP/i.test(text)) {
      recommended.add("cpp");
      recommended.add("c");
    } else if (/\bC\b|C\s+PROGRAMMING/i.test(text)) {
      recommended.add("c");
    }
    if (/SQL|MYSQL|POSTGRES|DATABASE/i.test(text)) {
      recommended.add("sql");
    }
    if (/MERN|REACT|FULL\s*STACK\s*(?:WEB|JS)/i.test(text)) {
      recommended.add("react");
      recommended.add("web");
      recommended.add("javascript");
      recommended.add("sql");
    }
    if (/HTML|CSS|WEB|JAVASCRIPT|NODE/i.test(text)) {
      recommended.add("web");
      recommended.add("javascript");
    }
    if (/TEST|QA|JUNIT|PYTEST|SELENIUM/i.test(text)) {
      recommended.add("testing");
      recommended.add("javascript");
      recommended.add("python");
      recommended.add("java");
    }
  }
  return Array.from(recommended);
}
