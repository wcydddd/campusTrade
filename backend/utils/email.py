import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import settings


def _send_smtp(to_email: str, subject: str, body: str):
    """同步发送邮件（在线程池中调用）"""
    msg = MIMEMultipart()
    msg['From'] = settings.smtp_username
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))

    server = smtplib.SMTP(settings.smtp_server, settings.smtp_port, timeout=15)
    server.starttls()
    server.login(settings.smtp_username, settings.smtp_password)
    server.sendmail(settings.smtp_username, to_email, msg.as_string())
    server.quit()


async def send_verification_code(email: str, code: str):
    """发送验证码邮件"""
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