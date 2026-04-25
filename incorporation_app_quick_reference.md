# Business Incorporation Web Application - Quick Reference Guide

**Version:** 1.0  
**Date:** April 25, 2026  
**Purpose:** Quick lookup for developers implementing the incorporation platform

---

## Table of Contents

1. [Database Schema Diagram (Text-Based)](#1-database-schema-diagram)
2. [API Endpoints Reference](#2-api-endpoints-reference)
3. [User Journey Flowchart](#3-user-journey-flowchart)
4. [Email Trigger Matrix](#4-email-trigger-matrix)
5. [Implementation Checklist](#5-implementation-checklist)
6. [Key Metrics & KPIs](#6-key-metrics--kpis)
7. [Troubleshooting Quick Guide](#7-troubleshooting-quick-guide)

---

## 1. Database Schema Diagram

### Core Entity Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INCORPORATION PLATFORM                             │
│                          DATABASE SCHEMA OVERVIEW                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│    users     │
├──────────────┤
│ user_id (PK) │
│ email        │  1
│ password     ├─────────┐
│ first_name   │         │
│ last_name    │         │
│ created_at   │         │
└──────────────┘         │
       △                 │
       │                 │ N
       │          ┌──────┴───────────────┐
       │          │      filings         │
       │          ├─────────────────────┤
       │          │ filing_id (PK)       │
       │          │ user_id (FK)         │
       │          │ business_name        │
       │          │ entity_type (LLC, Corp)
       │          │ state (FL, CA, etc)  │
       │          │ status (draft, submitted, approved)
       │          │ principal_address    │
       │          │ mailing_address      │
       │          │ registered_agent_*   │
       │          │ sunbiz_filing_number │
       │          │ created_at           │
       │          └────────┬────────────┘
       │                   │ N
       │          ┌────────┴──────────────────┐
       │          │                           │
       │    ┌─────▼──────────────┐    ┌─────▼──────────────┐
       │    │  filing_steps      │    │    documents       │
       │    ├────────────────────┤    ├────────────────────┤
       │    │ step_id (PK)       │    │ document_id (PK)   │
       │    │ filing_id (FK)     │    │ filing_id (FK)     │
       │    │ step_number        │    │ document_type      │
       │    │ data_snapshot      │    │ s3_bucket          │
       │    │ completed_at       │    │ s3_key             │
       │    └────────────────────┘    │ s3_url             │
       │                              │ file_size          │
       │                              │ generated_at       │
       │                              └────────────────────┘
       │
       │    ┌──────────────────────┐
       │    │     payments         │
       │    ├──────────────────────┤
       │    │ payment_id (PK)      │
       │    │ filing_id (FK)       │
       │    │ user_id (FK)         │
       │    │ stripe_intent_id     │
       │    │ amount_cents         │
       │    │ status               │
       │    │ completed_at         │
       │    └──────────────────────┘
       │
       └─────┐
             │ N
      ┌──────▼──────────────────┐
      │  email_notifications     │
      ├─────────────────────────┤
      │ notification_id (PK)     │
      │ user_id (FK)             │
      │ filing_id (FK)           │
      │ notification_type        │
      │ recipient_email          │
      │ status                   │
      │ sent_at                  │
      └──────────────────────────┘

┌──────────────────────────┐    ┌──────────────────────────┐
│   managers_members       │    │  additional_services     │
├──────────────────────────┤    ├──────────────────────────┤
│ manager_id (PK)          │    │ service_id (PK)          │
│ filing_id (FK)           │    │ service_name             │
│ title (MGR, AMBR, AP)    │    │ price_cents              │
│ name                     │    │ is_recurring             │
│ address                  │    │ enabled                  │
│ ownership_percentage     │    │ created_at               │
└──────────────────────────┘    └──────────────────────────┘
           △                              △
           │ N                            │ N
           │                     ┌────────┴─────────────────┐
           │                     │                          │
           │          ┌──────────▼──────────────┐           │
           │          │ filing_add_services     │           │
           │          ├───────────────────────┤           │
           │          │ filing_service_id (PK)│           │
           │          │ filing_id (FK)        │           │
           │          │ service_id (FK)       │           │
           │          │ quantity              │           │
           │          │ price_cents           │           │
           │          │ status                │           │
           │          │ expiration_date       │           │
           │          └───────────────────────┘           │
           │                                              │
           ├──────────────────────────────────────────────┘
           │
      ┌────▼─────────────────────┐
      │ registered_agent_service │
      ├──────────────────────────┤
      │ agent_service_id (PK)    │
      │ filing_id (FK)           │
      │ agent_name               │
      │ agent_email              │
      │ office_address           │
      │ start_date               │
      │ renewal_date             │
      │ status                   │
      └──────────────────────────┘

┌─────────────────────────┐    ┌──────────────────────┐
│       states            │    │   pricing_tiers      │
├─────────────────────────┤    ├──────────────────────┤
│ state_id (PK)           │    │ tier_id (PK)         │
│ state_code (FL, CA, etc)│    │ tier_name            │
│ state_name              │    │ base_price_cents     │
│ llc_filing_fee_cents    │    │ included_features    │
│ corporation_fee_cents   │    │ entity_types         │
│ annual_report_fee       │    │ applicable_states    │
│ annual_report_due_month │    └──────────────────────┘
│ requires_annual_report  │
│ enabled                 │
└─────────────────────────┘

┌─────────────────────────────────┐
│      annual_reports             │
├─────────────────────────────────┤
│ report_id (PK)                  │
│ filing_id (FK)                  │
│ report_year                     │
│ due_date                        │
│ filed_date                      │
│ status (pending, filed, overdue)│
│ filing_fee_cents                │
│ late_fee_cents                  │
│ reminder_60_sent                │
│ reminder_30_sent                │
│ reminder_final_sent             │
└─────────────────────────────────┘

┌─────────────────────────────┐
│      admin_actions          │
├─────────────────────────────┤
│ action_id (PK)              │
│ admin_user_id (FK)          │
│ filing_id (FK)              │
│ action_type                 │
│ affected_table              │
│ old_values (JSONB)          │
│ new_values (JSONB)          │
│ created_at                  │
└─────────────────────────────┘

```

---

## 2. API Endpoints Reference

### Authentication Endpoints

| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| POST | `/api/auth/register` | Create new user account | `{email, password, first_name, last_name}` | `{user_id, email, created_at}` |
| POST | `/api/auth/login` | User login | `{email, password}` | `{user_id, auth_token, expires_at}` |
| POST | `/api/auth/logout` | Logout (invalidate token) | (none) | `{success: true}` |
| POST | `/api/auth/refresh-token` | Refresh auth token | `{refresh_token}` | `{auth_token, expires_at}` |
| POST | `/api/auth/password-reset` | Initiate password reset | `{email}` | `{success: true, message}` |
| POST | `/api/auth/password-reset-confirm` | Complete password reset | `{token, new_password}` | `{success: true}` |
| POST | `/api/auth/email-verify` | Verify email address | `{verification_token}` | `{success: true}` |

### Filing Endpoints

| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| POST | `/api/filings/create` | Start new filing | `{entity_type, state}` | `{filing_id, created_at}` |
| GET | `/api/filings` | List user's filings | Query: `?state=FL&status=submitted` | `[{filing_id, business_name, status, created_at}]` |
| GET | `/api/filings/{filing_id}` | Get filing details | (none) | `{filing_id, business_name, entity_type, status, all_data...}` |
| PUT | `/api/filings/{filing_id}` | Update filing (draft only) | `{field_name, new_value}` | `{filing_id, updated_at}` |
| POST | `/api/filings/{filing_id}/submit` | Submit filing for payment | (none) | `{filing_id, status: 'submitted'}` |
| DELETE | `/api/filings/{filing_id}` | Delete draft filing | (none) | `{success: true}` |

### Filing Steps Endpoints

| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| POST | `/api/filings/{filing_id}/steps/{step_number}` | Save form step | `{step_data: {...}}` | `{step_number, completed_at}` |
| GET | `/api/filings/{filing_id}/steps/{step_number}` | Get saved step data | (none) | `{step_number, data: {...}}` |
| GET | `/api/filings/{filing_id}/progress` | Get overall progress | (none) | `{current_step, total_steps, percentage_complete}` |

### Name Availability Endpoints

| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| GET | `/api/names/check` | Check name availability | Query: `?name=Acme&state=FL&type=LLC` | `{available: bool, conflicts: [{name, status}]}` |
| GET | `/api/names/suggestions` | Get alternative names | Query: `?prefix=Acme` | `[{name, available, suggested_price}]` |

### Domain Endpoints

| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| GET | `/api/domains/check` | Check domain availability | Query: `?domain=acme.com` | `{available: bool, price: 12.99, premium: false}` |
| GET | `/api/domains/suggestions` | Suggest available domains | Query: `?keyword=acme&tlds=com,net,org` | `[{domain, available, price, premium}]` |
| POST | `/api/domains/register` | Register a domain | `{domain, years: 1}` | `{order_id, transaction_id, charge_amount}` |

### Payment Endpoints

| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| POST | `/api/payments/create-intent` | Create Stripe PaymentIntent | `{filing_id, amount_cents}` | `{client_secret, payment_intent_id}` |
| GET | `/api/payments/{filing_id}` | Get payment details | (none) | `{payment_id, amount, status, created_at}` |
| POST | `/api/payments/{payment_id}/refund` | Request refund | `{reason}` | `{refund_id, status: 'pending'}` |

### Document Endpoints

| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| GET | `/api/documents/{filing_id}` | List documents | (none) | `[{document_id, type, title, s3_url, created_at}]` |
| GET | `/api/documents/{document_id}/download` | Generate signed download URL | (none) | `{download_url, expires_at}` |
| POST | `/api/documents/{filing_id}/regenerate` | Regenerate document | `{document_type}` | `{document_id, regenerated_at}` |

### Annual Report Endpoints

| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| GET | `/api/filings/{filing_id}/annual-reports` | Get annual report deadlines | (none) | `[{report_id, due_date, status, filing_fee}]` |
| POST | `/api/filings/{filing_id}/annual-reports/{report_id}/file` | File annual report | (none) | `{report_id, filed_at, sunbiz_filing_number}` |

### Admin Endpoints

| Method | Endpoint | Purpose | Request | Response |
|--------|----------|---------|---------|----------|
| GET | `/api/admin/filings` | List all filings (admin) | Query filters | `[{filing_id, user_email, status, created_at}]` |
| PUT | `/api/admin/filings/{filing_id}/approve` | Approve filing manually | `{notes}` | `{filing_id, status: 'approved'}` |
| PUT | `/api/admin/filings/{filing_id}/reject` | Reject filing | `{reason}` | `{filing_id, status: 'rejected', sunbiz_rejection_reason}` |
| POST | `/api/admin/filings/{filing_id}/resubmit` | Resubmit to state (after fix) | (none) | `{filing_id, status: 'submitted'}` |
| GET | `/api/admin/analytics` | Get dashboard analytics | Query: `?from_date&to_date&metric` | `{metric_data: [...]}` |
| POST | `/api/admin/users/{user_id}/suspend` | Suspend user account | `{reason}` | `{user_id, status: 'suspended'}` |
| POST | `/api/admin/emails/resend` | Resend notification email | `{user_id, notification_type}` | `{success: true, sent_at}` |

### Webhook Endpoints

| Method | Endpoint | Purpose | Expected Body |
|--------|----------|---------|----------------|
| POST | `/webhooks/stripe` | Handle Stripe events | Stripe webhook payload |
| POST | `/webhooks/sendgrid` | Handle email events (opens, clicks) | SendGrid event webhook |

---

## 3. User Journey Flowchart

### High-Level User Journey

```
START
  │
  ├─→ [Landing Page]
  │   "Form an LLC in Florida"
  │   ├─→ Click "Start LLC" OR "Start Corporation"
  │   └─→ Click "Learn More"
  │
  ├─→ [Sign Up / Login]
  │   Email verification required
  │   │
  │   └─→ Redirect to Dashboard
  │
  ├─→ [Dashboard]
  │   Show recent filings, compliance calendar
  │   │
  │   └─→ Click "Start New Filing"
  │
  ├─→ [12-Step Incorporation Form]
  │   Step 1: Welcome & Entity Type
  │   Step 2: Business Name & Availability
  │   Step 3: Service Tier Selection
  │   Step 4: Principal Address
  │   Step 5: Mailing Address
  │   Step 6: Registered Agent
  │   Step 7: Members/Officers
  │   Step 8: Correspondence Contact
  │   Step 9: Optional Details
  │   Step 10: Review & Signature
  │   Step 11: Ancillary Services Upsell
  │   Step 12: Payment
  │   │
  │   └─→ Each step auto-saved (form recovery)
  │
  ├─→ [Checkout]
  │   Order Summary
  │   │
  │   ├─→ Payment Processing
  │   │   ├─ Success → Confirmation Page
  │   │   ├─ Decline → Retry Options
  │   │   └─ Error → Contact Support
  │   │
  │   └─→ Email Receipt Sent
  │
  ├─→ [Filing Submitted]
  │   Automatic state filing submission (within 1 hour)
  │   │
  │   └─→ Email: "Filed with state!"
  │
  ├─→ [State Processing] (1-2 business days)
  │   │
  │   ├─→ Approved → Email confirmation + documents
  │   ├─→ Rejected → Email with rejection reason + options
  │   └─→ Pending → Dashboard shows "Processing..."
  │
  ├─→ [Document Download]
  │   Articles of Organization, Receipt, etc.
  │   │
  │   └─→ Dashboard: View & re-download anytime
  │
  └─→ [Ongoing Compliance]
      Annual report reminders
      │
      ├─→ 60 days before: First reminder
      ├─→ 30 days before: Second reminder
      ├─→ 3 days before: Final warning + $400 penalty notice
      │
      ├─→ User files annually OR
      └─→ We file on their behalf (if service purchased)
```

### Form Abandonment Recovery Flow

```
User starts form → Leaves without completing
  │
  ├─→ 24 hours → Email: "Continue your filing (25% complete)"
  │   │
  │   ├─→ User clicks link → Resume from Step 3 (last step)
  │   └─→ User ignores → Continue to next email
  │
  ├─→ 72 hours → Email: "Last chance to complete your filing"
  │   │
  │   ├─→ User completes form → Normal flow
  │   └─→ User ignores → Mark as abandoned
  │
  ├─→ 30 days → Filing archived
  │   │
  │   └─→ Email: "Your filing was archived due to inactivity"
  │       User can reactivate
  │
  └─→ 6 months → Data deleted (per retention policy)
```

---

## 4. Email Trigger Matrix

### Trigger Points & Templates

```
┌────────────────┬──────────────┬────────────┬──────────────────────────┐
│ Event          │ Trigger Time │ Recipient  │ Template                 │
├────────────────┼──────────────┼────────────┼──────────────────────────┤
│ Welcome        │ Signup       │ User       │ welcome_email            │
│ Verify Email   │ Email verify │ User       │ verify_email_link        │
│ Abandoned (1)  │ 24h inactive │ User       │ abandoned_reminder_24h   │
│ Abandoned (2)  │ 72h inactive │ User       │ abandoned_reminder_72h   │
│ Payment OK     │ Payment OK   │ User       │ payment_confirmation     │
│ Filing Submit  │ +1 hour      │ User       │ filing_submitted         │
│ Filing Approve │ State OK     │ User       │ filing_approved          │
│ Filing Reject  │ State reject │ User       │ filing_rejected          │
│ AR Reminder 60 │ -60 days     │ User       │ annual_report_60d        │
│ AR Reminder 30 │ -30 days     │ User       │ annual_report_30d        │
│ AR Reminder 3  │ -3 days      │ User       │ annual_report_final      │
│ AR Filed       │ After submit │ User       │ annual_report_filed      │
│ Admin Alert    │ Error/issue  │ Admin      │ admin_alert_email        │
│ Compliance     │ Issue found  │ User       │ compliance_alert         │
└────────────────┴──────────────┴────────────┴──────────────────────────┘
```

---

## 5. Implementation Checklist

### Phase 1: MVP (Months 1-3) - Florida LLC

#### Frontend (React/Next.js)
- [ ] Landing page with pricing & features
- [ ] User registration & login flow
- [ ] Email verification flow
- [ ] 12-step LLC incorporation form with validation
  - [ ] Step 1: Entity type & state selection
  - [ ] Step 2: Business name with real-time availability check
  - [ ] Step 3: Tier selection with comparison
  - [ ] Step 4: Principal address with autocomplete
  - [ ] Step 5: Mailing address (same/different)
  - [ ] Step 6: Registered agent info
  - [ ] Step 7: Members list
  - [ ] Step 8: Correspondence email
  - [ ] Step 9: Optional details
  - [ ] Step 10: Review & signature
  - [ ] Step 11: Ancillary services upsell
  - [ ] Step 12: Payment checkout
- [ ] Form progress indicator
- [ ] Form recovery/resume capability
- [ ] Payment form (Stripe.js integration)
- [ ] Success page with document links
- [ ] User dashboard (filings list, documents, status)
- [ ] Mobile responsive design
- [ ] Accessibility (WCAG 2.1 AA)
- [ ] Form analytics tracking

#### Backend (FastAPI/Python)
- [ ] User authentication (register, login, email verify)
- [ ] Filing CRUD operations
- [ ] Form step persistence (auto-save)
- [ ] Name availability check (local DB + scraper fallback)
- [ ] Stripe PaymentIntent creation & webhook handling
- [ ] Articles of Organization PDF generation
- [ ] S3 document upload & storage
- [ ] Email notification system (SendGrid integration)
- [ ] SunBiz e-filing automation (Playwright)
- [ ] Database schema implementation (PostgreSQL)
- [ ] API endpoint implementation (all endpoints in section 2)
- [ ] Error handling & logging
- [ ] Rate limiting
- [ ] Input validation

#### Database
- [ ] Create all tables (users, filings, payments, etc.)
- [ ] Set up indexes for performance
- [ ] Configure encryption for sensitive fields
- [ ] Set up automatic backups

#### Integrations
- [ ] Stripe API (PaymentIntent, webhooks)
- [ ] SendGrid email service
- [ ] SunBiz bulk data ingest (nightly cron)
- [ ] SunBiz e-filing automation (Playwright)
- [ ] Google Places API (address autocomplete)

#### Admin Dashboard (Minimal MVP)
- [ ] Filing list with filters
- [ ] Filing detail view
- [ ] Manual filing approval
- [ ] Basic analytics (total filings, conversion rate)

#### Testing
- [ ] Unit tests (backend functions)
- [ ] Integration tests (API endpoints)
- [ ] Form flow E2E tests
- [ ] Payment flow testing (Stripe test cards)
- [ ] SunBiz sandbox testing
- [ ] Load testing (target 100 concurrent users)

#### Documentation
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Database schema documentation
- [ ] Deployment guide
- [ ] Runbook for common issues

#### Deployment
- [ ] Docker containerization
- [ ] AWS infrastructure setup (ECS, RDS, S3, etc.)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Monitoring & logging (Sentry, DataDog)
- [ ] HTTPS/TLS certificates

#### Compliance & Security
- [ ] Terms of Service
- [ ] Privacy Policy
- [ ] PCI compliance (Stripe tokenization)
- [ ] HTTPS enforcement
- [ ] CSRF protection
- [ ] Rate limiting on sensitive endpoints
- [ ] Admin audit logging

---

### Phase 2: Enhanced Features (Months 4-6)

#### Corporation Support
- [ ] Corporation form flow (differences from LLC)
- [ ] Articles of Incorporation template
- [ ] State-specific requirements (authorized shares, etc.)

#### Ancillary Services
- [ ] Operating Agreement generation (Jinja2 templates)
- [ ] EIN acquisition form (auto-fill SS-4)
- [ ] Domain registration integration (Namecheap API)
- [ ] Certificate/Copy ordering

#### Premium Tier & Compliance
- [ ] Annual report reminders (email alerts)
- [ ] Managed annual report filing
- [ ] Registered agent service offering
- [ ] Compliance calendar on dashboard

#### Advanced Admin Features
- [ ] Funnel analysis (where do users abandon?)
- [ ] Cohort analysis (acquisition source tracking)
- [ ] Revenue reports (by tier, service, state)
- [ ] User analytics (LTV, CAC, retention)
- [ ] Custom report generation & export

#### Email Enhancements
- [ ] Abandonment detection & reminders
- [ ] Template testing & A/B variants
- [ ] Scheduled email delivery
- [ ] Email open/click tracking (SendGrid webhooks)

---

### Phase 3: Multi-State Expansion (Months 7-12)

#### Multi-State Support
- [ ] State configuration management (fees, requirements)
- [ ] Per-state bulk data ingestion
- [ ] Per-state e-filing automation (Playwright scripts)
- [ ] State-specific form fields & requirements
- [ ] State-specific pricing tier configuration

#### Multi-State Testing
- [ ] Test with 5 states (CA, NY, TX, IL, + FL)
- [ ] SunBiz sandbox testing for each state
- [ ] State-specific requirements validation

#### Multi-State Admin
- [ ] State-specific dashboards
- [ ] Multi-state analytics aggregation
- [ ] State-specific user management

---

### Phase 4: Advanced Features (Months 13+)

#### B2B API
- [ ] RESTful API authentication (API keys)
- [ ] API rate limiting & quotas
- [ ] Partner onboarding process
- [ ] API documentation & SDKs

#### White-Label
- [ ] Configurable branding (colors, logo, domain)
- [ ] White-label admin portal
- [ ] Custom domain support

#### Integrations
- [ ] QuickBooks integration
- [ ] Xero integration
- [ ] Accounting software APIs

---

## 6. Key Metrics & KPIs

### User Acquisition & Engagement

| Metric | Target | Notes |
|--------|--------|-------|
| Monthly Active Users (MAU) | 500 (Y1) → 5K (Y2) | Registered users who complete filing |
| New User Signups | 200/month (Y1) | Compound growth 15-20% |
| Email Verification Rate | 95%+ | Bounce handling |
| Conversion Rate (Started → Paid) | 30%+ | Form completion |
| Average Order Value | $180 → $250 | Ancillary service adoption |

### Form Completion

| Metric | Target | Notes |
|--------|--------|-------|
| Form Abandonment Rate | <25% | Identify drop-off steps |
| Avg Time to Complete | 15-20 minutes | From start to payment |
| Form Error Rate | <5% | Invalid inputs |
| Validation Error Resubmit Rate | <10% | Users fixing errors |

### Payment & Revenue

| Metric | Target | Notes |
|--------|--------|-------|
| Payment Success Rate | 95%+ | Cards declined, retries |
| Failed Card Decline Rate | <5% | Legitimate declines |
| Refund Rate | 5-10% | As % of transactions |
| Average Revenue Per User (ARPU) | $180 → $250 | All services combined |
| Registered Agent Adoption | 40% → 60% | % of users upgrading |

### State Filing

| Metric | Target | Notes |
|--------|--------|-------|
| SunBiz Filing Success Rate | 95%+ | First-time approval |
| Name Conflict Rate | <2% | Name taken during submit |
| Payment Failures | <1% | Amount mismatch, declined |
| Avg Time to State Approval | 1-2 days | State processing |

### Compliance

| Metric | Target | Notes |
|--------|--------|-------|
| Annual Report Reminder Effectiveness | 85%+ | Users filing by deadline |
| Late Filing Rate | <5% | Users missing deadline |
| Managed Annual Report Adoption | 20%+ | % purchasing service |
| Churn Rate (Annual) | <10% | Customers discontinuing |

### Support & Satisfaction

| Metric | Target | Notes |
|--------|--------|-------|
| Customer Support Response Time | <24 hours | Email response |
| Support Ticket Volume | <10% of users | Issues per user |
| NPS (Net Promoter Score) | 50+ | Customer satisfaction |
| Customer Satisfaction (CSAT) | 85%+ | Post-service survey |

---

## 7. Troubleshooting Quick Guide

### Common Issues & Solutions

#### Issue: Name Availability Check Always Returns Unavailable

**Symptoms:** User sees "Name unavailable" even for new names

**Diagnosis:**
```bash
# Check if scraper is working
curl 'https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?inquiryType=EntityName&searchNameOrder=TESTACME&searchTerm=TESTACME'

# Check if response contains "Just a moment"
grep "Just a moment" response.html && echo "Cloudflare challenge detected"

# Check local DB
psql -d incorporation_app -c "SELECT name FROM sunbiz_entities WHERE name ILIKE '%TESTACME%';"
```

**Solutions:**
1. Cloudflare blocking:  
   - Switch to cloudscraper library
   - Use residential proxy rotation
   - Increase request delay

2. Local DB stale:
   - Check last FTP ingest timestamp
   - Force manual data refresh
   - Use bulk data file directly

3. Name normalization issue:
   - Check if suffix is being compared correctly
   - Verify regex for punctuation removal

**Code Fix:**
```python
# Use bulk data as primary source
def check_availability_with_fallback(name, state='FL'):
    # Try local bulk data first
    local_result = check_local_db(name, state)
    if local_result is not None:
        return local_result
    
    # If local data is stale (>24h), try live scrape
    if bulk_data_age > timedelta(hours=24):
        live_result = scrape_sunbiz_live(name, state)
        if live_result:
            cache_result(name, state, live_result)
            return live_result
    
    # Default to available if can't determine
    return {'available': True, 'cached': False}
```

---

#### Issue: E-Filing Submission Fails with "Name Conflicts"

**Symptoms:** User completes form, pays, but filing rejected with "Name already exists"

**Root Cause:** Name became unavailable between user's check (Step 2) and e-filing submission (1 hour later)

**Solutions:**
1. Increase name check cache from 24h to 1h before expiration
2. Before final e-filing, re-check name availability
3. Have fallback approved name suggestions

**Code Fix:**
```python
async def submit_filing_with_name_recheck(filing_id):
    filing = db.get(Filing, filing_id)
    
    # Re-check name availability before submitting
    availability = check_availability(filing.business_name)
    
    if not availability['available']:
        # Email user with alternatives
        alternatives = suggest_alternatives(filing.business_name)
        email_service.queue_email('filing_name_conflict', filing.user.email, {
            'business_name': filing.business_name,
            'alternatives': alternatives
        })
        
        # Mark filing as needing name update
        filing.status = 'name_unavailable'
        db.commit()
        return False
    
    # Proceed with e-filing
    return await submit_to_sunbiz(filing)
```

---

#### Issue: Stripe Payment Fails with "Invalid API Key"

**Symptoms:** Payment processing fails, user sees error

**Diagnosis:**
```bash
# Check if API key is set correctly
echo $STRIPE_API_KEY | head -c 10

# Verify key is live (not test)
grep -E "^sk_live_" <<< $STRIPE_API_KEY && echo "Live key" || echo "Test key"

# Test API key
curl https://api.stripe.com/v1/balance \
  -u $STRIPE_API_KEY: \
  | jq '.available'
```

**Solutions:**
1. Ensure live API key (not test key) is deployed
2. Verify API key in AWS Secrets Manager
3. Check key permissions (should have payments, webhooks)

**Code Fix:**
```python
# Use environment-based key selection
import os

STRIPE_ENV = os.getenv('ENVIRONMENT', 'test')

if STRIPE_ENV == 'production':
    STRIPE_API_KEY = os.getenv('STRIPE_API_KEY_LIVE')
    assert STRIPE_API_KEY.startswith('sk_live_')
else:
    STRIPE_API_KEY = os.getenv('STRIPE_API_KEY_TEST')
    assert STRIPE_API_KEY.startswith('sk_test_')

stripe.api_key = STRIPE_API_KEY
```

---

#### Issue: Annual Report Emails Not Sending

**Symptoms:** Users don't receive annual report reminders

**Diagnosis:**
```sql
-- Check if reminders were queued
SELECT COUNT(*) FROM email_notifications 
WHERE notification_type LIKE 'annual_report%' 
AND created_at > NOW() - INTERVAL '24 hours';

-- Check if any failed
SELECT * FROM email_notifications 
WHERE notification_type = 'annual_report_reminder_60'
AND status = 'failed' 
LIMIT 5;

-- Check if due dates are correct
SELECT filing_id, report_year, due_date 
FROM annual_reports 
WHERE due_date = CURRENT_DATE + INTERVAL '60 days'
LIMIT 5;
```

**Solutions:**
1. Check cron job execution:
   ```bash
   ps aux | grep annual_report_cron
   grep -n "annual_report" /var/log/cron
   ```

2. Check SendGrid API key:
   ```python
   from sendgrid import SendGridAPIClient
   sg = SendGridAPIClient(SENDGRID_API_KEY)
   try:
       response = sg.client.mail.validate.send.post(
           request_body={"from": {"email": "test@example.com"}, ...}
       )
   except Exception as e:
       print(f"SendGrid error: {e}")
   ```

3. Verify email templates exist in SendGrid

**Code Fix:**
```python
# Add logging to cron job
import logging

logger = logging.getLogger('annual_report')

async def send_annual_report_reminders():
    logger.info("Starting annual report reminder job")
    
    due_soon = db.query(AnnualReport).filter(
        AnnualReport.due_date == datetime.now() + timedelta(days=60),
        AnnualReport.reminder_60_sent == False
    ).all()
    
    logger.info(f"Found {len(due_soon)} annual reports due in 60 days")
    
    for report in due_soon:
        try:
            email_service.queue_email('annual_report_reminder_60', ...)
            report.reminder_60_sent = True
            db.commit()
            logger.info(f"Queued reminder for report {report.report_id}")
        except Exception as e:
            logger.error(f"Failed to queue reminder: {e}", exc_info=True)
```

---

#### Issue: Database Connections Exhausted

**Symptoms:** "Too many connections" error, app becomes unresponsive

**Diagnosis:**
```sql
-- Check active connections
SELECT datname, usename, application_name, state, count(*)
FROM pg_stat_activity 
GROUP BY datname, usename, application_name, state;

-- Find long-running queries
SELECT pid, usename, application_name, state, query, query_start
FROM pg_stat_activity 
WHERE state != 'idle' 
ORDER BY query_start;
```

**Solutions:**
1. Increase connection pool size:
   ```python
   from sqlalchemy.pool import QueuePool
   engine = create_engine(
       DATABASE_URL,
       poolclass=QueuePool,
       pool_size=20,
       max_overflow=40
   )
   ```

2. Kill idle connections:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle' AND query_start < NOW() - INTERVAL '10 minutes';
   ```

3. Check for connection leaks in code:
   ```python
   # Always close connections
   try:
       conn = db.connect()
       # ... query ...
   finally:
       conn.close()
   
   # Or use context manager
   with db.Session() as session:
       # ... query ...
   ```

---

#### Issue: Slow Form Performance

**Symptoms:** Form pages take >2 seconds to load

**Diagnosis:**
```bash
# Check frontend bundle size
npm run build
du -h build/ | tail -20

# Check API response time
curl -w "@curl-format.txt" -o /dev/null https://api.example.com/api/filings

# Check database query performance
EXPLAIN ANALYZE SELECT * FROM filings WHERE user_id = 'xxx';
```

**Solutions:**
1. Add database indexes:
   ```sql
   CREATE INDEX idx_user_filings ON filings(user_id, created_at DESC);
   CREATE INDEX idx_filing_status ON filings(status);
   ```

2. Reduce bundle size:
   ```bash
   # Analyze bundle
   npm run analyze
   
   # Split code
   dynamic(() => import('@/components/HeavyComponent'))
   ```

3. Cache API responses:
   ```python
   from functools import lru_cache
   
   @lru_cache(maxsize=128)
   def get_pricing_tiers():
       return db.query(PricingTier).all()
   ```

---

### Performance Benchmarks

**Target Response Times:**

| Endpoint | Target | Notes |
|----------|--------|-------|
| Name availability check | <500ms | Cached or local DB |
| Create filing | <100ms | DB write |
| List filings | <200ms | Paginated query |
| Get filing details | <300ms | Single record + relations |
| Create payment intent | <500ms | Stripe API call |
| Form page load | <1s | Frontend + API |

---

## Summary

This quick reference guide provides developers with:
- Database schema overview for rapid understanding
- All API endpoints for integration
- User journey flows for UI implementation
- Email trigger matrix for marketing automation
- Implementation checklist for project management
- Common issues & quick fixes for troubleshooting

**For more details, refer to the comprehensive Developer Guide.**

---

*Last Updated: April 25, 2026*
