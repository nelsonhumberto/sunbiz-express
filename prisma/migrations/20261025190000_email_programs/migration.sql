-- Checklist double opt-in, post-formation sends, and stored weekly issues.
-- Additive only. New tables enable row level security and add no policies.
-- The app reads and writes them with Prisma on the server.

ALTER TABLE "ChecklistSignup" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "ChecklistSignup" ADD COLUMN "confirmTokenHash" TEXT;
ALTER TABLE "ChecklistSignup" ADD COLUMN "confirmTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "ChecklistSignup" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChecklistSignup" ADD COLUMN "checklistSentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ChecklistSignup_confirmTokenHash_key" ON "ChecklistSignup"("confirmTokenHash");
CREATE INDEX "ChecklistSignup_isTest_confirmedAt_idx" ON "ChecklistSignup"("isTest", "confirmedAt");

ALTER TABLE "MarketingOptOut" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "NewsletterIssue" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsletterIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewsletterSend" (
    "id" TEXT NOT NULL,
    "issueNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsletterSend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsletterSend_issueNumber_email_key" ON "NewsletterSend"("issueNumber", "email");
CREATE INDEX "NewsletterSend_email_idx" ON "NewsletterSend"("email");

CREATE TABLE "PostFormationSend" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostFormationSend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PostFormationSend_filingId_step_key" ON "PostFormationSend"("filingId", "step");
CREATE INDEX "PostFormationSend_email_idx" ON "PostFormationSend"("email");

INSERT INTO "NewsletterIssue" ("id", "subject", "preview", "body") VALUES
(
    '001',
    'One small habit that keeps your new company clean',
    'Keep business and personal money apart, plus one deadline worth adding to your calendar.',
    $issue001$Subject options:
1. One small habit that keeps your new company clean
2. Your business bank account is your best friend
3. A quick tip and a date to save

Hi there,

Welcome to this week's note for new and soon-to-be founders. Two quick things, then you can get back to building.

This week's tip: keep business money separate

Open a business bank account as soon as your company is formed, and run every business dollar through it. Pay business bills from it, deposit customer payments into it, and avoid paying personal costs from it.

Why it helps:
- Bookkeeping and tax time get much simpler.
- You get a clear picture of how the business is really doing.
- Mixing personal and business funds can weaken the separation an LLC or corporation is meant to give you.

Most banks will ask for your formation documents and your EIN, so keep those handy.

Deadline reminder: annual filings

Most states expect companies to file an annual (or biennial) report, pay an annual tax or fee, or both. Due dates vary by state and sometimes by the month you formed. For example, Delaware LLCs pay their annual tax on or before June 1 each year, and missing it can mean a penalty and losing good standing.

Take two minutes this week to look up your state's due date and put it on your calendar with a reminder a few weeks ahead.

Ready to start?

If you are still thinking about forming your company, we make it simple and fully online.

Start your company at LaunchForma
https://launchforma.com

Talk soon,
The LaunchForma Team

This email is general information, not legal or tax advice.

You are receiving this because you signed up for LaunchForma updates. Unsubscribe {{unsubscribe_link}}
LaunchForma, 14160 Palmetto Frontage Rd, Suite 101, Miami Lakes, FL 33016
$issue001$
),
(
    '002',
    'A simple folder that saves you headaches later',
    'An easy way to track business expenses, plus the Florida annual report window to put on your calendar.',
    $issue002$Subject options:
1. A simple folder that saves you headaches later
2. Track every business expense from day one
3. One habit, one date, one quick check

Hi there,

Welcome back. Here are two quick things for this week, and then you can get back to building.

This week's tip: track expenses as you go

Pick one simple system for business expenses and use it from the start. A spreadsheet, a bookkeeping app, or a folder for receipts all work. What matters is that you keep using it.

A few easy habits:
- Save every receipt the day you get it. A phone photo is fine.
- Write a short note on each one: what it was for and who it was with.
- Spend 15 minutes once a week matching receipts to your business bank account.

Why it helps:
- Tax time is calmer because everything is already in one place.
- You can see where your money is really going.
- If an accountant helps you later, they will have clean records to work from.

Ask your accountant which records they want you to keep and for how long.

Deadline reminder: Florida annual report

If you have a Florida LLC or corporation, the annual report window runs from January 1 to May 1 each year. The state charges a $400 late fee if you file after May 1. If no report is filed by the third Friday in September, the state can administratively dissolve the company.

Formed in another state? Look up your state's due date this week and add it to your calendar with a reminder a few weeks ahead.

Need a hand?

Whether you are forming a new company or filing your Florida annual report, we keep it simple and fully online.

Visit LaunchForma
https://launchforma.com

Talk soon,
The LaunchForma Team

This email is general information, not legal or tax advice.

You are receiving this because you signed up for LaunchForma updates. Unsubscribe {{unsubscribe_link}}
LaunchForma, 14160 Palmetto Frontage Rd, Suite 101, Miami Lakes, FL 33016
$issue002$
);

ALTER TABLE "NewsletterIssue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NewsletterSend" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PostFormationSend" ENABLE ROW LEVEL SECURITY;
