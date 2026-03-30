"""
Email service for sending verification codes and notifications
Uses SMTP (compatible with Tencent Enterprise Email)
"""
import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import Header
from typing import Optional

logger = logging.getLogger(__name__)


class EmailService:
    """Email service singleton for sending emails via SMTP"""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self.smtp_server = os.getenv('MAIL_SERVER', 'smtp.exmail.qq.com')
        self.smtp_port = int(os.getenv('MAIL_PORT', '465'))
        self.use_ssl = os.getenv('MAIL_USE_SSL', 'true').lower() == 'true'
        self.use_tls = os.getenv('MAIL_USE_TLS', 'false').lower() == 'true'
        self.username = os.getenv('MAIL_USERNAME', '')
        self.password = os.getenv('MAIL_PASSWORD', '')
        self.default_sender = os.getenv('MAIL_DEFAULT_SENDER', 'Banana Slides <support@rizitai.com>')

        self._initialized = True

        if not self.username or not self.password:
            logger.warning("Email service not configured: missing MAIL_USERNAME or MAIL_PASSWORD")
        else:
            logger.info(f"Email service configured with SMTP server: {self.smtp_server}:{self.smtp_port}")

    def is_configured(self) -> bool:
        """Check if email service is properly configured"""
        return bool(self.username and self.password)

    def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> tuple[bool, str]:
        """
        Send an email
        Returns: (success, error_message)
        """
        if not self.is_configured():
            return False, '邮件服务未配置'

        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = Header(subject, 'utf-8')
            msg['From'] = self.default_sender
            msg['To'] = to_email

            # Add text part (fallback)
            if text_content:
                text_part = MIMEText(text_content, 'plain', 'utf-8')
                msg.attach(text_part)

            # Add HTML part
            html_part = MIMEText(html_content, 'html', 'utf-8')
            msg.attach(html_part)

            # Connect and send
            if self.use_ssl:
                server = smtplib.SMTP_SSL(self.smtp_server, self.smtp_port)
            else:
                server = smtplib.SMTP(self.smtp_server, self.smtp_port)
                if self.use_tls:
                    server.starttls()

            server.login(self.username, self.password)
            server.sendmail(self.username, [to_email], msg.as_string())
            server.quit()

            logger.info(f"Email sent successfully to {to_email}")
            return True, ''

        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP authentication error: {e}")
            return False, '邮件服务器认证失败'
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error: {e}")
            return False, f'邮件发送失败: {str(e)}'
        except Exception as e:
            logger.error(f"Email send error: {e}")
            return False, f'邮件发送失败: {str(e)}'

    def send_verification_code(
        self,
        to_email: str,
        code: str,
        code_type: str,
        expires_minutes: int = 5
    ) -> tuple[bool, str]:
        """
        Send a verification code email with HTML template
        """
        if code_type == 'register':
            subject = '【蕉幻 Banana Slides】注册验证码'
            title = '欢迎注册蕉幻'
            description = '您正在注册蕉幻 Banana Slides 账号，请使用以下验证码完成注册：'
        elif code_type == 'reset_password':
            subject = '【蕉幻 Banana Slides】密码重置验证码'
            title = '重置密码'
            description = '您正在重置蕉幻 Banana Slides 账号密码，请使用以下验证码：'
        else:
            subject = '【蕉幻 Banana Slides】验证码'
            title = '验证码'
            description = '您的验证码是：'

        html_content = self._get_verification_email_template(
            title=title,
            description=description,
            code=code,
            expires_minutes=expires_minutes,
        )

        text_content = f"{description}\n\n验证码: {code}\n\n验证码 {expires_minutes} 分钟内有效，请勿泄露给他人。\n\n如果这不是您的操作，请忽略此邮件。"

        return self.send_email(to_email, subject, html_content, text_content)

    def _get_verification_email_template(
        self,
        title: str,
        description: str,
        code: str,
        expires_minutes: int
    ) -> str:
        """Generate HTML email template for verification code"""
        return f'''
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="width: 100%; max-width: 480px; border-collapse: collapse;">
                    <!-- Logo Header -->
                    <tr>
                        <td align="center" style="padding-bottom: 30px;">
                            <div style="display: inline-flex; align-items: center; gap: 12px;">
                                <span style="font-size: 40px;">🍌</span>
                                <span style="font-size: 24px; font-weight: bold; background: linear-gradient(135deg, #F59E0B, #F97316); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">蕉幻</span>
                            </div>
                        </td>
                    </tr>

                    <!-- Main Card -->
                    <tr>
                        <td style="background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); padding: 40px 32px;">
                            <!-- Title -->
                            <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 700; color: #111827; text-align: center;">
                                {title}
                            </h1>

                            <!-- Description -->
                            <p style="margin: 0 0 24px 0; font-size: 15px; color: #6b7280; text-align: center; line-height: 1.6;">
                                {description}
                            </p>

                            <!-- Verification Code -->
                            <div style="background: linear-gradient(135deg, #FEF3C7, #FDE68A); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                                <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #92400E; font-family: 'Courier New', monospace;">
                                    {code}
                                </div>
                            </div>

                            <!-- Expiry Notice -->
                            <div style="background: #F3F4F6; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
                                <p style="margin: 0; font-size: 13px; color: #6B7280; text-align: center;">
                                    ⏱️ 验证码 <strong style="color: #F59E0B;">{expires_minutes} 分钟</strong>内有效，请勿泄露给他人
                                </p>
                            </div>

                            <!-- Security Notice -->
                            <p style="margin: 0; font-size: 13px; color: #9CA3AF; text-align: center; line-height: 1.5;">
                                如果这不是您本人的操作，请忽略此邮件。<br>
                                您的账号安全不会受到影响。
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding-top: 30px; text-align: center;">
                            <p style="margin: 0 0 8px 0; font-size: 13px; color: #9CA3AF;">
                                此邮件由 蕉幻 Banana Slides 自动发送，请勿直接回复
                            </p>
                            <p style="margin: 0; font-size: 12px; color: #D1D5DB;">
                                © 2024 Banana Slides. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
'''


# Singleton instance
email_service = EmailService()
