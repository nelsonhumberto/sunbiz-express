import { auth } from '@/lib/auth';
import { NavBar } from '@/components/marketing/NavBar';
import { Footer } from '@/components/marketing/Footer';

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <>
      <NavBar isAuthed={!!session?.user} isAdmin={session?.user?.role === 'ADMIN'} />
      <main className="container max-w-3xl py-16 prose prose-sm md:prose-base max-w-none prose-headings:font-display prose-headings:tracking-tight prose-h1:text-4xl prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-lg prose-p:text-ink-muted prose-strong:text-ink prose-a:text-primary">
        {children}
      </main>
      <Footer />
    </>
  );
}
