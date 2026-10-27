import { auth } from '@/lib/auth';
import { NavBar } from '@/components/marketing/NavBar';
import { Footer } from '@/components/marketing/Footer';
import { SkipLink } from '@/components/a11y/SkipLink';
import { ChatWidget } from '@/components/assistant/ChatWidget';
import { JsonLd, organizationJsonLd } from '@/components/seo/JsonLd';
import { ChecklistSignupSection } from '@/components/marketing/ChecklistSignupSection';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isAuthed = !!session?.user;
  const isAdmin = session?.user?.role === 'ADMIN';

  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <SkipLink />
      <NavBar isAuthed={isAuthed} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="overflow-x-clip focus:outline-none">
        {children}
      </main>
      <ChecklistSignupSection />
      <Footer />
      <ChatWidget />
    </>
  );
}
