import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { SignUpForm } from './sign-up-form';

export const metadata = { title: 'Create your account' };

export default async function SignUpPage() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-medium tracking-tight">Create your account</h1>
        <p className="text-sm text-ink-muted">
          Already have one?{' '}
          <Link href="/sign-in" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
          .
        </p>
      </div>
      <SignUpForm />
      <p className="text-xs text-ink-subtle text-center leading-relaxed">
        By creating an account, you agree to our{' '}
        <Link href="/terms" className="underline hover:text-ink-muted">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline hover:text-ink-muted">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
