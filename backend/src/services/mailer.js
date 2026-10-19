const nodemailer = require("nodemailer");

/* Sends NEKAI's emails (password reset links).
 * With SMTP_HOST set, mail goes through that server (any SMTP service, or a local
 * catcher such as Mailpit). Without it, the message is printed to the server log
 * instead, so password resets still work on a laptop with no mail set up. */

let transport;

function getTransport() {
  if (transport !== undefined) return transport;
  const host = process.env.SMTP_HOST;
  transport = host
    ? nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true", // true for port 465
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" }
          : undefined,
      })
    : null;
  return transport;
}

async function sendMail({ to, subject, text }) {
  const t = getTransport();
  if (!t) {
    console.log(`\n--- email (SMTP_HOST not set, so it's printed here) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n---\n`);
    return;
  }
  await t.sendMail({ from: process.env.MAIL_FROM || "NEKAI <no-reply@nekai.local>", to, subject, text });
}

module.exports = { sendMail };
