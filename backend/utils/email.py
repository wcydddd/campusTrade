import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import settings


def _send_smtp(to_email: str, subject: str, body: str, html: bool = False):
    """Send email synchronously (called inside a thread pool)."""
    msg = MIMEMultipart("alternative")
    msg["From"] = settings.smtp_username
    msg["To"] = to_email
    msg["Subject"] = subject
    content_type = "html" if html else "plain"
    msg.attach(MIMEText(body, content_type))

    server = smtplib.SMTP(settings.smtp_server, settings.smtp_port, timeout=15)
    server.starttls()
    server.login(settings.smtp_username, settings.smtp_password)
    server.sendmail(settings.smtp_username, to_email, msg.as_string())
    server.quit()


async def send_verification_code(email: str, code: str):
    """Send a 6-digit email verification code."""
    subject = "CampusTrade - Email Verification Code"
    body = (
        f"Hi,\n\n"
        f"Your verification code is: {code}\n\n"
        f"This code will expire in 10 minutes.\n\n"
        f"If you didn't request this, please ignore this email.\n\n"
        f"Best,\nCampusTrade Team"
    )

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, _send_smtp, email, subject, body)
    except Exception as e:
        raise Exception(f"Failed to send email: {str(e)}")


async def send_password_reset_email(email: str, reset_link: str):
    """Send a password-reset email containing an HTML template with the reset link."""
    subject = "CampusTrade - Reset Your Password"

    html_body = f"""\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
        <tr><td style="text-align:center;padding-bottom:24px;">
          <h1 style="margin:0;font-size:24px;color:#1a1a1a;">CampusTrade</h1>
        </td></tr>
        <tr><td style="font-size:15px;color:#333;line-height:1.6;">
          <p>Hi,</p>
          <p>We received a request to reset your password. Click the button below to choose a new password:</p>
        </td></tr>
        <tr><td style="text-align:center;padding:28px 0;">
          <a href="{reset_link}"
             style="display:inline-block;padding:12px 36px;background:#4f46e5;color:#fff;
                    text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
            Reset Password
          </a>
        </td></tr>
        <tr><td style="font-size:13px;color:#888;line-height:1.5;">
          <p>This link will expire in {settings.password_reset_expire_minutes} minutes.</p>
          <p>If you didn't request a password reset, you can safely ignore this email &mdash;
             your password will remain unchanged.</p>
          <p style="word-break:break-all;color:#aaa;margin-top:16px;">
            If the button doesn't work, copy and paste this URL into your browser:<br/>
            <a href="{reset_link}" style="color:#4f46e5;">{reset_link}</a>
          </p>
        </td></tr>
        <tr><td style="padding-top:24px;border-top:1px solid #eee;font-size:12px;color:#bbb;text-align:center;">
          &copy; CampusTrade Team
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, _send_smtp, email, subject, html_body, True)
    except Exception as e:
        raise Exception(f"Failed to send password reset email: {str(e)}")