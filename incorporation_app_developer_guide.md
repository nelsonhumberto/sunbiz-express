# Business Incorporation Web Application - Developer Handoff Guide

**Date:** April 25, 2026  
**Target Platform:** External Development (not Abacus AI)  
**Version:** 1.0  
**Status:** Ready for Development

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Complete Database Schema](#2-complete-database-schema)
3. [Feature Specifications](#3-feature-specifications)
4. [User Flow Diagrams and Descriptions](#4-user-flow-diagrams)
5. [Data Collection Requirements](#5-data-collection-requirements)
6. [API Integration Specifications](#6-api-integration-specifications)
7. [Scraping and Automation Implementation](#7-scraping-and-automation)
8. [Document Generation](#8-document-generation)
9. [Email Notification System](#9-email-notification-system)
10. [Security Considerations](#10-security-considerations)
11. [Recommended Tech Stack](#11-recommended-tech-stack)
12. [Pricing Recommendations](#12-pricing-recommendations)
13. [Development Phases](#13-development-phases)
14. [Testing Strategy](#14-testing-strategy)
15. [Compliance and Legal Considerations](#15-compliance-and-legal-considerations)

---

## 1. Executive Summary

### 1.1 Project Overview

This is a web-based business incorporation service platform that simplifies the process of forming Limited Liability Companies (LLCs) and Corporations. The platform will automate document generation, state filing submission, and compliance tracking while providing ancillary services such as registered agent representation, domain registration, and EIN acquisition.

**Initial Scope:** Florida incorporation, with future expansion to all 50 U.S. states.

### 1.2 Business Model

The platform generates revenue through multiple streams:

1. **Formation Fees** - Charged to users at point of incorporation:
   - Basic packages (starter tier, minimal features): $0 + state fees
   - Mid-tier packages: $99-$199 + state fees
   - Premium packages: $299-$399 + state fees

2. **Ancillary Service Upsells:**
   - Registered Agent Service: $119-$249/year (first year often free or included)
   - EIN Acquisition: $50-$99 (one-time)
   - Operating Agreement Templates: $50-$99 (one-time)
   - Domain Registration: $8.99-$15.99/year (with markup)
   - S-Corp Election (Form 2553): $99-$149 (one-time)
   - Business Licenses: $50-$150 (varies by state)
   - Compliance Alerts: $99-$299/year (recurring)

3. **Recurring Services:**
   - Annual Report Filing: $99-$199/year
   - Registered Agent Renewal: $119-$249/year
   - Compliance Monitoring: $99-$299/year

4. **Data and Analytics:**
   - Anonymized business formation trends
   - Market research reports for B2B customers

### 1.3 Target Market

**Primary (Year 1):** Florida entrepreneurs forming LLCs and small corporations
- Age: 25-55
- Income: $50K-$250K+
- Characteristics: Tech-savvy, price-conscious but quality-aware
- Volume Target: 500-1,000 formations/month by end of Year 1

**Secondary:** Registered agents, bookkeepers, and small business accountants using the platform as a white-label service

**Tertiary (Future):** Multi-state expansion to all 50 states; potential B2B partnerships with CRM platforms, accounting software, and financial institutions

### 1.4 Key Differentiators

1. **Simplicity & Speed:** Multi-step questionnaire reduces complexity from typical 45+ minute process to 15-20 minutes
2. **Transparency:** Clear, itemized pricing with no hidden fees (unlike LegalZoom)
3. **Automation:** Integrated name availability checking, document generation, and state filing submission
4. **Compliance Partner:** Automated annual report reminders and managed filing service
5. **Modern Tech Stack:** Mobile-responsive, accessible UI with real-time validation
6. **Privacy-First Approach:** Optional registered agent service protects personal information
7. **API-First Design:** Future B2B partnerships enabled through RESTful APIs

### 1.5 Revenue Projections (Conservative Estimates)

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| Monthly Formations | 100 → 1,000 | 1,000 → 5,000 | 5,000 → 15,000 |
| Avg Revenue per Formation | $180 | $220 | $250 |
| Monthly Revenue | $18K → $180K | $220K → $1.1M | $1.25M → $3.75M |
| Annual Registered Agent Renewals | 500 → 8,000 | 12,000 → 50,000 | 55,000 → 150,000 |
| Annual Compliance Subscription Growth | 5% | 15% | 25% |

---

## 2. Complete Database Schema

### 2.1 Database Choice & Technology

**Primary Database:** PostgreSQL (Supabase or self-hosted)
- Excellent relational integrity for complex business data
- Strong JSONB support for flexible document storage
- Mature, battle-tested, excellent performance
- Excellent for future state expansion

**Supporting Services:**
- **Object Storage:** AWS S3 or Supabase Storage for documents (Articles of Organization, Operating Agreements, etc.)
- **Cache:** Redis for session management, rate limiting, and temporary data
- **Search:** PostgreSQL full-text search (initially) or Elasticsearch for future scaling

### 2.2 Core Tables

#### users
Stores user account information and authentication credentials.

```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  email_verified BOOLEAN DEFAULT FALSE,
  email_verification_token VARCHAR(255),
  email_verification_token_expires TIMESTAMP,
  password_reset_token VARCHAR(255),
  password_reset_token_expires TIMESTAMP,
  account_status ENUM('active', 'suspended', 'deleted') DEFAULT 'active',
  
  INDEX idx_email (email),
  INDEX idx_created_at (created_at),
  INDEX idx_account_status (account_status)
);
```

#### filings
Tracks all incorporation filings and their current status.

```sql
CREATE TABLE filings (
  filing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  business_name VARCHAR(255) NOT NULL,
  entity_type ENUM('LLC', 'Corporation') NOT NULL,
  state VARCHAR(2) NOT NULL DEFAULT 'FL',
  status ENUM('draft', 'submitted', 'approved', 'rejected', 'abandoned') DEFAULT 'draft',
  
  -- Filing details
  principal_address_street1 VARCHAR(255),
  principal_address_street2 VARCHAR(255),
  principal_address_city VARCHAR(100),
  principal_address_state VARCHAR(2),
  principal_address_zip VARCHAR(10),
  
  mailing_address_street1 VARCHAR(255),
  mailing_address_street2 VARCHAR(255),
  mailing_address_city VARCHAR(100),
  mailing_address_state VARCHAR(2),
  mailing_address_zip VARCHAR(10),
  
  registered_agent_name VARCHAR(255),
  registered_agent_email VARCHAR(255),
  registered_agent_address_street1 VARCHAR(255),
  registered_agent_address_street2 VARCHAR(255),
  registered_agent_address_city VARCHAR(100),
  registered_agent_address_state VARCHAR(2),
  registered_agent_address_zip VARCHAR(10),
  registered_agent_signature_name VARCHAR(255),
  registered_agent_signature_timestamp TIMESTAMP,
  
  -- Corporate-specific
  authorized_shares INT,
  incorporator_name VARCHAR(255),
  incorporator_signature_name VARCHAR(255),
  incorporator_signature_timestamp TIMESTAMP,
  
  -- Filing metadata
  sunbiz_filing_number VARCHAR(50),
  sunbiz_tracking_number VARCHAR(12),
  sunbiz_pin VARCHAR(4),
  sunbiz_submitted_at TIMESTAMP,
  sunbiz_approved_at TIMESTAMP,
  sunbiz_rejection_reason TEXT,
  
  effective_date DATE,
  correspondence_email VARCHAR(255),
  correspondence_phone VARCHAR(20),
  
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_business_name (business_name),
  INDEX idx_state (state),
  INDEX idx_entity_type (entity_type),
  INDEX idx_created_at (created_at),
  INDEX idx_sunbiz_filing_number (sunbiz_filing_number),
  UNIQUE (sunbiz_filing_number)
);
```

#### filing_steps
Tracks the user's progress through the multi-step incorporation form.

```sql
CREATE TABLE filing_steps (
  step_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID NOT NULL REFERENCES filings(filing_id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  step_name VARCHAR(100) NOT NULL,
  completed_at TIMESTAMP,
  data_snapshot JSONB,
  
  INDEX idx_filing_id (filing_id),
  INDEX idx_step_number (filing_id, step_number),
  UNIQUE (filing_id, step_number)
);
```

#### managers_members
Stores member/manager information for LLCs.

```sql
CREATE TABLE managers_members (
  manager_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID NOT NULL REFERENCES filings(filing_id) ON DELETE CASCADE,
  title ENUM('MGR', 'MGRM', 'AMBR', 'AP') NOT NULL,
  name VARCHAR(255) NOT NULL,
  address_street1 VARCHAR(255),
  address_street2 VARCHAR(255),
  address_city VARCHAR(100),
  address_state VARCHAR(2),
  address_zip VARCHAR(10),
  address_country VARCHAR(2) DEFAULT 'US',
  ownership_percentage DECIMAL(5, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_filing_id (filing_id)
);
```

#### payments
Tracks payment transactions via Stripe.

```sql
CREATE TABLE payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID NOT NULL REFERENCES filings(filing_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id),
  
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_charge_id VARCHAR(255),
  
  amount_cents INT NOT NULL,
  amount_currency VARCHAR(3) DEFAULT 'USD',
  
  status ENUM('pending', 'succeeded', 'failed', 'cancelled', 'refunded') DEFAULT 'pending',
  
  -- Breakdown
  state_filing_fee_cents INT,
  formation_service_fee_cents INT,
  registered_agent_year_one_cents INT,
  operating_agreement_cents INT,
  domain_registration_cents INT,
  certificates_copies_cents INT,
  other_services_cents INT,
  
  error_message TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  refunded_at TIMESTAMP,
  
  INDEX idx_filing_id (filing_id),
  INDEX idx_user_id (user_id),
  INDEX idx_stripe_payment_intent_id (stripe_payment_intent_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);
```

#### documents
Stores generated documents (Articles of Organization, Operating Agreements, etc.).

```sql
CREATE TABLE documents (
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID NOT NULL REFERENCES filings(filing_id) ON DELETE CASCADE,
  
  document_type ENUM(
    'articles_of_organization',
    'articles_of_incorporation',
    'operating_agreement',
    'certification_of_status',
    'certified_copy',
    'filing_receipt'
  ) NOT NULL,
  
  title VARCHAR(255),
  
  s3_bucket VARCHAR(255),
  s3_key VARCHAR(255),
  s3_url VARCHAR(1000),
  
  file_size_bytes INT,
  mime_type VARCHAR(50),
  
  generated_at TIMESTAMP,
  uploaded_at TIMESTAMP,
  downloaded_count INT DEFAULT 0,
  last_downloaded_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_filing_id (filing_id),
  INDEX idx_document_type (document_type),
  INDEX idx_created_at (created_at)
);
```

#### states
Stores state-specific configuration, requirements, and fees.

```sql
CREATE TABLE states (
  state_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code VARCHAR(2) UNIQUE NOT NULL,
  state_name VARCHAR(100) NOT NULL,
  
  -- Fees
  llc_filing_fee_cents INT,
  corporation_filing_fee_cents INT,
  registered_agent_fee_cents INT,
  annual_report_fee_cents INT,
  
  -- Processing
  standard_processing_days INT,
  express_processing_days INT DEFAULT NULL,
  express_processing_fee_cents INT DEFAULT NULL,
  
  -- Rules & requirements
  requires_annual_report BOOLEAN DEFAULT TRUE,
  annual_report_due_month INT,
  annual_report_due_day INT,
  annual_report_late_fee_cents INT,
  
  allows_online_filing BOOLEAN DEFAULT TRUE,
  
  -- Operational
  enabled BOOLEAN DEFAULT FALSE,
  supported BOOLEAN DEFAULT FALSE,
  sunbiz_api_base_url VARCHAR(255),
  formation_wizard_url VARCHAR(255),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_state_code (state_code),
  INDEX idx_enabled (enabled)
);
```

#### pricing_tiers
Defines service packages and pricing.

```sql
CREATE TABLE pricing_tiers (
  tier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name VARCHAR(100) NOT NULL,
  tier_slug VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  
  display_order INT,
  
  -- Pricing
  base_price_cents INT NOT NULL,
  
  -- Included features (JSONB)
  included_features JSONB DEFAULT '{}',
  
  -- Feature flags
  includes_registered_agent_year_one BOOLEAN DEFAULT FALSE,
  includes_operating_agreement BOOLEAN DEFAULT FALSE,
  includes_expedited_processing BOOLEAN DEFAULT FALSE,
  includes_certified_copy BOOLEAN DEFAULT FALSE,
  includes_certificate_of_status BOOLEAN DEFAULT FALSE,
  
  entity_types JSONB DEFAULT '["LLC", "Corporation"]',
  applicable_states JSONB DEFAULT '["FL"]',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_slug (tier_slug)
);
```

#### additional_services
Defines ancillary services that can be added to filings.

```sql
CREATE TABLE additional_services (
  service_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name VARCHAR(100) NOT NULL,
  service_slug VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  
  -- Pricing
  price_cents INT NOT NULL,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_interval ENUM('monthly', 'quarterly', 'annually') DEFAULT 'annually',
  
  -- Availability
  applicable_entity_types JSONB DEFAULT '["LLC", "Corporation"]',
  applicable_states JSONB DEFAULT '["FL"]',
  
  display_order INT,
  enabled BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_slug (service_slug),
  INDEX idx_enabled (enabled)
);
```

#### filing_additional_services
Junction table linking filings to purchased additional services.

```sql
CREATE TABLE filing_additional_services (
  filing_service_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID NOT NULL REFERENCES filings(filing_id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES additional_services(service_id),
  
  quantity INT DEFAULT 1,
  price_cents INT,
  purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  renewal_date TIMESTAMP,
  expiration_date TIMESTAMP,
  status ENUM('pending', 'active', 'expired', 'cancelled') DEFAULT 'pending',
  
  INDEX idx_filing_id (filing_id),
  INDEX idx_service_id (service_id),
  INDEX idx_status (status)
);
```

#### registered_agent_services
Stores registered agent service information.

```sql
CREATE TABLE registered_agent_services (
  agent_service_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID NOT NULL REFERENCES filings(filing_id) ON DELETE CASCADE,
  
  service_provider ENUM('internal', 'third_party') DEFAULT 'internal',
  provider_name VARCHAR(255),
  
  agent_name VARCHAR(255),
  agent_email VARCHAR(255),
  agent_phone VARCHAR(20),
  
  office_address_street1 VARCHAR(255),
  office_address_street2 VARCHAR(255),
  office_address_city VARCHAR(100),
  office_address_state VARCHAR(2),
  office_address_zip VARCHAR(10),
  
  start_date DATE,
  renewal_date DATE,
  expiration_date DATE,
  
  status ENUM('active', 'pending', 'expired', 'cancelled') DEFAULT 'pending',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_filing_id (filing_id),
  INDEX idx_status (status)
);
```

#### email_notifications
Tracks email notifications sent to users.

```sql
CREATE TABLE email_notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID REFERENCES filings(filing_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id),
  
  notification_type ENUM(
    'welcome',
    'filing_started',
    'filing_abandoned_reminder',
    'payment_confirmation',
    'documents_ready',
    'filing_submitted',
    'filing_approved',
    'filing_rejected',
    'annual_report_reminder_60',
    'annual_report_reminder_30',
    'annual_report_reminder_final',
    'annual_report_filed',
    'compliance_alert',
    'account_notification'
  ) NOT NULL,
  
  recipient_email VARCHAR(255),
  subject VARCHAR(255),
  template_name VARCHAR(100),
  
  sent_at TIMESTAMP,
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  
  status ENUM('queued', 'sent', 'failed', 'bounced', 'spam') DEFAULT 'queued',
  error_message TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_filing_id (filing_id),
  INDEX idx_notification_type (notification_type),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);
```

#### admin_actions
Audit log for all admin actions and system changes.

```sql
CREATE TABLE admin_actions (
  action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID,
  filing_id UUID REFERENCES filings(filing_id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  
  action_type VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Change tracking
  affected_table VARCHAR(100),
  affected_record_id VARCHAR(255),
  old_values JSONB,
  new_values JSONB,
  
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_admin_user_id (admin_user_id),
  INDEX idx_filing_id (filing_id),
  INDEX idx_user_id (user_id),
  INDEX idx_action_type (action_type),
  INDEX idx_created_at (created_at)
);
```

#### annual_reports
Tracks annual report filings and deadlines.

```sql
CREATE TABLE annual_reports (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID NOT NULL REFERENCES filings(filing_id) ON DELETE CASCADE,
  
  report_year INT NOT NULL,
  due_date DATE NOT NULL,
  
  filed_date DATE,
  sunbiz_filing_number VARCHAR(50),
  
  status ENUM('pending', 'filed', 'overdue', 'delinquent', 'grace_period') DEFAULT 'pending',
  
  -- Costs
  filing_fee_cents INT,
  late_fee_cents INT,
  total_cost_cents INT,
  
  -- Notification tracking
  reminder_60_sent BOOLEAN DEFAULT FALSE,
  reminder_30_sent BOOLEAN DEFAULT FALSE,
  reminder_final_sent BOOLEAN DEFAULT FALSE,
  
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_filing_id (filing_id),
  INDEX idx_report_year (report_year),
  INDEX idx_due_date (due_date),
  INDEX idx_status (status)
);
```

#### analytics_events
Tracks user events for analytics and conversion funnel tracking.

```sql
CREATE TABLE analytics_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  filing_id UUID REFERENCES filings(filing_id),
  
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB,
  
  page_url VARCHAR(1000),
  referrer VARCHAR(1000),
  
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_event_type (event_type),
  INDEX idx_created_at (created_at)
);
```

### 2.3 Key Indexes and Performance Considerations

**Critical Indexes for Common Queries:**

```sql
-- Retrieve user's filings with status
CREATE INDEX idx_user_filings ON filings(user_id, status, created_at DESC);

-- Annual report deadline tracking
CREATE INDEX idx_annual_report_deadlines ON annual_reports(due_date, status);

-- Payment completion tracking
CREATE INDEX idx_payment_completion ON payments(filing_id, status, completed_at);

-- Document retrieval by user
CREATE INDEX idx_document_retrieval ON documents(filing_id, document_type);

-- Email notification tracking
CREATE INDEX idx_notification_tracking ON email_notifications(user_id, notification_type, created_at DESC);

-- Analytics funnel
CREATE INDEX idx_analytics_funnel ON analytics_events(user_id, event_type, created_at);
```

**Partitioning Strategy (for large-scale deployments):**

For datasets exceeding 10M rows:
- Partition `analytics_events` by month (`PARTITION BY RANGE (created_at)`)
- Partition `email_notifications` by quarter
- Partition `admin_actions` by year (for compliance retention)

---

## 3. Feature Specifications

### 3.1 User-Facing Features

#### 3.1.1 Multi-Step Incorporation Questionnaire

The user experience follows a guided wizard with 10-12 logical steps, each collecting specific information and validating real-time.

**Step 1: Welcome & Entity Type Selection**
- User selects entity type: LLC or Corporation
- Brief explanation of differences
- State selection (starting with FL, expandable)
- Estimated timeline and cost display (dynamic based on selections)

**Step 2: Business Name Entry & Availability Check**
- Real-time name availability checker (powered by SunBiz scraping/bulk data)
- Name suggestions if chosen name is unavailable
- Automatic suffix suggestion (LLC, INC, Corp, etc.)
- Availability status cached for 24 hours

**Step 3: Service Tier Selection**
- Display pricing tiers: Basic, Standard, Premium
- Clear comparison table showing included services
- Highlight savings vs. market competitors
- Pre-select mid-tier as recommended (conversion optimization)

**Step 4: Principal Address**
- Street address, city, state, zip collection
- Optional "in care of" field
- USPS address validation via SmartyStreets or similar
- Geolocation auto-population (optional)

**Step 5: Mailing Address**
- "Same as principal" checkbox (pre-checked)
- Alternative address fields if different
- Validate that mailing address is distinct if chosen

**Step 6: Registered Agent Designation**
- Registered agent information collection (name, email, FL address)
- Prominent explanation of registered agent role and responsibilities
- Option to use internal registered agent service (with cost)
- Option to use existing registered agent
- Electronic signature affirmation (typed name = legal signature)

**Step 7: Authorized Members/Officers** (LLC: Managers & Members; Corporation: Directors & Officers)
- Dynamic form for 1-N managers/members
- For each: name, title (MGR/AMBR/AP), address, ownership %
- At least one authorized person required
- UI affordance for multiple entries (add/remove rows)

**Step 8: Correspondence Contact**
- Email address (will receive state approvals, reminders)
- Phone number (optional)
- Validation that email is distinct from user account email if different

**Step 9: Optional Details**
- Effective date selection (default = today; can be up to 90 days in future or 5 days back)
- Corporate-specific (Corporations only): Number of authorized shares (minimum 1)
- LLC-specific (LLCs only): Professional LLC checkbox (if selected, mandatory professional purpose field)
- Business purpose (optional text field)

**Step 10: Review & Confirmation**
- Read-only summary of all entered data
- Prominent verification notice: "I confirm that the above information is true and accurate"
- Electronic signature (typed name of principal)
- Edit buttons to return to specific steps

**Step 11: Ancillary Services Upsell**
- Operating Agreement template purchase ($99)
- First-year registered agent service (if not already selected)
- EIN acquisition ($49)
- Domain registration lookup and purchase
- Certificate of Status ($5 each, qty selector)
- Certified Copies ($30 each, qty selector)
- Annual report filing service (1-year subscription)

**Step 12: Payment**
- Order summary with itemized costs
- State filing fees clearly separated from service fees
- Multiple payment options:
  - Credit card (Visa, Mastercard, Amex, Discover)
  - Future: ACH/bank transfer
- Stripe payment integration with error handling
- PCI compliance via tokenized payment processing

#### 3.1.2 Name Availability Checker

Real-time name availability checking during Step 2 and standalone tool.

**Features:**
- Instant feedback as user types (debounced to 0.5s)
- Color-coded status: Green (available), Yellow (pending), Red (unavailable)
- Detailed message explaining exact conflict (e.g., "Conflicts with active LLC registration")
- Alternative name suggestions using fuzzy matching
- Cache results for 24 hours to reduce API calls
- Fallback to bulk data if live SunBiz scraper fails

**Technical Implementation:**
- Primary: Query local mirror of Florida bulk entity data (updated nightly)
- Fallback: Live scrape of search.sunbiz.org (with cloudscraper for Cloudflare)
- Caching layer: Redis with 24-hour TTL
- Rate limiting: Max 1 request/second per user to prevent abuse

#### 3.1.3 Service Package Selection

Clear visual comparison of pricing tiers.

**Basic (Free Formation + State Fees)**
- LLC Articles of Organization filing
- 1-year registered agent service
- Filing submission to state
- Online tracking portal
- Email notifications at each stage
- Best for: Solo entrepreneurs, tight budgets

**Standard ($99 + State Fees)**
- Everything in Basic, plus:
- Operating Agreement template (single-member or multi-member)
- EIN acquisition from IRS
- 1 Certified Copy of articles
- 1 Certificate of Status
- 30-day expedited processing
- Best for: Small teams, need documentation immediately

**Premium ($299 + State Fees)**
- Everything in Standard, plus:
- Free year of registered agent service (vs. first year only in lower tiers)
- Operating agreement revisions (up to 2)
- Free year of annual report filing service
- Free year of compliance alerts
- Business domain name registration (1 year, .com/.net/.org only)
- Priority email support
- Best for: Growth-focused businesses, need ongoing compliance support

#### 3.1.4 Upsell Options During Checkout

After user confirms filing details, present contextual upsells based on selections and historical conversion data.

**Presented in Order of Conversion Rate:**
1. **Registered Agent Service** (if not included in tier)
   - "Don't want your home address public? Use our registered agent service"
   - First year: $0 (free) or $119/year depending on tier
   - Renewal: $119/year thereafter

2. **Operating Agreement** (if not included in tier)
   - "Most banks require this document before opening a business account"
   - One-time: $49-$99 depending on complexity
   - Option to generate customized vs. template

3. **EIN (Employer Identification Number)**
   - "Need to hire employees or open a bank account? Get your EIN instantly"
   - One-time: $49 (IRS provides it free, but we handle paperwork)
   - Auto-fill SS-4 form and submit to IRS

4. **Domain Registration**
   - "Secure your brand online"
   - Integration with Namecheap API for .com, .net, .org, .biz, etc.
   - Yearly: $8.99-$18.99 depending on TLD
   - Show availability before checkout

5. **Annual Compliance Service**
   - "Never miss a filing deadline or penalty"
   - Automated reminders for annual reports, franchise taxes
   - Annual: $199

6. **Certificate of Status** (additional copies)
   - "Need proof your business is in good standing?"
   - Each: $5.00
   - Quantity selector (0-9)

#### 3.1.5 Payment Processing

Stripe-integrated payment workflow.

**Payment Flow:**
1. Display itemized invoice
2. Show accepted payment methods (credit cards)
3. One-time card entry (no tokenization on our server)
4. 3D Secure prompt if required by Stripe
5. Success confirmation with receipt
6. Email receipt with transaction details
7. Error handling with retry mechanism

**Error Handling:**
- Insufficient funds: "Your card was declined. Please verify details and try again."
- Network error: "We experienced a connection issue. Please try again or contact support."
- Timeout: "The payment request timed out. Your card was not charged. Please try again."
- Duplicate charge protection: Idempotency keys prevent double-charging on retry

#### 3.1.6 Document Generation & Delivery

**Documents Generated:**
- Articles of Organization/Incorporation (auto-generated from form data)
- Operating Agreement (if purchased)
- Filing receipt (PDF with filing number, date, cost)

**Delivery Channels:**
1. **Instant download** after payment (within 5 seconds)
2. **Email delivery** (immediate, with direct links)
3. **User dashboard** (persistent access, never expires)
4. **S3 backup** (private, user-only access via signed URLs)

**File Formats:**
- PDF (primary, for printing/signing)
- Future: Word format for customization

#### 3.1.7 User Dashboard

Post-registration portal showing filing status, documents, and compliance information.

**Dashboard Components:**

1. **Filing Status Widget**
   - Current filing status (Draft, Submitted, Approved, Rejected, Abandoned)
   - Progress indicator (X of 12 steps completed)
   - Time to completion estimate
   - "Resume" button if draft

2. **Recent Filings List**
   - Table: Business Name, Entity Type, State, Status, Filed Date, Actions
   - Sortable/filterable
   - Quick actions: View details, Download documents, Make changes

3. **Compliance Calendar**
   - Upcoming annual report deadlines
   - Registered agent renewal dates
   - Franchise tax deadlines (state-specific)
   - Visual indicator (Red = 30 days or less, Yellow = 60 days, Green = OK)

4. **Documents**
   - All generated documents in chronological order
   - Quick download links
   - File size and format info
   - Re-generate option (for signature/reprint)

5. **Registered Agent Info**
   - Current agent name, address, phone, email
   - Service status (Active, Expiring Soon, Expired)
   - Change agent button (triggers amendment process)
   - Renewal button (if service is included)

6. **Annual Report Status**
   - Next annual report due date
   - Filing status (Pending, Filed, Overdue)
   - Cost estimate
   - "File Now" button (if enabled)

7. **Account Settings**
   - Email address, phone, password
   - Notification preferences
   - Saved addresses (for future filings)
   - Download account data (GDPR compliance)

8. **Support & Resources**
   - FAQ accordion
   - Live chat widget (future)
   - Contact support button
   - State-specific compliance guides

#### 3.1.8 Email Notifications

Automated email triggers at key milestones (see Section 9 for details).

### 3.2 Admin Dashboard Features

**Access Control:** Admin-only users with specific role-based permissions (Super Admin, State Manager, Support Agent, Finance).

#### 3.2.1 Filing Management

**Filing List View**
- Table with columns: Business Name, User Email, Entity Type, State, Status, Filed Date, Actions
- Advanced filters:
  - Status: Draft, Submitted, Approved, Rejected, Abandoned
  - Date range (created, submitted, approved)
  - State: FL (future: all states)
  - Entity type: LLC, Corporation
  - Pricing tier
  - Search by business name, user email, filing number
- Bulk actions: Mark as approved, send email, export list
- Pagination and sorting

**Filing Detail View**
- All collected form data in read-only format
- Timeline of status changes
- Manual notes field (admin-only)
- Payment information
- Associated documents
- Manual state filing submission option (if automated submission fails)
- Quick actions:
  - Approve filing (mark as approved, queue document generation)
  - Reject filing (capture rejection reason, send email)
  - Resend notifications
  - View user details

#### 3.2.2 Filing Analytics Dashboard

**Key Metrics (with trend lines and year-over-year comparison):**
- Total filings: Count and growth rate
- Conversion rate: Started form → Completed filing / Started form
- Abandonment rate: Started form → Abandoned
- Average time to completion: Time from start to payment
- Revenue metrics:
  - Total revenue (by month/quarter/year)
  - Average revenue per filing
  - Revenue by service tier (pie chart)
  - Revenue by ancillary service
- Service mix breakdown:
  - % LLCs vs. Corporations
  - % single-member vs. multi-member LLCs
  - Registered agent adoption rate
  - Domain registration adoption rate

**Funnel Visualization:**
- Step-by-step abandonment rates
- Identify problematic steps (e.g., if 40% abandon at payment step, investigate payment issues)
- User cohort analysis (by acquisition channel, tier selected, etc.)

**Geographic Analysis:**
- Map of filings by state (once multi-state is live)
- Top 10 cities/counties in FL

#### 3.2.3 Manual E-Filing Submission Interface

If automated submission fails, admin can manually submit to state.

**Features:**
- Filing detail view with editable fields for SunBiz submission
- Form validation before submission
- Option to download prepared PDF for manual upload to SunBiz
- Tracking number capture and storage
- Notification to user of successful submission with receipt

#### 3.2.4 Document Management**

- View all generated documents by filing or user
- Re-generate document (if template changed)
- Manual document upload (for edge cases)
- Audit log of document access and downloads
- Bulk download (export multiple documents as ZIP)

#### 3.2.5 User Management**

- User list (email, account status, filings count, lifetime revenue)
- User detail view (all personal info, filings, payments, support tickets)
- Ban/suspend user (if fraud detected)
- Reset user password
- Manually create filing on behalf of user
- View user activity log (all actions, login history)

#### 3.2.6 Pricing Management**

- Edit pricing tiers (name, description, price, included features)
- Enable/disable tiers by state
- Manage ancillary services (add, edit, delete, price changes)
- Historical pricing tracking (for revenue reporting)
- Price test management (A/B test different pricing)

#### 3.2.7 State Configuration Management**

- Edit state-specific settings:
  - Fees (formation, annual report, registered agent)
  - Processing timelines
  - Regulatory URLs
  - Required fields for that state
- Toggle state on/off (disable filings for certain states)
- Custom messaging per state (e.g., "Florida will process this in 1-2 business days")

#### 3.2.8 Email Template Management**

- Edit pre-defined email templates
- Preview email rendering
- Test send to admin email
- Template variables reference ({{first_name}}, {{business_name}}, etc.)
- Enable/disable specific email types

#### 3.2.9 Reports & Exports**

- Revenue report (by month, state, tier, service)
- Filings report (status breakdown, completion rates, average value)
- User report (acquisition, churn, lifetime value)
- Export as CSV/Excel for financial/accounting teams
- Scheduled report delivery (daily, weekly, monthly to email)

#### 3.2.10 System Health & Monitoring**

- SunBiz API status (green/red indicator)
- Stripe API status
- Email service status
- Database status (query performance)
- Recent errors log (with stack traces, user context, frequency)
- Alert management (set thresholds for error rates, API downtime)

---

## 4. User Flow Diagrams and Descriptions

### 4.1 New User Registration & Onboarding

```
┌─────────────────────────────────────────────────────────────────┐
│ USER FLOW: Registration & Onboarding                           │
└─────────────────────────────────────────────────────────────────┘

START
  │
  ├─→ [Landing Page] Choose: "Start LLC" / "Start Corporation"
  │
  ├─→ [Sign Up] Email, Password, Name
  │   │ Email already exists? → Redirect to login
  │   │ Validation errors? → Show inline errors
  │   │
  │   └─→ Send verification email
  │
  ├─→ [Email Verification] Click link in email
  │   │ Expired/invalid token? → Offer resend
  │   │ Already verified? → Skip
  │   │
  │   └─→ Redirect to dashboard
  │
  ├─→ [Dashboard - First Time] 
  │   │ Show welcome banner
  │   │ Offer guided tour (optional)
  │   │ "Start New Filing" button
  │   │
  │   └─→ Click "Start New Filing"
  │
  └─→ → → → Continue to "Incorporation Workflow" (Section 4.2)
```

### 4.2 Complete Incorporation Process

```
┌─────────────────────────────────────────────────────────────────┐
│ USER FLOW: Complete Incorporation Workflow                      │
└─────────────────────────────────────────────────────────────────┘

START: Step 1 - Welcome & Entity Type
  │
  ├─→ Select: LLC or Corporation
  │
  ├─→ Select State (FL for launch, auto-selectable later)
  │
  ├─→ View pricing tiers and timeline estimate
  │
  ├─→ Click "Continue to Business Name"
  │
  └─→ STEP 1 SAVED (progress indicator shows 1/12)

STEP 2: Business Name & Availability
  │
  ├─→ Enter business name
  │
  ├─→ Real-time availability check (debounced 500ms)
  │   │ Available? → Green checkmark, "This name is available!"
  │   │ Unavailable? → Red X, show conflict (e.g., "Active LLC with this name")
  │   │ Checking? → Yellow spinner
  │   │
  │   └─→ (If unavailable) Offer alternative name suggestions
  │
  ├─→ Suffix auto-populated (LLC, Inc, Corp, etc.) based on entity type
  │
  ├─→ Proceed only if name is available
  │
  └─→ STEP 2 SAVED

STEP 3: Service Tier Selection
  │
  ├─→ Display three columns:
  │   │ [BASIC]    [STANDARD] [PREMIUM]
  │   │ $0         $99        $299
  │   │ + State    + State    + State
  │   │ Features   Features   Features
  │   │ [Select]   [SELECT]   [Select]
  │   │            ← highlighted as recommended
  │   │
  │   └─→ Show detailed comparison (link to table)
  │
  ├─→ Select preferred tier
  │
  └─→ STEP 3 SAVED

STEP 4: Principal Address
  │
  ├─→ Street address field (autocomplete via Google Places API)
  │
  ├─→ City, State, Zip (auto-fill from street selection)
  │
  ├─→ Optional "In Care Of" field
  │
  ├─→ USPS address validation (if typos detected, show suggestion)
  │
  └─→ STEP 4 SAVED

STEP 5: Mailing Address
  │
  ├─→ "Same as principal address" checkbox (pre-checked)
  │
  ├─→ (If unchecked) Show alternate address fields (identical to Step 4)
  │
  └─→ STEP 5 SAVED

STEP 6: Registered Agent Designation
  │
  ├─→ Info box: "A registered agent receives legal documents on behalf of your business."
  │
  ├─→ Choose: "Use our registered agent service" or "Use my own registered agent"
  │
  │   IF "Use our service":
  │   │ ├─→ Display service provider info
  │   │ ├─→ Cost displayed (often $0 first year, then $119/year renewal)
  │   │ └─→ Auto-populate agent details
  │   │
  │   IF "Use my own":
  │   │ ├─→ Enter agent name
  │   │ ├─→ Enter agent email
  │   │ ├─→ Enter Florida street address (NO P.O. boxes)
  │   │ ├─→ Validation: If P.O. box detected → Error "Florida law requires a physical street address"
  │   │ └─→ Confirm: "The registered agent named above accepts this role" (checkbox)
  │   │
  │   └─→ Electronic signature line: "Type the registered agent's full name to confirm:"
  │
  └─→ STEP 6 SAVED

STEP 7: Authorized Members/Officers
  │
  ├─→ (LLC) Show: "Add a Manager or Member"
  │   │ │ Title dropdown: [MGR] [AMBR] [AP]
  │   │ │ Name field
  │   │ │ Address (street, city, state, zip)
  │   │ │ Ownership % field
  │   │ │ [Remove] button (if >1 entry)
  │   │ │ [+ Add Another] button
  │   │ │
  │   │ └─→ Require at least one entry
  │   │
  │   └─→ (Corporation) Show: "Add Directors and Officers"
  │       │ Title dropdown: [President] [VP] [Treasurer] [Secretary] [Director]
  │       │ [Remove] / [+ Add Another] buttons
  │       │
  │       └─→ Require at least one entry
  │
  └─→ STEP 7 SAVED

STEP 8: Correspondence Contact
  │
  ├─→ "State correspondence will be sent to this email"
  │
  ├─→ Email field (may pre-fill with user account email)
  │
  ├─→ Phone field (optional)
  │
  └─→ STEP 8 SAVED

STEP 9: Optional Details
  │
  ├─→ Effective date picker (today, future date up to +90 days, or retroactive up to -5 days)
  │
  ├─→ (Corporation) Authorized shares field: minimum 1 (default 1000)
  │
  ├─→ (Professional LLC) "Professional Limited Liability Company" checkbox
  │   │ └─→ (If checked) Require professional purpose: [Dropdown or text field]
  │   │
  │   └─→ Business purpose field (optional for non-professional)
  │
  └─→ STEP 9 SAVED

STEP 10: Review & Confirmation
  │
  ├─→ Display read-only summary of ALL data in logical sections:
  │   │ ┌─ Business Basics ──────────────────┐
  │   │ │ Business Name: [value]             │
  │   │ │ Entity Type: [value]               │
  │   │ │ Effective Date: [value]            │
  │   │ │ [Edit] link → return to Step 1     │
  │   │ └────────────────────────────────────┘
  │   │
  │   │ ┌─ Addresses ────────────────────────┐
  │   │ │ Principal: [full address]          │
  │   │ │ Mailing: [same/different]          │
  │   │ │ [Edit] link → return to Step 4/5   │
  │   │ └────────────────────────────────────┘
  │   │
  │   │ ┌─ Registered Agent ─────────────────┐
  │   │ │ Name: [value]                      │
  │   │ │ Address: [value]                   │
  │   │ │ Email: [value]                     │
  │   │ │ [Edit] link → return to Step 6     │
  │   │ └────────────────────────────────────┘
  │   │
  │   │ ┌─ Authorized Persons ──────────────┐
  │   │ │ [List with edit/delete buttons]    │
  │   │ │ [Edit] link → return to Step 7     │
  │   │ └────────────────────────────────────┘
  │   │
  │   └─→ Confirmation checkbox:
  │       "I confirm that the above information is true and accurate."
  │
  ├─→ Electronic signature field:
  │   "Type your full name below to electronically sign this filing:"
  │
  └─→ STEP 10 SAVED

STEP 11: Ancillary Services Upsell
  │
  ├─→ Display cards for optional add-ons (ordered by conversion rate):
  │   │
  │   ├─ [Registered Agent Service]
  │   │  $ [0 first year / $119/year renewal]
  │   │  "Protect your privacy. Don't list your home address publicly."
  │   │  [Add to Order] / [Skip]
  │   │
  │   ├─ [Operating Agreement Template]
  │   │  $ [99]
  │   │  "Banks require this before opening a business account."
  │   │  [Add to Order] / [Skip]
  │   │
  │   ├─ [EIN Acquisition]
  │   │  $ [49]
  │   │  "Get your Employer Identification Number from the IRS."
  │   │  [Add to Order] / [Skip]
  │   │
  │   ├─ [Domain Registration]
  │   │  $ [8.99+]
  │   │  [Search for domain] [Domain name] [.com ▼] [Check Availability]
  │   │  (Shows results: "example.com - $12.99/yr Available")
  │   │  [Add to Order] / [Skip]
  │   │
  │   ├─ [Additional Certificates]
  │   │  Certificate of Status: $5 each [Qty: 0] [+] [-]
  │   │  Certified Copies: $30 each  [Qty: 0] [+] [-]
  │   │  [Add to Order] / [Skip]
  │   │
  │   └─ [Annual Compliance Service]
  │      $ [199/year]
  │      "Never miss a deadline. Automated annual report reminders."
  │      [Add to Order] / [Skip]
  │
  └─→ STEP 11 SAVED

STEP 12: Payment & Checkout
  │
  ├─→ Order Summary (right side, sticky on desktop):
  │   │ ┌─────────────────────────────────┐
  │   │ │ SERVICE: [Tier Name]            │
  │   │ │ State Filing Fee            $125 │
  │   │ │ Formation Service Fee        $99 │
  │   │ │ Operating Agreement          $99 │
  │   │ │ EIN Acquisition              $49 │
  │   │ │ Registered Agent (Year 1)      $0 │
  │   │ │ Domain Registration          $12.99 │
  │   │ │ Certificates                 $10 │
  │   │ │                              ─── │
  │   │ │ TOTAL                       $594.99 │
  │   │ └─────────────────────────────────┘
  │   │
  │   └─→ Promo code field (admin-managed in database)
  │
  ├─→ Payment Method Selection:
  │   │ ○ Credit Card (Default)
  │   │ ○ ACH Bank Transfer (future)
  │   │
  │   └─→ Credit Card Details (via Stripe.js tokenized form):
  │       │ Card number: [____ ____ ____ ____]
  │       │ MM/YY: [__/__]  CVC: [___]
  │       │ Cardholder Name: [________________]
  │       │ Billing Zip: [________]
  │       │
  │       └─→ [Pay $594.99]
  │
  ├─→ Payment Processing:
  │   │
  │   ├─ Validation: Card details checked by Stripe.js (client-side)
  │   │
  │   ├─ (Optional) 3D Secure prompt if required by Stripe
  │   │
  │   ├─ Response handling:
  │   │  │
  │   │  ├─ SUCCESS (status: succeeded)
  │   │  │  │ Display checkmark: "Payment processed successfully!"
  │   │  │  │ Filing number: [tracking #]
  │   │  │  │ Receipt email sent to [user email]
  │   │  │  │ Document download: [Articles of Org] [Receipt] [Operating Agreement]
  │   │  │  │ Next: "What happens next?" section
  │   │  │  └─→ Go to COMPLETION (below)
  │   │  │
  │   │  ├─ CARD DECLINED (status: declined)
  │   │  │  │ Error: "Your card was declined. Please verify details and try again."
  │   │  │  │ Offer: "Try a different card" or "Contact your bank"
  │   │  │  │ Retry count: Max 3 attempts, then suggest contacting support
  │   │  │  └─→ Stay on Step 12, allow card re-entry
  │   │  │
  │   │  ├─ TIMEOUT / NETWORK ERROR
  │   │  │  │ Error: "We experienced a connection issue. Please try again."
  │   │  │  │ (Automatic retry in 3 seconds, up to 2 times)
  │   │  │  │ Manual retry button
  │   │  │  │ Contact support link
  │   │  │  └─→ Stay on Step 12, preserve entered data
  │   │  │
  │   │  └─ OTHER ERROR (status: processing_error, etc.)
  │   │     Error: [Detailed message from Stripe]
  │   │     "Your card was not charged. Please try again or contact support."
  │   │     [Retry] [Contact Support]
  │   │     └─→ Stay on Step 12
  │   │
  │   └─→ Idempotency key ensures no double-charge on browser refresh
  │
  └─→ STEP 12 SAVED & FILING SUBMITTED

COMPLETION: Success Page
  │
  ├─→ Large green checkmark: "Your business is being filed!"
  │
  ├─→ Filing details:
  │   │ Business Name: [value]
  │   │ Filing Number: [FL########]
  │   │ Filed Date: [date/time]
  │   │ Expected Approval: [date range]
  │   │
  │   └─→ "What happens next?" section with timeline:
  │       │ Day 1-2: "Florida processes your filing"
  │       │ Day 3-5: "We receive approval and generate documents"
  │       │ Day 5: "Confirmation email sent"
  │       │
  │       └─→ Keep this window open or check your email
  │
  ├─→ Quick actions:
  │   │ [Download Documents Now]
  │   │ [View Filing Details]
  │   │ [Go to Dashboard]
  │   │ [Start Another Business] (quick link)
  │   │
  │   └─→ Print receipt button
  │
  ├─→ Email receipt sent immediately with:
  │   │ Filing summary
  │   │ Document links
  │   │ Next steps
  │   │ Tracking number & PIN (if manual follow-up needed)
  │   │
  │   └─→ Support contact info
  │
  └─→ END

  ──────────────────────────────────────────────────────────
  
  Later: Email notification when state approves filing
  │ ├─→ "Your business [name] has been approved!"
  │ ├─→ Filing number: [value]
  │ ├─→ [Download final documents]
  │ └─→ Next steps (annual report deadline, etc.)
  │
  END
```

### 4.3 Abandonment & Recovery

```
┌─────────────────────────────────────────────────────────────────┐
│ USER FLOW: Form Abandonment & Recovery                         │
└─────────────────────────────────────────────────────────────────┘

SCENARIO 1: User starts form but doesn't complete

Timeline:
- 0 hours: User completes Step 3, closes browser
  │ All data auto-saved to filing_steps table
  │
- 24 hours: Abandoned-form reminder email sent
  │ Subject: "Finish your [Business Name] formation (step 3 of 12)"
  │ Body: "You're 25% done! Click here to resume."
  │ Link: /resume-filing?filing_id=XXX
  │
  └─→ User clicks link → Redirect to dashboard
      └─→ Dashboard shows: "[Business Name] - Draft (Step 3 of 12) [Resume]"
          └─→ User clicks [Resume] → Redirect to Step 4 (next incomplete step)
              └─→ Continue filling out form normally
              └─→ All previous answers preserved

- 72 hours: Final reminder email sent
  │ Subject: "Last chance: Complete your [Business Name] filing"
  │ Body: Increased urgency, highlight value proposition
  │ Link: /resume-filing?filing_id=XXX
  │
  └─→ Same resume flow as above

- 30 days: Automatic archive (mark filing as abandoned in database)
  │ Reason: "No activity in 30 days"
  │ User can still resume if they return within 6 months
  │
  └─→ Email: "Your filing was archived due to inactivity"
      "Reply to this email to reactivate or start a new filing"

SCENARIO 2: Payment fails during Step 12

Timeline:
- User enters card details, clicks [Pay]
- Card declined by issuer
  │ User sees: "Card declined. Please try another card."
  │ User is NOT charged
  │ Filing data is preserved
  │
  ├─→ User retries with different card → SUCCESS (normal flow)
  │
  └─→ User abandons without retrying
      │ After 24 hours → "Complete your payment" email
      │ Link: /complete-payment?payment_id=YYY
      │ User returns, retries → SUCCESS
      │
      └─→ If 3+ failed attempts + no activity for 7 days
          │ Mark payment as abandoned
          │ Filing reverts to draft status
          │ User can re-initiate payment or restart

SCENARIO 3: User saves form mid-way, browser crashes

Timeline:
- User on Step 5, auto-save triggered every 30 seconds
- Browser crashes / internet disconnected
- User reopens app, logs in
  │
  ├─→ Dashboard shows: "[Business Name] - Draft (Step 5 of 12) [Resume]"
  │
  └─→ User clicks [Resume]
      └─→ Redirected to Step 5 with all previously entered data intact
          └─→ Continue form normally

IMPLEMENTATION DETAILS:

Auto-save mechanism:
- Debounce: 2 seconds after last user input
- Trigger: Every step change, every field blur, every 60 seconds of activity
- Save to: filing_steps table (step_number, data_snapshot as JSONB)
- No data loss: Even if payment fails, all form data persists

Recovery email:
- Template: abandonment_reminder_24h
- Trigger: If filing.status = 'draft' AND last updated > 24 hours
- Scheduled job: Daily at 9 AM (user's timezone, if known)
- Frequency: Multiple emails (24h, 72h, 7d, 30d)
- Unsubscribe option: User can opt out, but will lose recovery assistance

Resume endpoint:
- GET /resume-filing?filing_id=UUID
- Validate: filing_id exists, user_id matches current user
- Redirect: /incorporation?filing_id=UUID&resume=true
- Component: Load last completed step + 1
```

### 4.4 Post-Filing & E-Filing Submission

```
┌─────────────────────────────────────────────────────────────────┐
│ USER FLOW: Document Delivery & State Submission                │
└─────────────────────────────────────────────────────────────────┘

IMMEDIATE (0-5 minutes after payment):

1. Payment confirmation email
   │ Subject: "Receipt for [Business Name] formation"
   │ Includes: Invoice, itemized services, payment method
   │ Attachments: Receipt PDF

2. Document generation (async job)
   │ Task: Generate Articles of Organization PDF from form data
   │ Output: /documents/{filing_id}/{document_type}.pdf
   │ Upload to S3: s3://incorporation-docs/filing_id/articles.pdf
   │ Status: filing.documents[0].status = 'generated'

3. Dashboard updated
   │ Filing status remains 'submitted' (pending state approval)
   │ Document links appear in "Documents" section

AFTER 1 HOUR (Async background job):

4. E-filing submission to Florida SunBiz
   │ Trigger: cron job runs every 15 minutes, processes queued filings
   │ Action: Submit Articles to efile.sunbiz.org/llc_file.html
   │
   │ Process:
   │ ├─→ Launch headless browser (Playwright)
   │ ├─→ Fill out Form Steps 1-11 with filing data
   │ ├─→ Submit payment via credit card on form (charged to SunBiz account)
   │ ├─→ Capture confirmation: Filing number, tracking number, PIN
   │ ├─→ Update filings table: sunbiz_filing_number, sunbiz_tracking_number, sunbiz_pin, sunbiz_submitted_at
   │ ├─→ Download receipt PDF from state, store in S3
   │ └─→ Mark filing status: 'submitted'
   │
   │ Error handling:
   │ ├─→ Name unavailable during submission (name taken since user filed)
   │     │ Retry with next suggested alternative
   │     │ OR notify user via email to choose new name
   │     │ Filing status: 'name_unavailable'
   │     │
   │     └─→ User can edit name and resubmit (via admin or API)
   │
   │ ├─→ Network error during submission
   │     │ Retry up to 3 times with exponential backoff
   │     │ If max retries exceeded, mark filing 'submission_error'
   │     │ Admin notified to retry manually
   │     │
   │     └─→ Use tracking number captured before error to check status with state
   │
   │ └─→ Payment error (card decline, insufficient balance)
   │     │ Mark filing 'payment_error'
   │     │ Try again with prepaid account or different card
   │     │ Notify admin & user

5. State processing email to user
   │ Subject: "[Business Name] filed with Florida! Here's what's next."
   │ Body:
   │   "Your filing has been submitted to the Florida Department of State.
   │    Processing typically takes 1-2 business days.
   │    Filing Number: FL20250012345
   │    Tracking Info: [link to track]
   │    
   │    We'll email you again when the state approves your filing.
   │    If you have questions, reply to this email or contact support."
   │
   │ Attachments: Filing receipt PDF

AFTER 1-2 BUSINESS DAYS (State processing):

6. State approval email notification
   │ Trigger: Admin manually updates filing status OR automated poll of SunBiz every 4 hours
   │ Status update: filings.status = 'approved'
   │ filings.sunbiz_approved_at = [timestamp]
   │
   │ Process:
   │ ├─→ Poll SunBiz search API: /Inquiry/CorporationSearch/SearchResults?businessName=...
   │ ├─→ Check if filing_number appears and status = 'Active'
   │ ├─→ Download certified copy from search results detail page
   │ ├─→ Update filing status in DB
   │ └─→ Trigger approval email (below)
   │
   │ Email to user:
   │ Subject: "Congratulations! [Business Name] has been approved!"
   │ Body:
   │   "Your LLC/Corporation is now official!
   │    Approval Date: [date]
   │    Filing Number: [number]
   │    
   │    Your documents are ready to download:
   │    - Articles of Organization
   │    - Certification of Good Standing
   │    - Formation Receipt
   │    - Operating Agreement (if purchased)
   │    
   │    Next Steps:
   │    1. Download and review your documents
   │    2. Open a business bank account (bring articles)
   │    3. Get your EIN from the IRS
   │    4. Apply for business licenses/permits
   │    5. Mark your annual report deadline: [date]
   │    
   │    We'll remind you 60 days before your next annual report is due."
   │
   │ Attachments: Articles (certified copy from state), certification, receipt

7. Dashboard updated
   │ Filing status: 'approved' (green checkmark)
   │ All documents now available for download
   │ Annual report deadline calculated and displayed
   │ Compliance calendar updated

ONGOING (Recurring):

8. Annual Report Reminders
   │ Trigger: Scheduled job (cron) runs daily
   │ Check: annual_reports.due_date <= TODAY + 60 days AND not yet filed
   │ Email 1 (60 days before): "Your annual report is due in 60 days"
   │ Email 2 (30 days before): "30 days left to file your annual report"
   │ Email 3 (Final notice): "Your annual report is due in 3 days. File now to avoid a $400 penalty."
   │
   │ Each email includes:
   │ ├─→ Due date
   │ ├─→ Filing fee
   │ ├─→ Late fee warning ($400 non-waivable)
   │ ├─→ [File Now] button (if managed filing enabled)
   │ └─→ Support link

9. Managed Annual Report Filing (Optional Service)
   │ User purchased "Annual Compliance" service
   │ Trigger: Due date approaching
   │ Process:
   │ ├─→ Email user 15 days before: "Ready to file your annual report?"
   │ │   "[Authorize Filing]" button or "No, I'll do it myself"
   │ │
   │ ├─→ (If authorized) Auto-populate annual report with current data
   │ ├─→ Submit to SunBiz via efile.sunbiz.org
   │ ├─→ Capture filing receipt & fees charged
   │ ├─→ Email confirmation: "Your annual report has been filed!"
   │ │   Filing number, date, fee, next deadline
   │ │
   │ └─→ Update annual_reports table: status = 'filed', filed_date, sunbiz_filing_number

ERROR HANDLING - Filing Rejection by State:

10. Rejection Scenario
    │ State rejects filing: "Name conflicts with active entity"
    │ SunBiz marks filing with rejection status
    │
    │ Process:
    │ ├─→ Admin reviews rejection reason
    │ ├─→ Updates filing: status = 'rejected', sunbiz_rejection_reason = [reason]
    │ ├─→ Sends email to user with reason and options:
    │ │   a) Select a different business name and resubmit
    │ │   b) Contact support for assistance
    │ │
    │ ├─→ User either:
    │ │   a) Edits name via dashboard and resubmits (or admin resubmits)
    │ │   b) Contacts support email
    │ │
    │ └─→ Filing resubmitted once issue resolved
```

---

## 5. Data Collection Requirements

### 5.1 LLC Formation - Data Fields by Step

#### Step 1: Entity Type & Location
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| entity_type | enum | Y | LLC or Corporation |
| state | varchar(2) | Y | Initially FL only; expandable |

#### Step 2: Business Name
| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| business_name | varchar(255) | Y | Must be unique per SunBiz; must end with LLC suffix |
| business_name_suffix | varchar(50) | Y | LLC, L.L.C., Limited Liability Company, Limited Company, L.C. |
| name_availability_status | enum | Y | 'available', 'unavailable', 'pending' |
| name_check_timestamp | timestamp | N | When availability last checked |

#### Step 3: Service Tier
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| pricing_tier_id | uuid | Y | References pricing_tiers.tier_id |
| selected_tier_name | varchar(100) | Y | 'Basic', 'Standard', 'Premium' |
| base_price_cents | int | Y | Stored for audit purposes |

#### Step 4: Principal Address
| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| principal_address_street1 | varchar(255) | Y | USPS normalized |
| principal_address_street2 | varchar(255) | N | Apartment, Suite, etc. |
| principal_address_city | varchar(100) | Y | Auto-filled from zip |
| principal_address_state | varchar(2) | Y | Same as filing state (FL) |
| principal_address_zip | varchar(10) | Y | Valid USPS zip |

#### Step 5: Mailing Address
| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| mailing_address_same_as_principal | boolean | Y | If true, ignore fields below |
| mailing_address_street1 | varchar(255) | Conditional | Required if different |
| mailing_address_street2 | varchar(255) | N | P.O. box allowed here |
| mailing_address_city | varchar(100) | Conditional | Required if different |
| mailing_address_state | varchar(2) | Conditional | Can be different state |
| mailing_address_zip | varchar(10) | Conditional | Required if different |

#### Step 6: Registered Agent
| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| registered_agent_type | enum | Y | 'individual' or 'business_entity' |
| registered_agent_name | varchar(255) | Y | Full name or business name |
| registered_agent_email | varchar(255) | Y | Valid email format |
| registered_agent_address_street1 | varchar(255) | Y | Must be FL physical address, NO P.O. boxes |
| registered_agent_address_street2 | varchar(255) | N | |
| registered_agent_address_city | varchar(100) | Y | |
| registered_agent_address_state | varchar(2) | Y | Must be 'FL' |
| registered_agent_address_zip | varchar(10) | Y | |
| registered_agent_signature_name | varchar(255) | Y | Typed name = electronic signature |
| registered_agent_signature_timestamp | timestamp | Y | Auto-captured when field blurs |
| registered_agent_consents | boolean | Y | "I confirm I accept the duties of registered agent" |

#### Step 7: Managers/Members (Array of 1-N entries)
| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| manager_member_title | enum | Y | 'MGR', 'MGRM', 'AMBR', 'AP' |
| manager_member_name | varchar(255) | Y | Full name |
| manager_member_address_street1 | varchar(255) | Y | |
| manager_member_address_street2 | varchar(255) | N | |
| manager_member_address_city | varchar(100) | Y | |
| manager_member_address_state | varchar(2) | Y | |
| manager_member_address_zip | varchar(10) | Y | |
| manager_member_address_country | varchar(2) | Y | Default 'US' |
| manager_member_ownership_percentage | decimal(5,2) | N | 0-100, must sum to 100 if using percentages |

#### Step 8: Correspondence Contact
| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| correspondence_email | varchar(255) | Y | Valid email, receives state notices |
| correspondence_phone | varchar(20) | N | E.164 format preferred |

#### Step 9: Optional Details
| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| effective_date | date | Y | Today by default; can be -5 to +90 days |
| business_purpose | text | N | Free-form text, optional |
| professional_llc | boolean | N | If true, professional_purpose required |
| professional_purpose | varchar(255) | Conditional | Required if professional_llc = true |

#### Step 10: Review & Signature
| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| filer_full_name | varchar(255) | Y | Typed name = electronic signature |
| filer_signature_timestamp | timestamp | Y | Auto-captured |
| filer_confirms_accuracy | boolean | Y | "I confirm information is true and accurate" |

#### Step 11: Ancillary Services (Array of selected services)
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| registered_agent_service_selected | boolean | N | Defaults to true for most tiers |
| operating_agreement_selected | boolean | N | $49-99 upsell |
| ein_acquisition_selected | boolean | N | $49 upsell |
| domain_registration_selected | boolean | N | $8.99+ upsell |
| domain_name | varchar(255) | Conditional | Required if domain_registration_selected |
| certificate_of_status_qty | int | N | 0-9, $5 each |
| certified_copies_qty | int | N | 0-9, $30 each |
| annual_compliance_selected | boolean | N | $199/year upsell |

#### Step 12: Payment
| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| payment_intent_id | varchar(255) | Y | From Stripe |
| payment_method_type | enum | Y | 'credit_card' |
| card_last_four | varchar(4) | Y | PCI-compliant tokenization |
| card_brand | varchar(20) | Y | Visa, Mastercard, Amex, Discover |
| billing_zip | varchar(10) | N | Optional, may be collected by Stripe |
| amount_cents | int | Y | Total in cents |
| currency | varchar(3) | Y | USD |

### 5.2 Corporation Formation - Differences from LLC

**Additional Fields for Corporations:**

| Step | Field | Type | Required | Notes |
|------|-------|------|----------|-------|
| 2 | corporation_name_suffix | enum | Y | Corporation, Corp, Inc, Company, Co, etc. |
| 9 | authorized_shares | int | Y | Min 1; typically 1000 |
| 9 | corporate_purpose | varchar(255) | Conditional | Required for professional corps |
| 7 | director_officer_titles | enum | Y | President, VP, Treasurer, Secretary, Director |
| (new) | incorporator_name | varchar(255) | Y | Typically the filer or attorney |
| (new) | incorporator_signature | varchar(255) | Y | Typed name = signature |

### 5.3 Multi-Step Form State Storage

All data is stored in `filing_steps` table as a JSONB snapshot after each step:

```json
{
  "filing_id": "550e8400-e29b-41d4-a716-446655440000",
  "step_number": 6,
  "step_name": "registered_agent",
  "completed_at": "2026-04-25T14:30:00Z",
  "data_snapshot": {
    "registered_agent_type": "individual",
    "registered_agent_name": "John Smith",
    "registered_agent_email": "john@example.com",
    "registered_agent_address_street1": "123 Main St",
    "registered_agent_address_city": "Miami",
    "registered_agent_address_state": "FL",
    "registered_agent_address_zip": "33101",
    "registered_agent_consents": true
  }
}
```

This allows:
- Complete recovery of form data if user abandons mid-way
- Historical tracking of form edits
- A/B testing of form field ordering
- Debugging of user issues

---

## 6. API Integration Specifications

### 6.1 Stripe Integration

**Purpose:** Process payments for formation services and ancillary services.

**Integration Points:**

1. **Client-side Payment Element** (Stripe.js)
   ```javascript
   // Initialize Stripe
   const stripe = Stripe('pk_live_YOUR_KEY');
   const elements = stripe.elements();
   const cardElement = elements.create('card');
   cardElement.mount('#card-element');
   
   // Handle submission
   document.getElementById('payment-form').addEventListener('submit', async (event) => {
     event.preventDefault();
     const { paymentIntent } = await stripe.confirmPayment({
       elements,
       confirmParams: {
         return_url: 'https://yourdomain.com/checkout/success'
       }
     });
   });
   ```

2. **Server-side Payment Intent Creation**
   - Endpoint: `POST /api/payments/create-intent`
   - Request body:
     ```json
     {
       "filing_id": "uuid",
       "amount_cents": 59499,
       "description": "Formation + services for Acme LLC"
     }
     ```
   - Response:
     ```json
     {
       "client_secret": "pi_1234_secret_5678",
       "payment_intent_id": "pi_1234567890"
     }
     ```

3. **Webhook Handling**
   - Endpoint: `POST /webhooks/stripe`
   - Events monitored:
     - `payment_intent.succeeded`: Payment completed
     - `payment_intent.payment_failed`: Card declined
     - `charge.refunded`: Refund processed
   - Webhook endpoint must verify Stripe signature before processing

4. **Refund Handling**
   - Endpoint: `POST /api/refunds/create`
   - Only allowed within 30 days of payment
   - Reason required (customer request, filing rejected, etc.)
   - Requires admin authorization for amounts > $500
   - Must update `payments` table with `refunded_at` timestamp

**Error Handling:**
- Insufficient funds: Return 402 status with message
- Invalid card: Return 422 status with card error details
- Network timeout: Implement 3 retries with exponential backoff
- Idempotency: All payment creation requests must include `Idempotency-Key` header

**PCI Compliance:**
- Never store full credit card numbers
- Use Stripe's tokenized payment method
- Validate SSL certificates
- Implement rate limiting on payment endpoints

### 6.2 Domain Registrar Integration

**Provider:** Namecheap (recommended; GoDaddy as fallback)

**Use Cases:**
1. Domain availability search
2. Domain registration
3. Renewal management
4. DNS record management (future)

**Namecheap API Integration:**

```python
# Pseudocode for domain availability check
import namecheap_api

def check_domain_availability(domain_name):
    """
    Check if domain is available
    Returns: {'domain': 'example.com', 'available': True, 'price': 12.99, 'renewal_price': 12.99}
    """
    # Requires: NAMECHEAP_API_KEY, NAMECHEAP_USER_NAME (account login)
    # Endpoint: CheckDomains (https://www.namecheap.com/support/api/methods/domains/check/)
    
    client = namecheap_api.Client(
        api_key=NAMECHEAP_API_KEY,
        username=NAMECHEAP_USER_NAME,
        sandbox=False
    )
    
    result = client.domains.check(domain_name)
    
    return {
        'domain': domain_name,
        'available': result.available,
        'price': result.price if result.available else None,
        'premium': result.is_premium
    }

def register_domain(domain_name, registrant_info):
    """
    Register a domain for the business owner
    """
    client = namecheap_api.Client(
        api_key=NAMECHEAP_API_KEY,
        username=NAMECHEAP_USER_NAME
    )
    
    # Registrant info must include: first_name, last_name, email, phone, address
    # Default to 1-year registration
    
    result = client.domains.create(
        domain=domain_name,
        years=1,
        registrant=registrant_info,
        admin_tech_billing=registrant_info  # Same person
    )
    
    return {
        'domain': domain_name,
        'order_id': result.order_id,
        'transaction_id': result.transaction_id,
        'charge_amount': result.charge_amount
    }
```

**API Endpoints to Implement:**

- `GET /api/domains/check?domain=example.com`
  - Returns: { available: bool, price: float, tld: string }

- `POST /api/domains/register`
  - Request: { domain, owner_email, years (default 1) }
  - Response: { success: bool, order_id, transaction_id }

- `POST /api/domains/list-suggestions?prefix=acme`
  - Returns: [ { domain: 'acme.com', available: true, price: 12.99 }, ... ]

**Pricing Strategy:**
- Namecheap wholesale cost: ~$8-10 per domain
- Markup: 20-30% → Retail price: $9.99-$12.99 per .com domain
- Renewal markup: 10-15% to maintain competitiveness
- Premium domains: Pass through registrar markup (often $100-1000+)

**Error Handling:**
- Domain not available: Return 409 Conflict
- Registrant info validation: Return 422 with field errors
- API rate limit hit: Implement queue and retry

### 6.3 Email Service Integration

**Provider:** SendGrid (recommended) or Mailgun

**Use Cases:**
1. Transactional email (receipts, confirmations)
2. Reminders (abandonment, annual reports)
3. Notifications (filing status updates)
4. Marketing campaigns (future)

**SendGrid Integration:**

```python
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Subject, PlainTextContent, HtmlContent

def send_email(template_name, recipient_email, variables):
    """
    Send templated email via SendGrid
    """
    sg = SendGridAPIClient(SENDGRID_API_KEY)
    
    # Map template names to SendGrid template IDs
    template_ids = {
        'welcome': 'd-abc123...',
        'payment_confirmation': 'd-def456...',
        'filing_submitted': 'd-ghi789...',
        'annual_report_reminder_60': 'd-jkl012...',
        # ... more templates
    }
    
    message = Mail(
        from_email=Email('noreply@incorporationservice.com', 'Incorporation Service'),
        to_emails=To(recipient_email),
        subject=Subject(''),  # Subject from SendGrid template
    )
    
    message.template_id = template_ids[template_name]
    message.dynamic_template_data = variables
    
    try:
        response = sg.send(message)
        return {
            'success': True,
            'message_id': response.headers.get('X-Message-ID')
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }
```

**Email Templates to Create:**

| Template Name | Purpose | Variables |
|---------------|---------|-----------|
| `welcome` | New user signup | `{{first_name}}` |
| `payment_confirmation` | Order receipt | `{{business_name}}`, `{{amount}}`, `{{filing_number}}` |
| `filing_submitted` | Confirmation to state | `{{business_name}}`, `{{filing_number}}`, `{{expected_approval_date}}` |
| `filing_approved` | State approval | `{{business_name}}`, `{{filing_number}}`, `{{approval_date}}`, `{{download_link}}` |
| `filing_rejected` | State rejection | `{{business_name}}`, `{{rejection_reason}}`, `{{support_url}}` |
| `abandoned_reminder_24h` | First abandonment | `{{business_name}}`, `{{step_number}}`, `{{resume_url}}` |
| `abandoned_reminder_72h` | Second abandonment | Same as above |
| `annual_report_reminder_60` | 60 days before | `{{business_name}}`, `{{due_date}}`, `{{fee}}`, `{{file_url}}` |
| `annual_report_reminder_30` | 30 days before | Same as above |
| `annual_report_reminder_final` | 3 days before | Same as above + penalty warning |
| `annual_report_filed` | Confirmation | `{{business_name}}`, `{{filing_date}}`, `{{filing_number}}` |
| `compliance_alert` | Compliance issue | `{{business_name}}`, `{{alert_description}}`, `{{action_url}}` |

**API Endpoints to Implement:**

- `POST /api/emails/send`
  - Request: { template_name, recipient_email, variables: {} }
  - Response: { success: bool, message_id }

- `POST /api/emails/schedule`
  - Request: { template_name, recipient_email, variables, send_at (ISO timestamp) }
  - Response: { success: bool, scheduled_email_id }

- `GET /api/emails/status/{message_id}`
  - Response: { status: 'delivered'|'bounced'|'opened'|'clicked', ... }

**Error Handling:**
- Invalid email: Return 400 with validation error
- Template not found: Return 404
- API error: Retry with exponential backoff, max 5 attempts
- Bounce handling: Mark email as invalid, stop sending

---

## 7. Scraping and Automation Implementation

### 7.1 Name Availability Checker

**Strategy:** Hybrid approach using local data + live scraping

**Architecture:**

```
┌────────────────────────────────────────────────────────────────┐
│ Name Availability Check Request                              │
└────────────────────────────────────────────────────────────────┘
  │
  ├─→ [1] Check Redis cache
  │   │ Key: "sunbiz:availability:{name_upper}:{state}"
  │   │ TTL: 24 hours
  │   │ Hit? → Return cached result immediately
  │   │
  │   └─→ Miss? Continue to [2]
  │
  ├─→ [2] Query local PostgreSQL mirror of bulk data
  │   │ Table: sunbiz_entities (updated nightly)
  │   │ Query: SELECT * FROM sunbiz_entities 
  │   │        WHERE name_normalized ~* 'acme.*llc'
  │   │        AND state = 'FL' AND status IN ('Active', 'INACT', 'NAME_HS')
  │   │ Result: [list of conflicts, if any]
  │   │
  │   ├─→ No conflicts? Result = "Available" → Cache + Return
  │   ├─→ Conflicts found? Result = "Unavailable" → Cache + Return
  │   └─→ Local data too old (> 24h)? Continue to [3]
  │
  ├─→ [3] Live scrape of SunBiz (fallback, within rate limits)
  │   │ Tool: cloudscraper (handles Cloudflare challenge)
  │   │ Rate limit: Max 1 req/s, implement queue
  │   │ URL: search.sunbiz.org/Inquiry/CorporationSearch/SearchResults
  │   │ Cache result for 24 hours
  │   │
  │   ├─→ Success? Return result
  │   ├─→ Cloudflare blocked? Fall back to local data (if available)
  │   └─→ Error? Return "Status Unknown" + retry link
  │
  └─→ [4] Return result to UI
      ├─ Green (Available): "This name is available!"
      ├─ Red (Unavailable): "This name is taken. Try another."
      └─ Yellow (Unknown): "We couldn't confirm. Please contact support."
```

**Implementation Details:**

**Local Data Ingest (Daily Cron Job):**
```python
import ftplib
import pandas as pd
from datetime import datetime

def ingest_sunbiz_bulk_data():
    """
    Download daily/weekly entity dump from Florida SunBiz FTP
    Parse and load into PostgreSQL
    """
    
    # Connect to FTP
    ftp = ftplib.FTP('sdcftp.floridados.gov')
    ftp.login('anonymous', 'email@example.com')
    
    # Navigate to LLC data
    ftp.cwd('/public/doc/LLC')
    
    # List available files
    files = ftp.nlst()
    
    # Download latest weekly file (e.g., "CORP_2026_04.txt")
    latest_file = sorted(files)[-1]
    
    with open(f'/tmp/{latest_file}', 'wb') as f:
        ftp.retrbinary(f'RETR {latest_file}', f.write)
    
    # Parse fixed-width format (as per Florida docs)
    entities = parse_sunbiz_fixed_width(f'/tmp/{latest_file}')
    
    # Upsert into PostgreSQL
    for entity in entities:
        db.execute("""
            INSERT INTO sunbiz_entities (
              entity_id, name, name_normalized, type, status, 
              filing_date, registered_agent, principal_address,
              last_updated
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (entity_id) DO UPDATE SET
              status = EXCLUDED.status,
              name = EXCLUDED.name,
              last_updated = EXCLUDED.last_updated
        """, (
            entity['id'], entity['name'], normalize_name(entity['name']),
            entity['type'], entity['status'], entity['filing_date'],
            entity['registered_agent'], entity['address'], datetime.now()
        ))
    
    db.commit()
    print(f"Loaded {len(entities)} entities from {latest_file}")
```

**Name Normalization Function:**
```python
import re

def normalize_name(name):
    """
    Normalize business names for comparison
    Remove punctuation, suffixes, extra spaces
    """
    # Remove punctuation
    normalized = re.sub(r'[^A-Za-z0-9 ]', '', name.upper())
    
    # Remove common suffixes
    normalized = re.sub(r'\b(LLC|L\.L\.C\.|INC|INC\.|CORP|CORPORATION|CO|CO\.|LTD|LIMITED|PA|P\.A\.)\b', '', normalized)
    
    # Remove extra spaces
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    
    return normalized

def check_availability(name, state='FL'):
    """
    Check if business name is available
    Returns: {'available': bool, 'conflicts': [list of conflicting entities]}
    """
    
    normalized = normalize_name(name)
    
    # Query local database
    conflicts = db.execute("""
        SELECT entity_id, name, status, filing_date FROM sunbiz_entities
        WHERE state = %s 
        AND name_normalized = %s
        AND status IN ('Active', 'INACT', 'NAME_HS', 'CROSS_RF')
    """, (state, normalized)).fetchall()
    
    if not conflicts:
        return {'available': True, 'conflicts': []}
    else:
        return {
            'available': False,
            'conflicts': [
                {'name': c[1], 'status': c[2], 'filing_date': c[3]}
                for c in conflicts
            ]
        }
```

**Live Scraper (Fallback, Improved from Research):**
```python
import cloudscraper
from bs4 import BeautifulSoup
import time
import random

def scrape_sunbiz_live(business_name, state='FL', max_retries=3):
    """
    Scrape SunBiz search results
    Handles Cloudflare challenge via cloudscraper
    Implements rate limiting and error handling
    """
    
    scraper = cloudscraper.create_scraper(
        browser={'browser': 'chrome', 'platform': 'windows', 'mobile': False}
    )
    
    url = (f'https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults'
           f'?inquiryType=EntityName'
           f'&searchNameOrder={business_name.upper()}'
           f'&searchTerm={business_name}')
    
    for attempt in range(max_retries):
        try:
            response = scraper.get(url, timeout=30)
            
            if response.status_code != 200:
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt + random.random()
                    time.sleep(wait_time)
                    continue
                else:
                    raise Exception(f"HTTP {response.status_code}")
            
            if 'Just a moment' in response.text:
                # Cloudflare challenge not solved
                raise Exception("Cloudflare challenge failed")
            
            # Parse results
            soup = BeautifulSoup(response.text, 'html.parser')
            rows = soup.select('#search-results tbody tr')
            
            results = []
            for tr in rows:
                cells = tr.find_all('td')
                if len(cells) < 3:
                    continue
                
                name_cell = cells[0].find('a')
                if not name_cell:
                    continue
                
                results.append({
                    'name': name_cell.get_text(strip=True),
                    'doc_number': cells[1].get_text(strip=True),
                    'status': cells[2].get_text(strip=True),
                    'url': 'https://search.sunbiz.org' + name_cell['href']
                })
            
            # Cache results
            redis_key = f"sunbiz:scrape:{normalize_name(business_name)}:{state}"
            redis.setex(redis_key, 86400, json.dumps(results))  # 24h TTL
            
            return results
        
        except Exception as e:
            logger.warning(f"Scrape attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt + random.random()
                time.sleep(wait_time)
            else:
                raise
```

### 7.2 E-Filing Automation

**Strategy:** Use Playwright (headless browser automation) to submit filings to SunBiz public wizard.

**Why Playwright vs. direct HTTP requests:**
- SunBiz uses complex JavaScript for form state management
- Dynamic field validation requires browser rendering
- Complex navigation flow easier to automate with Playwright

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│ E-Filing Submission Flow                                       │
└─────────────────────────────────────────────────────────────────┘

Filing submitted by user
  │
  ├─→ [Background Job] Queue filing for submission
  │   │ Status: 'queued'
  │   │ Store in queue table: queue_id, filing_id, priority, attempt_count
  │
  ├─→ [Cron Job] Process queued filings (every 15 minutes)
  │   │ Max concurrent jobs: 3 (respect rate limits)
  │   │ Spawns: PlaywrightWorker process
  │
  ├─→ [PlaywrightWorker] Connect to SunBiz and submit filing
  │   │
  │   └─→ STEP 1: Launch browser and navigate to efile.sunbiz.org/llc_file.html
  │       │ Headless mode: true
  │       │ Timeout: 30 seconds per action
  │       │ User-Agent: Rotated browser ID (anti-blocking)
  │
  │   └─→ STEP 2: Accept disclaimer
  │       │ Action: Check "I understand" checkbox
  │       │ Action: Click "Start New Filing" button
  │       │ Wait for page transition
  │
  │   └─→ STEP 3: Enter LLC Name (Form Page 1)
  │       │ Action: Fill name field with business_name
  │       │ Action: Wait for real-time name check to complete
  │       │ Check: Name must show "Available" status
  │       │ If not available:
  │       │   └─→ Log error, mark filing as 'name_unavailable'
  │       │   └─→ Exit workflow
  │       │ Action: Click "Next" button
  │
  │   └─→ STEP 4: Principal Address (Form Page 2)
  │       │ Action: Fill street, city, state, zip
  │       │ Wait: Address validation
  │       │ Action: Click "Next"
  │
  │   └─→ STEP 5: Mailing Address (Form Page 3)
  │       │ Action: If same as principal, check checkbox
  │       │ Action: Else fill alternate address
  │       │ Action: Click "Next"
  │
  │   └─→ STEP 6: Registered Agent (Form Page 4)
  │       │ Action: Fill agent name, email, FL address
  │       │ Action: Check electronic signature consent
  │       │ Action: Type agent name in signature field
  │       │ Wait: Server-side validation
  │       │ Action: Click "Next"
  │
  │   └─→ STEP 7: Authorized Persons (Form Page 5)
  │       │ Action: For each manager/member:
  │       │   ├─ Fill title dropdown
  │       │   ├─ Fill name, address
  │       │   ├─ Click "Add Another" or proceed to next
  │       │ Action: Click "Next"
  │
  │   └─→ STEP 8: Correspondence Email (Form Page 6)
  │       │ Action: Fill email and phone
  │       │ Action: Click "Next"
  │
  │   └─→ STEP 9: Effective Date (Form Page 7)
  │       │ Action: Set date (default today)
  │       │ Action: Click "Next"
  │
  │   └─→ STEP 10: Signer (Form Page 8)
  │       │ Action: Type filer's name in signature field
  │       │ Action: Click "Next"
  │
  │   └─→ STEP 11: Add-ons (Form Page 9)
  │       │ Action: Select Certificate of Status qty
  │       │ Action: Select Certified Copies qty
  │       │ Action: Click "Review"
  │
  │   └─→ STEP 12: Review Page (Form Page 10)
  │       │ Action: Read and verify total cost matches expected
  │       │ Check: If cost != expected amount, abort and alert
  │       │ Action: Click "Proceed to Payment"
  │
  │   └─→ STEP 13: Payment (Form Page 11)
  │       │ Action: Select "Credit Card" payment method
  │       │ Action: Fill card number, expiry, CVC
  │       │ Fetch: Payment card from vault (tokenized)
  │       │ Action: Fill in Stripe token instead of raw card
  │       │ Action: Click "Submit Payment"
  │       │ Wait: Payment processing (timeout 60s)
  │       │ Handle responses:
  │       │   ├─ Success: Capture filing number, PIN, receipt
  │       │   ├─ Decline: Retry with backup card (if available)
  │       │   └─ Error: Abort, mark as 'payment_error', alert admin
  │
  │   └─→ STEP 14: Capture Confirmation
  │       │ Action: Wait for success page
  │       │ Action: Scrape filing number from page
  │       │ Action: Scrape PIN from page
  │       │ Action: Download receipt PDF (if available)
  │       │ Action: Store in S3
  │
  │   └─→ STEP 15: Close browser and update database
  │       │ Update filings table:
  │       │   ├─ sunbiz_filing_number = [captured]
  │       │   ├─ sunbiz_pin = [captured]
  │       │   ├─ sunbiz_submitted_at = NOW()
  │       │   ├─ status = 'submitted'
  │       │ Close browser
  │       │ Log: "Filing submitted successfully"
  │
  └─→ [Background Task] Send confirmation email to user
      │ Email: Filing submitted, filing number, tracking info
      └─→ END

ERROR HANDLING:

Name unavailable during submission
├─→ Log error with details
├─→ Update filing status: 'name_unavailable'
├─→ Send email to user: "Name conflict detected, choose alternative"
├─→ Offer: List of alternative names or retry options
└─→ User can edit name and resubmit

Payment failures
├─→ Retry with exponential backoff (up to 3 times)
├─→ Log each attempt with response code
├─→ If all attempts fail:
│   ├─ Update filing status: 'payment_error'
│   ├─ Store error message
│   ├─ Alert admin for manual intervention
│   └─ Email user: "Payment could not be processed, contact support"
└─→ Keep filing data intact for retry

Network/timeout errors
├─→ Retry entire submission workflow (up to 3 times)
├─→ Exponential backoff: 1s, 4s, 16s
├─→ Log full error traceback
├─→ After max retries, mark as 'submission_error'
├─→ Alert admin with filing details
└─→ User can manually submit or contact support

Browser/JavaScript errors
├─→ Capture console logs and network traffic
├─→ Log errors for debugging
├─→ Fallback: Manual submission via admin interface
└─→ Alert admin to review and fix automation
```

**Playwright Implementation:**

```python
from playwright.async_api import async_playwright
import asyncio
import json
from decimal import Decimal

class SunBizFilingAutomation:
    """
    Automates LLC/Corporation filing submission to Florida SunBiz
    """
    
    async def submit_filing(self, filing_id):
        """
        Main entry point for filing submission
        """
        filing = db.query(Filing).filter_by(filing_id=filing_id).first()
        
        if not filing:
            logger.error(f"Filing not found: {filing_id}")
            return False
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=['--disable-blink-features=AutomationControlled'],
                proxy={'server': 'socks5://proxy.example.com:1080'}  # Rotate IPs
            )
            
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            )
            
            page = await context.new_page()
            
            try:
                await page.goto('https://efile.sunbiz.org/llc_file.html', timeout=30000)
                
                # STEP 1: Accept disclaimer
                await page.check('input[name="Disclaimer"]')
                await page.click('input[value="Start New Filing"]')
                
                # Wait for page transition
                await page.wait_for_load_state('networkidle')
                
                # STEP 2: Business name
                await page.fill('input[name="EntityName"]', filing.business_name)
                
                # Wait for real-time validation
                await page.wait_for_selector('[data-availability="available"]', timeout=5000)
                
                await page.click('button:has-text("Continue")')
                
                # STEP 3-11: Continue filling form
                # (Similar pattern for each step)
                
                # STEP 12: Review
                actual_amount = await page.text_content('[data-total-amount]')
                expected_amount = str(filing.total_amount_cents / 100)
                
                if actual_amount != expected_amount:
                    logger.error(f"Amount mismatch: {actual_amount} vs {expected_amount}")
                    return False
                
                # STEP 13: Payment
                # Use stored card token
                await page.fill('[name="card-token"]', filing.payment_method.stripe_token)
                await page.click('button[type="submit"]')
                
                # Wait for success
                await page.wait_for_url('**/confirmation/**', timeout=60000)
                
                # STEP 14: Capture confirmation
                filing_number = await page.text_content('[data-filing-number]')
                pin = await page.text_content('[data-pin]')
                
                # Download receipt
                async with page.expect_download() as download_info:
                    await page.click('a:has-text("Download Receipt")')
                download = await download_info.value
                
                receipt_path = f'/tmp/{filing_id}_receipt.pdf'
                await download.save_as(receipt_path)
                
                # Upload to S3
                s3_url = upload_to_s3(receipt_path, f'filings/{filing_id}/receipt.pdf')
                
                # Update database
                filing.sunbiz_filing_number = filing_number
                filing.sunbiz_pin = pin
                filing.sunbiz_submitted_at = datetime.now()
                filing.status = 'submitted'
                filing.documents.append(Document(
                    document_type='filing_receipt',
                    s3_url=s3_url
                ))
                db.commit()
                
                logger.info(f"Filed successfully: {filing_id} -> {filing_number}")
                
                # Send confirmation email
                send_email('filing_submitted', filing.user.email, {
                    'business_name': filing.business_name,
                    'filing_number': filing_number,
                    'expected_approval_date': (datetime.now() + timedelta(days=2)).isoformat()
                })
                
                return True
            
            except Exception as e:
                logger.error(f"Filing automation failed: {filing_id}", exc_info=e)
                
                # Update filing with error
                filing.status = 'submission_error'
                filing.sunbiz_rejection_reason = str(e)
                db.commit()
                
                # Alert admin
                send_alert_email(
                    'admin@example.com',
                    f'Filing Automation Error: {filing_id}',
                    str(e)
                )
                
                return False
            
            finally:
                await browser.close()

# Async job runner
async def process_filing_queue():
    """
    Background job to process queued filings
    Runs every 15 minutes
    """
    queued_filings = db.query(Filing).filter_by(status='queued').limit(3).all()
    
    automation = SunBizFilingAutomation()
    
    for filing in queued_filings:
        success = await automation.submit_filing(filing.filing_id)
        
        if not success:
            # Re-queue for retry (up to 3 total attempts)
            filing.submission_attempts += 1
            
            if filing.submission_attempts < 3:
                # Will be retried in next cron cycle
                pass
            else:
                filing.status = 'submission_failed'
                # Notify admin
            
            db.commit()
```

**Security & Rate Limiting:**

```python
import redis
from datetime import datetime, timedelta

class RateLimiter:
    """
    Prevent overloading SunBiz servers
    """
    
    def __init__(self):
        self.redis = redis.Redis(host='localhost', port=6379)
    
    def can_submit(self, filing_id):
        """
        Check if we can submit this filing
        Limits: Max 3 concurrent filings, max 1 per second
        """
        
        # Check concurrent limit
        active_key = 'sunbiz:active_submissions'
        active_count = self.redis.incr(active_key)
        
        if active_count > 3:
            self.redis.decr(active_key)
            return False, "Too many concurrent submissions"
        
        # Check rate limit
        rate_key = f'sunbiz:rate_limit:{filing_id}'
        last_attempt = self.redis.get(rate_key)
        
        if last_attempt:
            return False, "Rate limited, try again in 1 second"
        
        # Mark this submission
        self.redis.setex(rate_key, 1, 'submitted')
        
        return True, "OK"
    
    def release(self, filing_id):
        """
        Release this submission slot
        """
        self.redis.decr('sunbiz:active_submissions')
```

---

## 8. Document Generation

### 8.1 Articles of Organization/Incorporation Generation

**Strategy:** Use Jinja2 templates + WeasyPrint for PDF generation

**Process:**

```
1. Retrieve filing data from database
2. Load appropriate template (LLC vs. Corporation, state-specific)
3. Render template with data
4. Convert to PDF via WeasyPrint
5. Upload to S3
6. Store document metadata in database
7. Return download link to user
```

**Template Structure (Jinja2):**

```html
<!-- templates/articles_of_organization_fl.html -->

<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; margin: 1in; line-height: 1.5; }
        h1 { text-align: center; font-size: 18px; margin-bottom: 20px; }
        .section { page-break-inside: avoid; margin-bottom: 20px; }
        .section-title { font-weight: bold; margin-top: 20px; margin-bottom: 10px; }
        .field-label { font-weight: bold; }
        .signature-line { border-top: 1px solid black; width: 200px; margin-top: 40px; }
    </style>
</head>
<body>
    <h1>ARTICLES OF ORGANIZATION</h1>
    
    <div class="section">
        <div class="section-title">I. LIMITED LIABILITY COMPANY NAME</div>
        <p>The name of the Limited Liability Company is: <strong>{{ business_name }}</strong></p>
    </div>
    
    <div class="section">
        <div class="section-title">II. PRINCIPAL PLACE OF BUSINESS</div>
        <p>{{ principal_address_street1 }}<br/>
           {% if principal_address_street2 %}{{ principal_address_street2 }}<br/>{% endif %}
           {{ principal_address_city }}, {{ principal_address_state }} {{ principal_address_zip }}
        </p>
    </div>
    
    <div class="section">
        <div class="section-title">III. MAILING ADDRESS</div>
        <p>
        {% if mailing_address_same_as_principal %}
            Same as Principal Place of Business
        {% else %}
            {{ mailing_address_street1 }}<br/>
            {% if mailing_address_street2 %}{{ mailing_address_street2 }}<br/>{% endif %}
            {{ mailing_address_city }}, {{ mailing_address_state }} {{ mailing_address_zip }}
        {% endif %}
        </p>
    </div>
    
    <div class="section">
        <div class="section-title">IV. REGISTERED AGENT AND REGISTERED OFFICE</div>
        <p>
            <span class="field-label">Name:</span> {{ registered_agent_name }}<br/>
            <span class="field-label">Address:</span> 
            {{ registered_agent_address_street1 }}<br/>
            {% if registered_agent_address_street2 %}{{ registered_agent_address_street2 }}<br/>{% endif %}
            {{ registered_agent_address_city }}, FL {{ registered_agent_address_zip }}
        </p>
    </div>
    
    <div class="section">
        <div class="section-title">V. MANAGERS AND MEMBERS (OPTIONAL)</div>
        {% if managers_members %}
        <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid black;">
                <th style="text-align: left;">Title</th>
                <th style="text-align: left;">Name</th>
                <th style="text-align: left;">Address</th>
            </tr>
            {% for member in managers_members %}
            <tr>
                <td>{{ member.title }}</td>
                <td>{{ member.name }}</td>
                <td>{{ member.address_city }}, {{ member.address_state }}</td>
            </tr>
            {% endfor %}
        </table>
        {% endif %}
    </div>
    
    <div class="section">
        <div class="section-title">VI. EFFECTIVE DATE</div>
        <p>Effective Date: <strong>{{ effective_date|dateformat }}</strong></p>
    </div>
    
    <div class="section">
        <div class="section-title">VII. SIGNATURE</div>
        <p>I acknowledge that I am authorized to execute this document and that, under penalty of perjury, the foregoing facts are true and accurate.</p>
        
        <p style="margin-top: 60px;">
            Signature: _____________________________
            <br/>
            Printed Name: {{ filer_full_name }}
            <br/>
            Date: {{ signature_date|dateformat }}
        </p>
    </div>
</body>
</html>
```

**Python Implementation:**

```python
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML, CSS
import io
import boto3
from datetime import datetime

class DocumentGenerator:
    
    def __init__(self):
        self.jinja_env = Environment(loader=FileSystemLoader('/app/templates'))
        self.s3 = boto3.client('s3')
    
    def generate_articles(self, filing_id):
        """
        Generate Articles of Organization/Incorporation PDF
        """
        
        filing = db.query(Filing).filter_by(filing_id=filing_id).first()
        
        if not filing:
            raise ValueError(f"Filing not found: {filing_id}")
        
        # Select appropriate template
        if filing.entity_type == 'LLC':
            template_name = 'articles_of_organization_fl.html'
        else:
            template_name = 'articles_of_incorporation_fl.html'
        
        # Prepare context
        context = {
            'business_name': filing.business_name,
            'entity_type': filing.entity_type,
            'principal_address_street1': filing.principal_address_street1,
            'principal_address_street2': filing.principal_address_street2,
            'principal_address_city': filing.principal_address_city,
            'principal_address_state': filing.principal_address_state,
            'principal_address_zip': filing.principal_address_zip,
            'mailing_address_same_as_principal': filing.mailing_address_street1 is None,
            'mailing_address_street1': filing.mailing_address_street1,
            'mailing_address_street2': filing.mailing_address_street2,
            'mailing_address_city': filing.mailing_address_city,
            'mailing_address_state': filing.mailing_address_state,
            'mailing_address_zip': filing.mailing_address_zip,
            'registered_agent_name': filing.registered_agent_name,
            'registered_agent_address_street1': filing.registered_agent_address_street1,
            'registered_agent_address_street2': filing.registered_agent_address_street2,
            'registered_agent_address_city': filing.registered_agent_address_city,
            'registered_agent_address_state': filing.registered_agent_address_state,
            'registered_agent_address_zip': filing.registered_agent_address_zip,
            'managers_members': filing.managers_members,
            'effective_date': filing.effective_date.isoformat(),
            'filer_full_name': filing.filer_full_name,
            'signature_date': datetime.now().isoformat(),
        }
        
        # Render template to HTML
        template = self.jinja_env.get_template(template_name)
        html_content = template.render(context)
        
        # Convert to PDF
        pdf_bytes = HTML(string=html_content).write_pdf()
        
        # Upload to S3
        s3_key = f'documents/{filing_id}/articles_of_organization.pdf'
        
        self.s3.put_object(
            Bucket='incorporation-documents',
            Key=s3_key,
            Body=pdf_bytes,
            ContentType='application/pdf',
            ServerSideEncryption='AES256'
        )
        
        s3_url = f'https://incorporation-documents.s3.amazonaws.com/{s3_key}'
        
        # Store document metadata
        document = Document(
            filing_id=filing_id,
            document_type='articles_of_organization',
            title=f'Articles of Organization - {filing.business_name}',
            s3_bucket='incorporation-documents',
            s3_key=s3_key,
            s3_url=s3_url,
            file_size_bytes=len(pdf_bytes),
            mime_type='application/pdf',
            generated_at=datetime.now()
        )
        
        db.add(document)
        db.commit()
        
        logger.info(f"Generated articles for filing {filing_id}: {s3_url}")
        
        return {
            'document_id': document.document_id,
            's3_url': s3_url,
            'file_size': len(pdf_bytes)
        }
    
    def generate_operating_agreement(self, filing_id):
        """
        Generate Operating Agreement template
        Customized based on member count and user input
        """
        
        filing = db.query(Filing).filter_by(filing_id=filing_id).first()
        
        if filing.entity_type != 'LLC':
            raise ValueError("Operating agreements are for LLCs only")
        
        # Determine template based on member count
        member_count = len(filing.managers_members)
        
        if member_count == 1:
            template_name = 'operating_agreement_single_member_llc.docx'
        else:
            template_name = 'operating_agreement_multi_member_llc.docx'
        
        # Use python-docx to create document
        from docx import Document as DocxDocument
        
        doc = DocxDocument(f'/app/templates/{template_name}')
        
        # Replace placeholders
        for paragraph in doc.paragraphs:
            if '{{LLC_NAME}}' in paragraph.text:
                paragraph.text = paragraph.text.replace('{{LLC_NAME}}', filing.business_name)
            # ... replace other placeholders
        
        # Save to bytes
        doc_bytes = io.BytesIO()
        doc.save(doc_bytes)
        doc_bytes.seek(0)
        
        # Upload to S3
        s3_key = f'documents/{filing_id}/operating_agreement.docx'
        
        self.s3.put_object(
            Bucket='incorporation-documents',
            Key=s3_key,
            Body=doc_bytes.getvalue(),
            ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        
        s3_url = f'https://incorporation-documents.s3.amazonaws.com/{s3_key}'
        
        # Store metadata
        document = Document(
            filing_id=filing_id,
            document_type='operating_agreement',
            title=f'Operating Agreement - {filing.business_name}',
            s3_bucket='incorporation-documents',
            s3_key=s3_key,
            s3_url=s3_url,
            file_size_bytes=len(doc_bytes.getvalue()),
            mime_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            generated_at=datetime.now()
        )
        
        db.add(document)
        db.commit()
        
        return {
            'document_id': document.document_id,
            's3_url': s3_url,
            'format': 'docx'
        }
```

### 8.2 Document Storage & Security

**AWS S3 Configuration:**

```python
# Bucket setup (terraform or AWS CLI)

# Bucket: incorporation-documents
# - Private: No public access
- Encryption: AES-256 (server-side)
- Versioning: Enabled (for accidental deletion recovery)
- Lifecycle policy: Move to Glacier after 30 days, delete after 7 years (FL record retention)

# Signed URLs for temporary access
def generate_download_link(filing_id, document_id, expires_in_hours=24):
    """
    Generate temporary signed URL for document download
    """
    s3 = boto3.client('s3')
    
    document = db.query(Document).filter_by(
        document_id=document_id, 
        filing_id=filing_id
    ).first()
    
    if not document:
        raise ValueError("Document not found")
    
    url = s3.generate_presigned_url(
        'get_object',
        Params={
            'Bucket': document.s3_bucket,
            'Key': document.s3_key
        },
        ExpiresIn=expires_in_hours * 3600
    )
    
    # Log access for audit trail
    db.add(AuditLog(
        action='document_download_link_generated',
        filing_id=filing_id,
        document_id=document_id,
        expires_at=datetime.now() + timedelta(hours=expires_in_hours)
    ))
    db.commit()
    
    return url
```

---

## 9. Email Notification System

### 9.1 Email Triggers & Templates

**Comprehensive Email Schedule:**

| Stage | Email Type | Trigger | Delay | Recipient | Key Variables |
|-------|-----------|---------|-------|-----------|----------------|
| **Post-Registration** | Welcome | User confirms email | Immediate | User | first_name, verification_link |
| **Form Start** | Filing Reminder | User abandons at step 2-12 | 24 hours | User | business_name, step_number, resume_link |
| **Form Start** | Final Reminder | No activity after 24h email | 72 hours | User | business_name, abandon_link |
| **Payment Complete** | Order Confirmation | Payment succeeded | Immediate | User | business_name, filing_number, amount, receipt_link |
| **Post-Payment** | Filing Submitted | Submitted to SunBiz | 1 hour | User | business_name, filing_number, expected_approval |
| **State Processing** | Approval Notice | State approves filing | 1-2 business days | User | business_name, filing_number, approval_date, document_links |
| **State Processing** | Rejection Notice | State rejects filing | Same day (from state) | User | business_name, rejection_reason, support_link |
| **Compliance** | Annual Report (60d) | 60 days before due | 60 days prior | User | business_name, due_date, fee, file_link |
| **Compliance** | Annual Report (30d) | 30 days before due | 30 days prior | User | business_name, due_date, fee, late_fee_warning |
| **Compliance** | Annual Report (Final) | 3 days before due | 3 days prior | User | business_name, due_date, fee, $400_penalty_warning |
| **Compliance** | Annual Report Filed | Report filed successfully | Immediate | User | business_name, filing_number, fee_charged |
| **Operational** | Account Verification | Email not verified after 24h | 24 hours | User | first_name, verify_link |
| **Operational** | Password Reset | User requests reset | Immediate | User | reset_link (expires 1 hour) |
| **Operational** | Login from New Device | First login from new device | Immediate | User | device_info, verify_link |
| **Marketing** | Special Offer (30d) | 30 days after signup (opt-in) | 30 days | User | offer_description, offer_link |

### 9.2 Email Implementation

**Email Queue System:**

```python
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import asyncio

class EmailService:
    """
    Manages email sending and scheduling
    """
    
    def __init__(self, sendgrid_api_key, redis_client):
        self.sendgrid_api_key = sendgrid_api_key
        self.redis = redis_client
        self.sg = SendGridAPIClient(sendgrid_api_key)
    
    def queue_email(self, template_name, recipient_email, variables, schedule_for=None):
        """
        Queue email for sending
        """
        
        notification = EmailNotification(
            notification_type=template_name,
            recipient_email=recipient_email,
            template_name=template_name,
            status='queued',
            created_at=datetime.now(),
            scheduled_at=schedule_for or datetime.now()
        )
        
        db.add(notification)
        db.commit()
        
        return notification.notification_id
    
    async def process_queue(self):
        """
        Background task to send queued emails
        Runs every minute
        """
        
        # Get queued emails due to send
        queued = db.query(EmailNotification).filter(
            EmailNotification.status == 'queued',
            EmailNotification.scheduled_at <= datetime.now()
        ).limit(50).all()
        
        for notification in queued:
            try:
                await self.send_email(notification)
            except Exception as e:
                logger.error(f"Email send failed: {notification.notification_id}", exc_info=e)
                notification.status = 'failed'
                notification.error_message = str(e)
                db.commit()
    
    async def send_email(self, notification):
        """
        Send email via SendGrid
        """
        
        # Build message
        message = Mail()
        message.from_email = Email('noreply@incorporationservice.com', 'Incorporation Service')
        message.to_emails = To(notification.recipient_email)
        message.template_id = self.get_template_id(notification.template_name)
        message.dynamic_template_data = notification.variables or {}
        
        # Send
        try:
            response = self.sg.send(message)
            
            notification.status = 'sent'
            notification.sent_at = datetime.now()
            
            # Store message ID for tracking opens/clicks
            if response.headers.get('X-Message-ID'):
                notification.message_id = response.headers['X-Message-ID']
            
            db.commit()
            
            logger.info(f"Email sent: {notification.notification_id}")
        
        except Exception as e:
            raise
    
    def get_template_id(self, template_name):
        """
        Map template names to SendGrid template IDs
        """
        template_map = {
            'welcome': 'd-123abc...',
            'payment_confirmation': 'd-456def...',
            'filing_submitted': 'd-789ghi...',
            'filing_approved': 'd-012jkl...',
            'filing_rejected': 'd-345mno...',
            'abandoned_reminder_24h': 'd-678pqr...',
            'abandoned_reminder_72h': 'd-901stu...',
            'annual_report_reminder_60': 'd-234vwx...',
            'annual_report_reminder_30': 'd-567yz...',
            'annual_report_reminder_final': 'd-890abc...',
            'annual_report_filed': 'd-123def...',
        }
        
        return template_map.get(template_name)

# Usage
email_service = EmailService(SENDGRID_API_KEY, redis_client)

# Queue an email
email_service.queue_email(
    'payment_confirmation',
    user.email,
    {
        'business_name': 'Acme LLC',
        'filing_number': 'FL20250012345',
        'amount': '$594.99',
        'receipt_link': 'https://...'
    }
)

# Process queued emails (via Celery or APScheduler)
async def scheduled_email_task():
    await email_service.process_queue()
```

**Abandonment Detection & Automated Reminders:**

```python
class AbandonmentService:
    """
    Detects abandoned filings and sends reminder emails
    """
    
    def detect_abandoned_filings(self):
        """
        Find filings that were started but not completed
        Trigger email reminders at 24h and 72h of inactivity
        """
        
        # Find draft filings with >24h inactivity and no reminder email yet
        abandoned_24h = db.query(Filing).filter(
            Filing.status == 'draft',
            Filing.updated_at < datetime.now() - timedelta(hours=24),
        ).outerjoin(
            EmailNotification,
            (EmailNotification.filing_id == Filing.filing_id) & 
            (EmailNotification.notification_type == 'filing_abandoned_reminder')
        ).filter(
            EmailNotification.filing_id == None  # No reminder email sent yet
        ).all()
        
        for filing in abandoned_24h:
            # Find last step completed
            last_step = db.query(FilingStep)\
                .filter_by(filing_id=filing.filing_id)\
                .order_by(FilingStep.step_number.desc())\
                .first()
            
            email_service.queue_email(
                'abandoned_reminder_24h',
                filing.user.email,
                {
                    'business_name': filing.business_name,
                    'step_number': last_step.step_number if last_step else 1,
                    'total_steps': 12,
                    'resume_link': f'https://app.com/resume-filing?filing_id={filing.filing_id}',
                    'first_name': filing.user.first_name
                }
            )
            
            # Mark that reminder was sent
            db.add(EmailNotification(
                filing_id=filing.filing_id,
                user_id=filing.user_id,
                notification_type='filing_abandoned_reminder',
                status='sent',
                sent_at=datetime.now()
            ))
            db.commit()
```

---

## 10. Security Considerations

### 10.1 User Data Protection

**Encryption at Rest:**
- All sensitive user data (SSN, address, etc.) encrypted with AES-256-GCM
- Master key stored in AWS Secrets Manager or HashiCorp Vault
- Per-user encryption keys for maximum privacy

```python
from cryptography.fernet import Fernet

class DataEncryption:
    def __init__(self):
        self.master_key = self.fetch_master_key_from_vault()
    
    def encrypt_field(self, user_id, value):
        """Encrypt a field using user-specific key"""
        f = Fernet(self.derive_user_key(user_id))
        return f.encrypt(value.encode()).decode()
    
    def decrypt_field(self, user_id, encrypted_value):
        """Decrypt field"""
        f = Fernet(self.derive_user_key(user_id))
        return f.decrypt(encrypted_value.encode()).decode()
```

**Encryption in Transit:**
- All communication over HTTPS/TLS 1.2+
- HSTS headers enforced
- API endpoints require HTTPS only

**PII (Personally Identifiable Information) Handling:**
- Minimal collection: Only data required for filing
- SSN: Only for certain S-corp filings (never stored, only forwarded to state)
- Phone numbers: Hashed in database, unencrypted only during state submission
- Addresses: Encrypted at field level

### 10.2 Payment Security (PCI Compliance)

**Stripe Payment Processing:**
- All card data handled by Stripe (never touches our servers)
- Use Stripe.js for tokenized payment
- Server-side: Use only Stripe PaymentIntent API
- PCI DSS Level 1 compliance through Stripe

```python
# CORRECT: Use Stripe token, never raw card data
@app.route('/api/process-payment', methods=['POST'])
def process_payment():
    payment_intent_id = request.json['paymentIntentId']
    
    # Confirm payment on server (payment already tokenized on client)
    intent = stripe.PaymentIntent.retrieve(payment_intent_id)
    
    if intent.status == 'succeeded':
        # Process payment, don't store card details
        update_filing_as_paid(intent.metadata['filing_id'])
    
    return {'success': True}

# WRONG: Never do this
@app.route('/api/process-payment', methods=['POST'])
def process_payment_wrong():
    card_number = request.json['card_number']  # ❌ PCI violation!
    # ... more code
```

### 10.3 Admin Access Controls

**Role-Based Access Control (RBAC):**

```python
class Role(Enum):
    SUPER_ADMIN = 'super_admin'          # Full system access
    STATE_ADMIN = 'state_admin'          # Manage filings for specific state
    SUPPORT_AGENT = 'support_agent'      # View filings, respond to support tickets
    FINANCE = 'finance'                  # View payments and refunds
    DEVELOPER = 'developer'              # API keys, webhooks, monitoring

class Permission(Enum):
    VIEW_ALL_FILINGS = 'view_all_filings'
    EDIT_FILING = 'edit_filing'
    APPROVE_FILING = 'approve_filing'
    VIEW_PAYMENTS = 'view_payments'
    PROCESS_REFUND = 'process_refund'
    VIEW_USERS = 'view_users'
    EDIT_SYSTEM_CONFIG = 'edit_system_config'
    VIEW_LOGS = 'view_logs'

# Database model
class AdminUser(Base):
    __tablename__ = 'admin_users'
    
    admin_id = Column(UUID, primary_key=True)
    email = Column(String(255), unique=True, index=True)
    role = Column(Enum(Role))
    permissions = Column(ARRAY(String), nullable=False)
    assigned_states = Column(ARRAY(String), nullable=True)  # e.g., ['FL', 'CA']
    last_login = Column(DateTime)
    login_failures = Column(Integer, default=0)
    locked_at = Column(DateTime, nullable=True)  # Locked after 5 failed attempts
```

**Admin Action Audit Logging:**

```python
def log_admin_action(admin_user_id, action_type, affected_record, old_values=None, new_values=None):
    """
    Log all admin actions for compliance and debugging
    """
    
    audit_log = AdminAction(
        admin_user_id=admin_user_id,
        action_type=action_type,
        affected_table=affected_record.__class__.__name__,
        affected_record_id=str(affected_record.id),
        old_values=old_values,
        new_values=new_values,
        ip_address=request.remote_addr,
        user_agent=request.headers.get('User-Agent'),
        created_at=datetime.now()
    )
    
    db.add(audit_log)
    db.commit()
    
    # Also log to file for forensics
    logger.info(f"ADMIN ACTION: {admin_user_id} performed {action_type} on {affected_record}", extra={
        'admin_user_id': admin_user_id,
        'action': action_type,
        'record': affected_record.id,
        'ip': request.remote_addr
    })
```

### 10.4 API Key Management

**For Stripe, SendGrid, Namecheap, etc.:**

```python
import os
from dotenv import load_dotenv

# Environment-based configuration
class Config:
    STRIPE_API_KEY = os.getenv('STRIPE_API_KEY_LIVE')  # Never commit keys
    STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
    SENDGRID_API_KEY = os.getenv('SENDGRID_API_KEY')
    NAMECHEAP_API_KEY = os.getenv('NAMECHEAP_API_KEY')
    
    # Validation
    @staticmethod
    def validate():
        required_keys = ['STRIPE_API_KEY', 'STRIPE_WEBHOOK_SECRET']
        for key in required_keys:
            if not os.getenv(key):
                raise ValueError(f"Missing required env var: {key}")

# Deployment (use AWS Secrets Manager or similar)
def fetch_api_keys_from_vault():
    """
    Fetch API keys from AWS Secrets Manager at startup
    Never use hardcoded keys
    """
    import boto3
    client = boto3.client('secretsmanager')
    
    secret = client.get_secret_value(SecretId='incorporation-api-keys')
    return json.loads(secret['SecretString'])
```

### 10.5 Scraping Security

**For SunBiz Name Availability Checking:**

- Use cloudscraper (handles Cloudflare) with residential proxy rotation
- Implement rate limiting (1 req/second max)
- Respect robots.txt and Terms of Service
- Primary source: Local mirror of bulk data (updated nightly)
- Fallback: Live scrape only when necessary
- Log all scraping activities for debugging
- Handle Cloudflare blocks gracefully (don't expose error to user)

---

## 11. Recommended Tech Stack

### 11.1 Frontend

| Technology | Purpose | Rationale |
|-----------|---------|----------|
| **React** 18+ | UI Framework | Component-based, excellent ecosystem, high hiring pool |
| **Next.js** 14+ | Fullstack Framework | Built on React, SSR/SSG, API routes, excellent DX |
| **TypeScript** | Type Safety | Catch bugs at compile-time, improved IDE support |
| **Tailwind CSS** | Styling | Utility-first, fast development, responsive design |
| **Zustand** | State Management | Lightweight, simple API (vs. Redux complexity) |
| **React Query** | Server State | Caching, synchronization, background refetching |
| **Stripe.js** | Payment Integration | Official Stripe library, PCI-compliant tokenization |
| **Google Maps API** | Address Autocomplete | Improve address entry accuracy |
| **Framer Motion** | Animations | Smooth form transitions, abandonment recovery animations |
| **Jest** + **React Testing Library** | Testing | Unit and integration tests |

### 11.2 Backend

| Technology | Purpose | Rationale |
|-----------|---------|----------|
| **Python** 3.11+ | Backend Language | Strong async support, rich library ecosystem |
| **FastAPI** | Web Framework | Modern, async-first, auto-generated API docs |
| **Pydantic** | Data Validation | Type hints, validation, serialization |
| **SQLAlchemy** | ORM | Mature, flexible, excellent PostgreSQL support |
| **Alembic** | Database Migrations | Schema versioning, rollback support |
| **Playwright** | Browser Automation | Headless automation for SunBiz e-filing |
| **Celery** | Async Jobs | E-filing submission, email sending, nightly bulk data ingest |
| **Redis** | Caching & Queuing | Session storage, rate limiting, Celery broker |
| **Pytest** | Testing | Comprehensive testing framework |
| **Pydantic Settings** | Configuration | Environment-based config management |

### 11.3 Database

| Technology | Purpose | Rationale |
|-----------|---------|----------|
| **PostgreSQL** 14+ | Primary Database | JSONB, full-text search, excellent reliability |
| **Supabase** (or self-hosted) | Database Hosting | Managed PostgreSQL, real-time features (future), REST API |
| **pg_stat_statements** | Query Monitoring | Identify slow queries |
| **TimescaleDB** (optional) | Time-Series Data | Analytics events, performance metrics |

### 11.4 File Storage & CDN

| Technology | Purpose | Rationale |
|-----------|---------|----------|
| **AWS S3** | Document Storage | Secure, scalable, integrates with Stripe/SendGrid |
| **CloudFront** | CDN | Cache documents globally, fast downloads |
| **Signed URLs** | Temporary Access | User-specific, expiring document links without auth |

### 11.5 Monitoring, Logging & Analytics

| Technology | Purpose | Rationale |
|-----------|---------|----------|
| **Sentry** | Error Tracking | Real-time exception monitoring, alerting |
| **DataDog** or **New Relic** | APM | Performance monitoring, infrastructure insights |
| **ELK Stack** (Elasticsearch, Logstash, Kibana) | Logging | Centralized logging, searchable error context |
| **Mixpanel** or **Segment** | Product Analytics | User behavior tracking, funnel analysis |
| **Google Analytics 4** | Website Analytics | Traffic sources, user journey |

### 11.6 CI/CD & DevOps

| Technology | Purpose | Rationale |
|-----------|---------|----------|
| **GitHub** | Version Control | Industry standard, good integrations |
| **GitHub Actions** | CI/CD | Native GitHub integration, good free tier |
| **Docker** | Containerization | Reproducible environments, easy scaling |
| **AWS ECS** or **Kubernetes** | Container Orchestration | Managed containers, auto-scaling |
| **Terraform** | Infrastructure as Code | Reproducible AWS provisioning |
| **GitHub Secrets** | Secret Management | Store API keys, database credentials |

### 11.7 Security & Compliance

| Technology | Purpose | Rationale |
|-----------|---------|----------|
| **Auth0** or **Supabase Auth** | Authentication | OAuth2/OIDC, MFA, passwordless options |
| **AWS Secrets Manager** | Secrets Management | Rotate API keys, database credentials |
| **HashiCorp Vault** | Secrets Management | Self-hosted alternative |
| **Snyk** or **Dependabot** | Dependency Scanning | Identify vulnerable packages |
| **OWASP ZAP** | Penetration Testing | Automated security scanning |

### 11.8 Email & Communication

| Technology | Purpose | Rationale |
|-----------|---------|----------|
| **SendGrid** | Transactional Email | High deliverability, template management, webhooks |
| **Mailgun** (alternative) | Email Service | Good API, reasonable pricing |

### 11.9 API Integrations

| Technology | Purpose | Rationale |
|-----------|---------|----------|
| **Stripe** | Payment Processing | Industry-leading, excellent docs, webhooks |
| **Namecheap API** | Domain Registration | Feature-rich, good pricing for resellers |
| **cloudscraper** | Web Scraping | Handles Cloudflare challenges |
| **BeautifulSoup** | HTML Parsing | Simple, effective HTML/XML parsing |

### 11.10 Development Tools

| Technology | Purpose | Rationale |
|-----------|---------|----------|
| **VS Code** | Editor | Free, excellent extensions |
| **Postman** | API Testing | Organize and test API endpoints |
| **pgAdmin** | Database GUI | Visual database management (development only) |
| **pre-commit** | Git Hooks | Auto-format, linting before commits |

---

## 12. Pricing Recommendations

### 12.1 Service Tier Pricing (Florida LLC Formation)

Based on competitive analysis and cost structure:

| Tier | Basic | Standard | Premium |
|------|-------|----------|---------|
| **Formation Fee** | $0 | $99 | $299 |
| **State Filing Fee** | $125 | $125 | $125 |
| **Registered Agent (Year 1)** | Included | Included | Included |
| **Operating Agreement** | Not included | Included | Included |
| **EIN Acquisition** | Not included | Included | Included |
| **Certified Copy** | Not included | 1 included | 1 included |
| **Certificate of Status** | Not included | 1 included | 1 included |
| **Expedited Processing** | Standard (7-10d) | 1-day prep | 1-day prep |
| **Annual Compliance** | Not included | Not included | 1 year included |
| **Domain (1st year)** | Not included | Not included | Included |
| **Support** | Email | Email + Chat | Priority Phone |
| **Total (Base)** | $125 | $224 | $424 |
| **% above State Fee** | 0% | 79% | 239% |

**Positioning:**
- **Basic:** For cost-conscious, tech-savvy founders (DIY-oriented)
- **Standard:** Most popular choice (convert ~60% of Basic users)
- **Premium:** For growth-focused businesses, recurring compliance support

### 12.2 Ancillary Services Pricing

| Service | Price | Renewal | Notes |
|---------|-------|---------|-------|
| **Registered Agent Service** | $0 (Y1) | $119/yr | Free first year, then renewal |
| **EIN Acquisition** | $49 | N/A | One-time; IRS provides free |
| **Operating Agreement** | $49-99 | N/A | Single-member vs. multi-member |
| **Domain Registration (.com)** | $9.99 | $9.99/yr | We markup ~30% on Namecheap wholesale |
| **Domain Registration (.net/.org)** | $8.99 | $8.99/yr | Similar markup |
| **Premium Domains** | Variable | Variable | Pass-through registrar prices |
| **Certificate of Status** | $5 | N/A | Each copy |
| **Certified Copy (Articles)** | $30 | N/A | Each copy |
| **Annual Report Filing** | $99/yr | $99/yr | Managed filing service |
| **S-Corp Election (Form 2553)** | $99 | N/A | One-time filing |
| **Business License Report** | $49 | N/A | State-specific requirements |
| **Annual Compliance Alerts** | $199/yr | $199/yr | Reminders, filing management |

### 12.3 Revenue Mix Projections

**Year 1 Conservative Scenario (500-1,000 formations/month by Dec):**

| Revenue Stream | Proportion | Est. Monthly (Dec) |
|----------------|-----------|------------------|
| Formation services (avg $180/filing) | 40% | $18,000 |
| Registered Agent (Y1 upsells, avg $0 converted to $119 base) | 20% | $11,900 |
| Ancillary services (Operating Agreements, EINs, domains) | 30% | $17,850 |
| Annual Compliance (recurring subscribers) | 10% | $5,950 |
| **Total** | 100% | **$53,700** |

**Expansion Strategy:**
- Y1-2: Focus on formation volume and registered agent renewal
- Y2-3: Build recurring revenue (annual compliance, domains)
- Y3+: B2B partnerships (white-label, API integrations)

### 12.4 Cost Structure

**Operational Costs (Monthly, at 1,000 filings/month scale):**

| Cost | Amount | Notes |
|------|--------|-------|
| Cloud Infrastructure (AWS) | $4,000 | ECS, RDS, S3, Lambda, etc. |
| Stripe Processing Fees (2.9% + $0.30) | $1,500 | ~$52k monthly revenue |
| SendGrid Email Costs | $500 | ~25,000 emails/month |
| SunBiz E-filing Costs | $12,500 | $125 state fee × 1,000 filings |
| Registered Agent (3rd party, if white-label) | $4,000 | ~$4-5 per unit cost to provider |
| Salaries (Engineering, Support) | $25,000 | Varies by team size |
| Customer Acquisition (initial phase) | $5,000 | Marketing, partnerships |
| **Total** | **$52,500** | At 1,000 filings/month |

**Gross Margin:** ~2% initially (due to acquisition costs), improving to 25-40% as scale increases.

---

## 13. Development Phases

### 13.1 Phase 1: MVP (Months 1-3) - Florida LLC Only

**Scope:**
- Florida LLC formation only (no Corporations yet)
- Basic & Standard pricing tiers only
- Essential user flows
- Minimal admin dashboard
- Name availability checking (basic)

**Features:**
- ✅ User registration & login
- ✅ 12-step LLC incorporation form (all required fields)
- ✅ Real-time name availability check (local DB + fallback scrape)
- ✅ Payment processing via Stripe
- ✅ Document generation (Articles of Organization)
- ✅ E-filing automation to SunBiz (basic error handling)
- ✅ Email notifications (confirmations, status updates)
- ✅ User dashboard (filing status, documents)
- ✅ Admin dashboard (filing list, analytics, manual approvals)

**Deliverables:**
- Frontend (React/Next.js)
- Backend (FastAPI + PostgreSQL)
- Playwright-based e-filing automation
- SendGrid email integration
- Stripe payment integration

**Testing:**
- Unit tests (backend)
- Integration tests (API endpoints)
- Manual QA (form flow, payment, filing submission)
- SunBiz sandbox testing (before going live)

**Launch Criteria:**
- Zero payment failures
- 100% correct name availability (validated against real SunBiz data)
- 95%+ successful state filing submissions
- < 1% form abandonment after payment
- Response time < 2s for all pages

### 13.2 Phase 2: Enhanced Features (Months 4-6) - Corporations & Premium Tier

**Scope:**
- Add Corporation formation option
- Premium tier with recurring compliance services
- Advanced admin features
- Ancillary service upsells (EIN, Operating Agreements, domains)

**New Features:**
- ✅ Corporation formation workflow
- ✅ Premium pricing tier
- ✅ Registered Agent service offering
- ✅ Operating Agreement generation
- ✅ EIN acquisition (Form SS-4 auto-fill)
- ✅ Domain registration integration (Namecheap API)
- ✅ Annual report reminders & managed filing
- ✅ Compliance alerts
- ✅ S-Corp election (Form 2553)
- ✅ Advanced admin analytics (conversion funnels, cohort analysis)
- ✅ Abandonment detection & email reminders
- ✅ User dashboard enhancements (annual report tracking, compliance calendar)

**Deliverables:**
- Enhanced form (dynamic steps based on entity type)
- Document generation templates (Corporations, Operating Agreements)
- Namecheap API integration
- Enhanced email system (triggers, scheduling)
- Advanced admin dashboard
- Compliance tracking system

**Testing:**
- Form testing (LLC vs. Corporation flows)
- Payment upsell testing
- Document generation validation
- Annual report automation (test with mocked state)
- Admin interface testing

**Launch Criteria:**
- 50% of users select Premium tier or purchase ancillary services
- Operating Agreement generation > 80% accuracy
- Domain availability check < 500ms
- Annual report filing success rate > 95%

### 13.3 Phase 3: Multi-State Expansion (Months 7-12)

**Scope:**
- Expand to 5 additional states (CA, NY, TX, FL, IL)
- State-specific configurations & requirements
- Bulk data ingestion for each state
- State-specific e-filing automation (varies by state portal)

**New Features:**
- ✅ Multi-state support (configurable entity requirements by state)
- ✅ State-specific pricing & fees
- ✅ State-specific registration agents
- ✅ Multi-state bulk data ingestion (nightly from each state)
- ✅ Multi-state e-filing automation (custom Playwright scripts per state)
- ✅ State-specific annual report workflows
- ✅ State franchiseFilm tax tracking & reminders
- ✅ Multi-state admin dashboard
- ✅ A/B testing framework (pricing experiments per state)

**Deliverables:**
- Multi-state form logic
- State-specific templates & configurations
- State bulk data ingest pipeline
- State-specific e-filing automation (Playwright)
- Enhanced admin state management
- Testing across all 5 states

**Testing:**
- Filing submission testing for each state (sandbox environments)
- State-specific requirements validation
- Bulk data ingestion accuracy
- Admin state-specific filters

**Launch Criteria:**
- All 5 states have >95% filing success rate
- Name availability accuracy > 99% across all states
- Bulk data ingest completes successfully every night
- Support for state-specific fields (e.g., CA franch ise tax disclosures)

### 13.4 Phase 4: Advanced Features & Scaling (Months 13-24)

**Scope:**
- B2B API for partners (accountants, bookkeepers, tax software)
- White-label SaaS for registered agent services
- International business formation (future)
- Advanced compliance automation

**New Features:**
- ✅ RESTful API for B2B partners
- ✅ API key management & billing
- ✅ Webhook delivery for events
- ✅ White-label portal (customizable branding)
- ✅ Advanced reporting (quarterly, annual)
- ✅ Franchise tax calculations & reminders
- ✅ International business structure support
- ✅ Integration with accounting software (QuickBooks, Xero)
- ✅ AI-powered compliance recommendations
- ✅ Blockchain-based document verification (future)

**Deliverables:**
- API documentation (OpenAPI/Swagger)
- API rate limiting & quotas
- White-label infrastructure
- Partner onboarding process
- Advanced integrations

---

## 14. Testing Strategy

### 14.1 Unit Tests

**Backend (Python/FastAPI):**
```python
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def client():
    from app import app
    return TestClient(app)

def test_business_name_validation():
    """Test name validation logic"""
    from app.services.name_validator import validate_llc_name
    
    # Valid names
    assert validate_llc_name("Acme LLC") == (True, None)
    assert validate_llc_name("My Company L.L.C.") == (True, None)
    
    # Invalid names (no suffix)
    assert validate_llc_name("Acme")[0] == False
    
    # Invalid names (too long)
    long_name = "A" * 256
    assert validate_llc_name(long_name)[0] == False

def test_address_normalization():
    """Test USPS address normalization"""
    from app.services.address_normalizer import normalize_address
    
    # Test address correction
    result = normalize_address("123 main st", "miami", "fl", "33101")
    assert result['street'] == "123 Main Street"
    assert result['city'] == "Miami"

def test_create_payment_intent(client):
    """Test Stripe PaymentIntent creation"""
    response = client.post("/api/payments/create-intent", json={
        "filing_id": "test-123",
        "amount_cents": 59499,
        "description": "Test filing"
    })
    
    assert response.status_code == 200
    assert "client_secret" in response.json()
    assert "payment_intent_id" in response.json()
```

**Frontend (React/Jest):**
```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import BusinessNameForm from '@/components/BusinessNameForm';

describe('BusinessNameForm', () => {
  test('renders name input field', () => {
    render(<BusinessNameForm />);
    const input = screen.getByPlaceholderText('Business Name');
    expect(input).toBeInTheDocument();
  });

  test('shows availability status when name is entered', async () => {
    render(<BusinessNameForm />);
    const input = screen.getByPlaceholderText('Business Name');
    
    fireEvent.change(input, { target: { value: 'Acme LLC' } });
    
    // Wait for availability check
    const availableMsg = await screen.findByText('This name is available!');
    expect(availableMsg).toBeInTheDocument();
  });
});
```

### 14.2 Integration Tests

**E2E Form Submission:**
```python
@pytest.mark.asyncio
async def test_complete_llc_filing_flow():
    """Test complete filing from registration to payment"""
    client = TestClient(app)
    
    # Step 1: Register user
    reg_response = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123!"
    })
    assert reg_response.status_code == 201
    user_id = reg_response.json()['user_id']
    
    # Step 2: Start filing
    filing_response = client.post("/api/filings/create", json={
        "entity_type": "LLC",
        "state": "FL"
    })
    assert filing_response.status_code == 200
    filing_id = filing_response.json()['filing_id']
    
    # Step 3: Complete form steps 1-11
    for step in range(1, 12):
        step_data = generate_test_data_for_step(step)
        response = client.post(f"/api/filings/{filing_id}/steps/{step}", json=step_data)
        assert response.status_code == 200
    
    # Step 4: Process payment
    payment_response = client.post("/api/payments/create-intent", json={
        "filing_id": filing_id,
        "amount_cents": 59499
    })
    assert payment_response.status_code == 200
    
    # Simulate Stripe webhook
    webhook_response = client.post("/webhooks/stripe", json={
        "type": "payment_intent.succeeded",
        "data": {
            "object": {
                "id": payment_response.json()['payment_intent_id'],
                "metadata": {"filing_id": filing_id}
            }
        }
    })
    assert webhook_response.status_code == 200
    
    # Verify filing was submitted
    filing = client.get(f"/api/filings/{filing_id}")
    assert filing.json()['status'] == 'submitted'
```

### 14.3 E2E Tests (Playwright)

```python
import asyncio
from playwright.async_api import async_playwright

async def test_user_registration_to_filing():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        # Navigate to app
        await page.goto("https://localhost:3000")
        
        # Sign up
        await page.fill("input[name='email']", "test@example.com")
        await page.fill("input[name='password']", "SecurePass123!")
        await page.click("button:has-text('Sign Up')")
        
        # Wait for email verification
        await page.wait_for_url("**/verify-email")
        
        # Verify email (in test, auto-approve)
        verify_link = "https://localhost:3000/verify-email?token=test-token"
        await page.goto(verify_link)
        
        # Start filing
        await page.click("button:has-text('Start LLC')")
        
        # Complete form steps
        # Step 2: Business name
        await page.fill("input[name='businessName']", "Test Acme LLC")
        availability = await page.text_content("[data-availability]")
        assert "Available" in availability
        
        await page.click("button:has-text('Continue')")
        
        # ... more steps ...
        
        # Payment
        await page.fill("input[name='cardNumber']", "4242 4242 4242 4242")
        await page.fill("input[name='expiry']", "12/25")
        await page.fill("input[name='cvc']", "123")
        await page.click("button:has-text('Pay')")
        
        # Success page
        await page.wait_for_url("**/success")
        confirmation = await page.text_content("[data-filing-number]")
        assert confirmation  # Filing number displayed
        
        await browser.close()
```

### 14.4 SunBiz Sandbox Testing

**Before going live to production SunBiz:**

```python
def test_sunbiz_filing_sandbox():
    """
    Test e-filing against SunBiz sandbox environment
    Uses test credentials provided by Florida DOS
    """
    from app.services.sunbiz_automation import SunBizFilingAutomation
    
    automation = SunBizFilingAutomation(sandbox=True)
    
    # Create test filing data
    test_filing = {
        'business_name': 'Test Company LLC',
        'principal_address': '123 Test St, Miami, FL 33101',
        'registered_agent_name': 'John Test',
        'registered_agent_address': '456 Test Ave, Tampa, FL 33602'
    }
    
    # Submit to sandbox
    result = asyncio.run(automation.submit_filing(test_filing))
    
    assert result['success'] == True
    assert 'filing_number' in result
    assert 'pin' in result
    
    # Verify filing appears in sandbox search
    time.sleep(5)  # Wait for indexing
    
    search_result = automation.search_entity(test_filing['business_name'], sandbox=True)
    assert search_result['found'] == True
    assert search_result['status'] == 'Active'
```

### 14.5 Load Testing

**Using Locust to simulate concurrent users:**

```python
from locust import HttpUser, task, between

class IncorporationUser(HttpUser):
    wait_time = between(1, 3)
    
    @task(3)
    def search_name(self):
        """Simulate name availability checks"""
        self.client.get("/api/domains/check?domain=testcompany.com")
    
    @task(1)
    def complete_filing(self):
        """Simulate complete filing workflow"""
        # Register
        self.client.post("/api/auth/register", json={
            "email": f"test_{uuid4()}@example.com",
            "password": "Test123!"
        })
        
        # Create filing
        response = self.client.post("/api/filings/create", json={
            "entity_type": "LLC"
        })
        
        filing_id = response.json()['filing_id']
        
        # Complete steps
        for step in range(1, 12):
            self.client.post(f"/api/filings/{filing_id}/steps/{step}",
                           json={"step_data": "test"})
        
        # Payment
        self.client.post("/api/payments/create-intent", json={
            "filing_id": filing_id,
            "amount_cents": 59499
        })

# Run: locust -f tests/load_test.py --host=https://localhost:3000
```

---

## 15. Compliance and Legal Considerations

### 15.1 Terms of Service

**Key sections to include:**

1. **Services Description**
   - Clear description of what the platform does/doesn't do
   - Disclaimer: "We are not a law firm; we do not provide legal advice"
   - State that users should consult an attorney for legal matters

2. **User Responsibilities**
   - User warrants that information provided is true and accurate
   - User is responsible for verifying information before submission
   - Filing errors due to user-provided incorrect information are user's responsibility

3. **Limitations of Liability**
   - We are not liable for state filing rejections or delays
   - We are not liable for lost documents or data (backup responsibility on user)
   - Maximum liability capped at amount paid for services

4. **Disclaimer of Warranties**
   - Platform provided "as-is"
   - No guarantee of state approval
   - No guarantee of error-free service

5. **Third-Party Services**
   - Disclosure of integrations (Stripe, SendGrid, SunBiz, etc.)
   - User responsible for third-party terms

### 15.2 Privacy Policy

**GDPR & CCPA Compliance:**

1. **Data Collection**
   - List all data collected (name, email, address, etc.)
   - Purpose: form incorporation, state filing, compliance tracking
   - Retention: minimum 7 years (FL record-keeping), users can request deletion after filing

2. **Data Security**
   - Encryption in transit (HTTPS)
   - Encryption at rest (AES-256)
   - Access controls (RBAC)
   - Audit logging

3. **Data Sharing**
   - SunBiz (state filing)
   - Stripe (payment processing)
   - SendGrid (email)
   - Namecheap (domain registration)
   - No data sales or advertising use

4. **User Rights**
   - Right to access: Download full account data
   - Right to deletion: Except where required by law (7-year FL retention)
   - Right to correction: Edit personal information
   - Right to opt-out: Unsubscribe from marketing emails

5. **Cookie Policy**
   - Session cookies (necessary)
   - Analytics cookies (optional, Google Analytics)
   - Do Not Track: Respect if user has enabled

### 15.3 State-Specific Disclaimers

**Add to every state's formation page:**

```html
<div class="disclaimer">
  <strong>Florida Law Disclaimer:</strong>
  This service assists with filing formation documents with the Florida 
  Department of State, Division of Corporations. We do not provide legal 
  advice. For legal questions, please consult with a Florida-licensed attorney.
  
  <br/><br/>
  
  <strong>State Filing Delays:</strong>
  Florida's Division of Corporations processes filings in the order received. 
  We do not control or guarantee state processing timelines. Current processing 
  times are typically 1-2 business days for online filings.
  
  <br/><br/>
  
  <strong>Legal Entity Requirements:</strong>
  Formation alone does not provide legal protection. You must comply with:
  - Annual report filings
  - Registered agent maintenance
  - Franchise tax obligations (if applicable)
  - Industry-specific licensing requirements
</div>
```

### 15.4 Registered Agent Liability

**If offering registered agent service:**

1. **Service Agreement**
   - Clear definition of responsibilities
   - Availability hours (business hours, Mon-Fri)
   - Document forwarding timeline (same day or next business day)
   - Contact information for agent

2. **Liability Waiver**
   - Company not liable for late service of process if user's contact info is wrong
   - Company not liable for missed deadlines if user fails to update address

3. **Data Privacy**
   - Registered agent's address appears on public records
   - Private mailing address protected (option)
   - No sharing of personal information

### 15.5 Document Generation Disclaimer

**For documents generated by the platform:**

```
DISCLAIMER: These documents are provided as a convenience and are based on 
information you provided. While we strive for accuracy, we do not guarantee:

1. Compliance with all Florida laws or federal laws
2. Suitability for your specific business situation
3. Accuracy of filled-in information (you are responsible for verification)
4. Acceptance by the state or banks/financial institutions

You should have these documents reviewed by an attorney before:
- Filing with the state
- Opening a business bank account
- Making business decisions based on their content

Any errors in these documents are the responsibility of the user. 
The company provides no warranty regarding document accuracy or legality.
```

### 15.6 Refund Policy

**Clear refund terms:**

1. **Refundable Services**
   - State filing fees (if filing rejected by state and unfiled fee refunded by state)
   - Service fees (14-day money-back guarantee if no filing submitted)
   - Ancillary services (EIN, domains, etc.) pro-rated if cancellation before processing

2. **Non-Refundable Services**
   - Registered agent service (if service already provided)
   - Operating agreements (digital product, not returnable)
   - Paid state filing fees (not refundable once state accepts filing)

3. **Refund Process**
   - Customer can request refund via support email
   - Admin reviews within 5 business days
   - Stripe issues refund within 5-10 business days

### 15.7 Registered Agent Licensing

**Important legal note:**

Check if operating a registered agent service requires state licensing:
- Florida may require registered agent service companies to be licensed
- Consult with Florida DOS to understand requirements
- If white-labeling through partners, partners must hold licenses

### 15.8 Legal Disclaimers Throughout App

**On every page:**
```html
<!-- Footer or banner -->
<div class="legal-disclaimer">
  <small>
    This service is provided for informational and filing convenience. 
    It is not a substitute for legal advice. Consult an attorney for 
    legal matters. The state's processing of your filing is not guaranteed 
    and may be delayed or rejected.
  </small>
</div>
```

**On payment page:**
```html
<p>
  By submitting payment, you acknowledge that you have read and agree to 
  our <a href="/terms">Terms of Service</a> and 
  <a href="/privacy">Privacy Policy</a>. You confirm that the information 
  provided is true and accurate.
</p>
```

---

## Summary

This comprehensive developer handoff document provides everything needed to build a full-featured business incorporation platform. The architecture supports the initial Florida launch and future multi-state expansion, with a clear phased development approach.

**Key Success Factors:**
1. **Flawless state filing submission** (>95% success rate)
2. **Frictionless user experience** (< 20 minutes to complete)
3. **Transparent pricing** (no hidden fees)
4. **Excellent compliance support** (automated reminders, managed filing)
5. **Strong security** (PCI-DSS, GDPR/CCPA, encryption)

Good luck with development!
