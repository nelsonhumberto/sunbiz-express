-- Store approved weekly issue 005.
-- Data only. NewsletterIssue already exists and already has row level security.
-- Sending reads lib/newsletter.ts, not this table.

INSERT INTO "NewsletterIssue" ("id", "subject", "preview", "body") VALUES
(
    '005',
    'Put your company''s yearly dates on one calendar',
    'Florida LLC or corporation? Your annual report window opens January 1.',
    $issue005$Subject options:
1. Put your company's yearly dates on one calendar

Hi there,

Here is one quick tip and one date to know, and then you can get back to building.

This week's tip: make a simple company calendar

Open your calendar app and add a yearly event for every filing your company owes.

A few to include:
- Your state annual report.
- Your tax return dates.
- Your registered agent renewal.

Set a reminder two weeks before each one. It takes about ten minutes and helps you avoid late fees you never saw coming.

Deadline reminder: Florida annual report

Florida LLCs and corporations file an annual report every year to stay active with the state. Reports are due between January 1 and May 1. In 2027, May 1 falls on a Saturday, so plan to file early in the window. After May 1, the state adds a $400 late fee for LLCs and profit corporations. If the report is still not filed by the third Friday in September (September 17, 2027), the state can administratively dissolve the company. You can file it yourself at sunbiz.org.

Not in Florida? Other states have their own dates and fees, so check your Secretary of State website.

Your next step

Grab our free LLC checklist. It walks you through what to do after your company is formed, in plain words.

Get the free checklist
https://launchforma.com/checklist

Talk soon,
The LaunchForma Team

This email is general information, not legal or tax advice.

You are receiving this because you signed up for LaunchForma updates. Unsubscribe {{unsubscribe_link}}
LaunchForma, 14160 Palmetto Frontage Rd, Suite 101, Miami Lakes, FL 33016
$issue005$
);
