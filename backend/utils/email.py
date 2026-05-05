import asyncio
import socket
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

import httpx

from config import settings


class _SMTPIPv4Only(smtplib.SMTP):
    """SMTP client that only uses IPv4 (avoids ENETUNREACH when IPv6 egress is broken)."""

    def _get_socket(self, host, port, timeout):
        if self.debuglevel > 0:
            self._print_debug("connect:", (host, port))
        last_err = None
        for res in socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM):
            af, socktype, proto, _canon, sa = res
            sock = None
            try:
                sock = socket.socket(af, socktype, proto)
                if timeout is not None:
                    sock.settimeout(timeout)
                if self.source_address is not None:
                    sock.bind(self.source_address)
                sock.connect(sa)
                return sock
            except OSError as err:
                last_err = err
                if sock is not None:
                    sock.close()
        if last_err is not None:
            raise last_err
        raise OSError(
            f"Could not connect to {host!r}:{port} over IPv4 (no usable A records or all attempts failed)."
        )


class _SMTPSSLIPv4Only(smtplib.SMTP_SSL):
    """SMTP_SSL that only uses IPv4 (same rationale as _SMTPIPv4Only)."""

    def _get_socket(self, host, port, timeout):
        if self.debuglevel > 0:
            self._print_debug("connect:", (host, port))
        last_err = None
        for res in socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM):
            af, socktype, proto, _canon, sa = res
            sock = None
            try:
                sock = socket.socket(af, socktype, proto)
                if timeout is not None:
                    sock.settimeout(timeout)
                if self.source_address is not None:
                    sock.bind(self.source_address)
                sock.connect(sa)
                return self.context.wrap_socket(sock, server_hostname=host)
            except OSError as err:
                last_err = err
                if sock is not None:
                    sock.close()
        if last_err is not None:
            raise last_err
        raise OSError(
            f"Could not connect to {host!r}:{port} over IPv4 (SSL, no usable A records or all attempts failed)."
        )


def _send_smtp(to_email: str, subject: str, body: str, html: bool = False):
    """Send email synchronously (called inside a thread pool)."""
    if not settings.smtp_username or not settings.smtp_password:
        raise ValueError(
            "SMTP is not configured: set SMTP_USERNAME and SMTP_PASSWORD in the server environment."
        )

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.smtp_username
    msg["To"] = to_email
    msg["Subject"] = subject
    content_type = "html" if html else "plain"
    msg.attach(MIMEText(body, content_type))

    timeout = settings.smtp_timeout_seconds
    host = settings.smtp_server
    port = settings.smtp_port
    ctx = ssl.create_default_context()

    if settings.smtp_use_ssl:
        ssl_cls = _SMTPSSLIPv4Only if settings.smtp_force_ipv4 else smtplib.SMTP_SSL
        server = ssl_cls(host, port, timeout=timeout, context=ctx)
    else:
        smtp_cls = _SMTPIPv4Only if settings.smtp_force_ipv4 else smtplib.SMTP
        server = smtp_cls(host, port, timeout=timeout)
        server.starttls(context=ctx)

    try:
        server.login(settings.smtp_username, settings.smtp_password)
        server.sendmail(settings.smtp_username, to_email, msg.as_string())
    finally:
        try:
            server.quit()
        except Exception:
            pass


async def _send_resend(
    to_email: str, subject: str, *, text: Optional[str] = None, html: Optional[str] = None
) -> None:
    """Send via Resend REST API (port 443; works where outbound SMTP is blocked)."""
    if not settings.resend_api_key:
        raise ValueError("RESEND_API_KEY is not set.")
    if not text and not html:
        raise ValueError("Email body required (text or html).")

    payload: dict = {
        "from": settings.resend_from,
        "to": [to_email],
        "subject": subject,
    }
    if text is not None:
        payload["text"] = text
    if html is not None:
        payload["html"] = html

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if r.status_code >= 400:
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        raise Exception(f"Resend API error {r.status_code}: {detail}")


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

    try:
        if settings.resend_api_key:
            await _send_resend(email, subject, text=body)
        else:
            loop = asyncio.get_event_loop()
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

    try:
        if settings.resend_api_key:
            await _send_resend(email, subject, html=html_body)
        else:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, _send_smtp, email, subject, html_body, True)
    except Exception as e:
        raise Exception(f"Failed to send password reset email: {str(e)}")