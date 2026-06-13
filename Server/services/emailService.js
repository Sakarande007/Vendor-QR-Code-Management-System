import nodemailer from "nodemailer";
import { logger } from "../utils/logger.js";
import { emailQueue } from "./emailQueue.js";

const isConfigured =
  Boolean(process.env.SMTP_HOST) &&
  Boolean(process.env.SMTP_USER) &&
  Boolean(process.env.SMTP_PASS);

/** @type {import('nodemailer').Transporter|null} */
let transporter = null;

/**
 * Lazy SMTP transporter — avoids connection when email is disabled in dev.
 * @returns {import('nodemailer').Transporter|null}
 */
function getTransporter() {
  if (!isConfigured) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return transporter;
}

/**
 * @param {object} options
 * @param {string} options.to
 * @param {string} options.subject
 * @param {string} options.text
 * @param {string} [options.html]
 */
async function sendMail({ to, subject, text, html }) {
  const transport = getTransporter();

  if (!transport) {
    logger.warn("Email not sent — SMTP not configured", {
      to: to.replace(/(.{2}).*(@.*)/, "$1***$2"),
      subject,
    });
    return;
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
}

/**
 * Sends vendor portal welcome email with login credentials.
 * @param {string} to
 * @param {string} vendorName
 * @param {string} username
 * @param {string} tempPassword
 * @param {string} portalUrl
 */
export async function sendWelcomeEmail(
  to,
  vendorName,
  username,
  tempPassword,
  portalUrl
) {
  const loginUrl = portalUrl || process.env.CLIENT_URL || "http://localhost:5173";

  await sendMail({
    to,
    subject: "Your Vendor Portal Access Credentials",
    text: [
      `Dear ${vendorName},`,
      "",
      "Your vendor portal account has been created.",
      "",
      `Username: ${username}`,
      `Temporary password: ${tempPassword}`,
      "",
      `Portal URL: ${loginUrl}`,
      "",
      "You must change your password on first login.",
      "",
      "If you did not expect this email, contact your administrator.",
    ].join("\n"),
    html: `<p>Dear ${vendorName},</p>
      <p>Your vendor portal account has been created.</p>
      <p><strong>Username:</strong> ${username}</p>
      <p><strong>Temporary password:</strong> ${tempPassword}</p>
      <p><strong>Portal URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
      <p>Please change your password on first login.</p>`,
  });
}

/**
 * Sends password reset OTP email.
 * @param {string} to
 * @param {string} otp
 */
export async function sendPasswordResetEmail(to, otp) {
  await sendMail({
    to,
    subject: "Vendor QR Portal — Password reset code",
    text: [
      "Your password reset code is:",
      "",
      otp,
      "",
      "This code expires in 10 minutes.",
      "If you did not request this, ignore this email.",
    ].join("\n"),
    html: `<p>Your password reset code is:</p><p style="font-size:24px;font-weight:bold">${otp}</p>
      <p>Expires in 10 minutes.</p>`,
  });
}

/**
 * Queues welcome email with temporary password (legacy register flow).
 * @param {string} to
 * @param {string} vendorCode
 * @param {string} tempPassword
 */
export function queueWelcomeEmail(to, vendorCode, tempPassword) {
  queueVendorWelcomeEmail(to, vendorCode, vendorCode, tempPassword);
}

/**
 * Queues vendor portal welcome email (non-blocking HTTP response).
 * @param {string} to
 * @param {string} vendorName
 * @param {string} username
 * @param {string} tempPassword
 */
export function queueVendorWelcomeEmail(to, vendorName, username, tempPassword) {
  const portalUrl = process.env.CLIENT_URL || "http://localhost:5173";

  emailQueue.enqueue(async () => {
    await sendWelcomeEmail(to, vendorName, username, tempPassword, portalUrl);
  });
}

/**
 * Queues OTP email with the code (only inside queued job, never in HTTP logs).
 * @param {string} to
 * @param {string} otp
 */
export function queueOtpEmailWithCode(to, otp) {
  emailQueue.enqueue(async () => {
    await sendPasswordResetEmail(to, otp);
  });
}
