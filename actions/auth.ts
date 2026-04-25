'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { signIn, signOut } from '@/lib/auth';
import { sendEmail } from '@/lib/email-mock';
import { AuthError } from 'next-auth';

const SignUpSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required').max(80),
    lastName: z.string().min(1, 'Last name is required').max(80),
    email: z.string().email('Enter a valid email').max(255),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(100)
      .regex(/[A-Z]/, 'Include at least one uppercase letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string(),
    acceptTerms: z.preprocess(
      (v) => v === 'on' || v === true,
      z.boolean().refine((v) => v === true, 'You must accept the terms')
    ),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

const SignInSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export interface ActionResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function signUpAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = SignUpSchema.safeParse({
    ...raw,
    acceptTerms: raw.acceptTerms,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? '');
      if (!fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { error: 'Please correct the errors below.', fieldErrors };
  }

  const data = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) {
    return { error: 'An account with that email already exists. Try signing in instead.' };
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: 'USER',
      emailVerified: true, // auto-verified for demo
    },
  });

  await sendEmail({
    type: 'WELCOME',
    to: user.email,
    userId: user.id,
    context: { firstName: user.firstName },
  });

  // Auto sign-in
  try {
    await signIn('credentials', {
      email: data.email,
      password: data.password,
      redirect: false,
    });
  } catch (err) {
    // ignore — will redirect to sign-in
  }
  redirect('/dashboard');
}

export async function signInAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = SignInSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? '');
      if (!fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { error: 'Please check your input.', fieldErrors };
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'Invalid email or password.' };
    }
    // NEXT_REDIRECT errors are OK
    if ((err as Error)?.message?.includes('NEXT_REDIRECT')) throw err;
    return { error: 'Something went wrong. Try again.' };
  }
  redirect('/dashboard');
}

export async function signOutAction() {
  await signOut({ redirectTo: '/' });
}
