/** Fallback for HTTP hosts and environments that block navigator.clipboard. */
function copyTextWithExecCommand(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

/**
 * Copy text to the clipboard. Localhost allows the Clipboard API over HTTP;
 * most deployed sites need HTTPS for that API — otherwise we fall back to
 * execCommand so copy still works on plain HTTP.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof document === "undefined") return false;

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* Permissions-Policy or transient block — try fallback */
    }
  }

  return copyTextWithExecCommand(text);
}
