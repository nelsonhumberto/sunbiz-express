import { auth } from '@/lib/auth';
import { NavBar } from '@/components/marketing/NavBar';
import { Footer } from '@/components/marketing/Footer';
import { SkipLink } from '@/components/a11y/SkipLink';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isAuthed = !!session?.user;
  const isAdmin = session?.user?.role === 'ADMIN';

  return (
    <>
      <SkipLink />
      <NavBar isAuthed={isAuthed} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <Footer />
    </>
  );
}
