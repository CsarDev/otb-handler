import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: parseInt(process.env.SMTP_PORT ?? '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendVerificationEmail(
  email: string,
  token: string,
): Promise<void> {
  const verificationUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/verify-email?token=${token}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'OTB <noreply@otb.com>',
    to: email,
    subject: 'Verifica tu correo electrónico',
    html: `
      <h1>Verifica tu correo electrónico</h1>
      <p>Haz clic en el enlace para verificar tu cuenta:</p>
      <a href="${verificationUrl}">${verificationUrl}</a>
      <p>Este enlace expira en 24 horas.</p>
    `,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
): Promise<void> {
  const resetUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'OTB <noreply@otb.com>',
    to: email,
    subject: 'Restablece tu contraseña',
    html: `
      <h1>Restablece tu contraseña</h1>
      <p>Haz clic en el enlace para restablecer tu contraseña:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>Este enlace expira en 1 hora.</p>
      <p>Si no solicitaste este cambio, ignora este mensaje.</p>
    `,
  });
}
