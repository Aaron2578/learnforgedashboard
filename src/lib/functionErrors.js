export async function getFunctionErrorMessage(error) {
  if (!error) return "";
  const context = error.context;
  if (typeof Response !== "undefined" && context instanceof Response) {
    try {
      const payload = await context.clone().json();
      if (typeof payload?.error === "string") return payload.error;
      if (typeof payload?.message === "string") return payload.message;
    } catch (parseError) {
      console.warn("Could not read the Edge Function error response.", parseError);
    }
  }
  return error.message || "The Edge Function request failed.";
}
