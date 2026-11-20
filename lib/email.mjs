// Outbound email through Resend (https://resend.com).
//   RESEND_API_KEY  re_... key from the Resend dashboard
//   EMAIL_FROM      a sender on a domain verified in Resend, e.g. "College Reboot <signin@example.org>"
// With no key, nothing is sent and callers fall back (an invite link the lead can copy).

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail({ to, subject, html, text }) {
  if (/\.invalid$/i.test(String(to))) return { sent: false, reason: "undeliverable_address" };
  if (!emailConfigured()) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html, text }),
    });
    if (!res.ok) return { sent: false, reason: `resend_${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: "network" };
  }
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function signInEmail({ link, collegeName, inviterName }) {
  const intro = collegeName
    ? `${inviterName ? esc(inviterName) + " invited you" : "You've been invited"} to the ${esc(collegeName)} workspace in the College Reboot Workbook.`
    : "Here's your link to sign in to the College Reboot Workbook.";
  const textIntro = intro.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return {
    subject: collegeName ? `You're invited to ${collegeName} in the College Reboot Workbook` : "Your College Reboot sign-in link",
    html: `<p>${intro}</p><p><a href="${esc(link)}">Sign in</a></p><p>The link works once. If you didn't expect this, you can ignore it.</p>`,
    text: `${textIntro}\n\nSign in: ${link}\n\nThe link works once. If you didn't expect this, you can ignore it.`,
  };
}
