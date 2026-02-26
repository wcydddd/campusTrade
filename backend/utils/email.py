import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import settings

async def send_verification_code(email: str, code: str):
    """发送验证码邮件"""
    subject = "CampusTrade - Email Verification Code"
    body = f"""
    Hi,

    Your verification code is: {code}

    This code will expire in 10 minutes.

    If you didn't request this, please ignore this email.

    Best,
    CampusTrade Team
    """

    msg = MIMEMultipart()
    msg['From'] = settings.smtp_username
    msg['To'] = email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))

    try:
        server = smtplib.SMTP(settings.smtp_server, settings.smtp_port)
        server.starttls()
        server.login(settings.smtp_username, settings.smtp_password)
        server.sendmail(settings.smtp_username, email, msg.as_string())
        server.quit()
    except Exception as e:
        raise Exception(f"Failed to send email: {str(e)}")