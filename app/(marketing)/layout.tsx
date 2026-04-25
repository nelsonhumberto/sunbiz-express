import { auth } from '@/lib/auth';
import { NavBar } from '@/components/marketing/NavBar';
import { Footer } from '@/components/marketing/Footer';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isAuthed = !!session?.user;
  const isAdmin = session?.user?.role === 'ADMIN';

  return (
    <>
      <NavBar isAuthed={isAuthed} isAdmin={isAdmin} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
