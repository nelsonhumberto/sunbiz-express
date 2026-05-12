/**
 * TEMPORARY diagnostic endpoint — admin-only, remove after debugging.
 * Hit GET /api/test-email?to=you@example.com from browser to test SMTP.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  // Gate to admins only
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const to = req.nextUrl.searchParams.get('to') ?? session.user.email!;

  // Read env vars
  const resendKey  = process.env.RESEND_API_KEY;
  const smtpHost   = process.env.SMTP_HOST;
  const smtpPort   = process.env.SMTP_PORT;
  const smtpUser   = process.env.SMTP_USER;
  const smtpPass   = process.env.SMTP_PASS ? '✅ set' : '❌ missing';
  const smtpSecure = process.env.SMTP_SECURE;
  const emailFrom  = process.env.EMAIL_FROM;

  const config = {
    provider: resendKey ? 'resend' : smtpHost ? 'smtp' : 'none (console only)',
    RESEND_API_KEY: resendKey ? '✅ set' : '❌ missing',
    SMTP_HOST: smtpHost ?? '❌ missing',
    SMTP_PORT: smtpPort ?? '(default 587)',
    SMTP_USER: smtpUser ?? '❌ missing',
    SMTP_PASS: smtpPass,
    SMTP_SECURE: smtpSecure ?? '(default false)',
    EMAIL_FROM: emailFrom ?? '❌ missing',
    sendingTo: to,
  };

  // Attempt a real send
  try {
    if (resendKey) {
      const { Resend } = await import('resend');
      const resend = new Resend(resendKey);
      const { error } = await resend.emails.send({
        from: emailFrom ?? 'LaunchForma <no-reply@launchforma.com>',
        to,
        subject: 'LaunchForma — email test',
        html: '<p>Email delivery is working! ✅</p>',
      });
      if (error) throw new Error(JSON.stringify(error));
    } else if (smtpHost && smtpUser && process.env.SMTP_PASS) {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort ?? 587),
        secure: smtpSecure === 'true',
        auth: { user: smtpUser, pass: process.env.SMTP_PASS },
      });
      await transporter.verify();   // just check the connection first
      await transporter.sendMail({
        from: emailFrom ?? smtpUser,
        to,
        subject: 'LaunchForma — email test',
        html: '<p>Email delivery is working! ✅</p>',
      });
    } else {
      return NextResponse.json({
        ...config,
        result: '⚠️  No email provider configured — emails only log to console.',
      });
    }

    return NextResponse.json({ ...config, result: '✅ Email sent successfully!' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ...config, result: `❌ Error: ${message}` }, { status: 500 });
  }
}
