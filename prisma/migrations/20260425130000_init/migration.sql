-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Filing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'LLC',
    "state" TEXT NOT NULL DEFAULT 'FL',
    "businessName" TEXT,
    "nameAvailable" BOOLEAN,
    "nameCheckedAt" TIMESTAMP(3),
    "serviceTier" TEXT NOT NULL DEFAULT 'STANDARD',
    "principalAddress" TEXT,
    "mailingAddress" TEXT,
    "registeredAgent" TEXT,
    "correspondenceContact" TEXT,
    "optionalDetails" TEXT,
    "incorporatorSignature" TEXT,
    "incorporatorSignedAt" TIMESTAMP(3),
    "confirmationAccepted" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "completedSteps" TEXT NOT NULL DEFAULT '[]',
    "sunbizFilingNumber" TEXT,
    "sunbizTrackingNumber" TEXT,
    "sunbizPin" TEXT,
    "sunbizSubmittedAt" TIMESTAMP(3),
    "sunbizApprovedAt" TIMESTAMP(3),
    "sunbizRejectionReason" TEXT,
    "stateFeeCents" INTEGER NOT NULL DEFAULT 0,
    "serviceFeeCents" INTEGER NOT NULL DEFAULT 0,
    "addOnsTotalCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),

    CONSTRAINT "Filing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilingStep" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataSnapshot" TEXT NOT NULL,

    CONSTRAINT "FilingStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerMember" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "street1" TEXT,
    "street2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "ownershipPercentage" DOUBLE PRECISION,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stateFilingFeeCents" INTEGER NOT NULL DEFAULT 0,
    "formationServiceFeeCents" INTEGER NOT NULL DEFAULT 0,
    "registeredAgentY1Cents" INTEGER NOT NULL DEFAULT 0,
    "operatingAgreementCents" INTEGER NOT NULL DEFAULT 0,
    "einCents" INTEGER NOT NULL DEFAULT 0,
    "domainCents" INTEGER NOT NULL DEFAULT 0,
    "certificatesCopiesCents" INTEGER NOT NULL DEFAULT 0,
    "otherServicesCents" INTEGER NOT NULL DEFAULT 0,
    "cardLast4" TEXT,
    "cardBrand" TEXT,
    "cardholderName" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "base64" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "fileSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloadedCount" INTEGER NOT NULL DEFAULT 0,
    "lastDownloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "llcFilingFeeCents" INTEGER NOT NULL,
    "corpFilingFeeCents" INTEGER NOT NULL,
    "raFeeCents" INTEGER NOT NULL,
    "llcAnnualReportFeeCents" INTEGER NOT NULL,
    "corpAnnualReportFeeCents" INTEGER NOT NULL,
    "annualReportLateFeeCents" INTEGER NOT NULL,
    "standardProcessingDays" INTEGER NOT NULL,
    "expressProcessingDays" INTEGER,
    "expressProcessingFeeCents" INTEGER,
    "requiresAnnualReport" BOOLEAN NOT NULL DEFAULT true,
    "annualReportDueMonth" INTEGER NOT NULL DEFAULT 1,
    "annualReportDueDay" INTEGER NOT NULL DEFAULT 1,
    "annualReportEndMonth" INTEGER NOT NULL DEFAULT 5,
    "annualReportEndDay" INTEGER NOT NULL DEFAULT 1,
    "allowsOnlineFiling" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "formationWizardUrl" TEXT,
    "searchUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingTier" (
    "id" TEXT NOT NULL,
    "tierName" TEXT NOT NULL,
    "tierSlug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "basePriceCents" INTEGER NOT NULL,
    "includedFeatures" TEXT NOT NULL,
    "includesRegisteredAgentY1" BOOLEAN NOT NULL DEFAULT false,
    "includesOperatingAgreement" BOOLEAN NOT NULL DEFAULT false,
    "includesEin" BOOLEAN NOT NULL DEFAULT false,
    "includesExpedited" BOOLEAN NOT NULL DEFAULT false,
    "includesCertifiedCopy" BOOLEAN NOT NULL DEFAULT false,
    "includesCertificateOfStatus" BOOLEAN NOT NULL DEFAULT false,
    "includesAnnualCompliance" BOOLEAN NOT NULL DEFAULT false,
    "includesDomain" BOOLEAN NOT NULL DEFAULT false,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdditionalService" (
    "id" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "serviceSlug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iconKey" TEXT,
    "priceCents" INTEGER NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringInterval" TEXT,
    "applicableTypes" TEXT NOT NULL DEFAULT '["LLC","CORP"]',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT NOT NULL DEFAULT 'formation',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdditionalService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilingAdditionalService" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priceCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "purchasedAt" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilingAdditionalService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegisteredAgentService" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "serviceProvider" TEXT NOT NULL DEFAULT 'INTERNAL',
    "providerName" TEXT,
    "agentName" TEXT NOT NULL,
    "agentEmail" TEXT,
    "agentPhone" TEXT,
    "street1" TEXT NOT NULL,
    "street2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "renewalDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegisteredAgentService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailNotification" (
    "id" TEXT NOT NULL,
    "filingId" TEXT,
    "userId" TEXT,
    "notificationType" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualReport" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "reportYear" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "filedDate" TIMESTAMP(3),
    "sunbizFilingNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "filingFeeCents" INTEGER NOT NULL,
    "lateFeeCents" INTEGER NOT NULL DEFAULT 0,
    "totalCostCents" INTEGER NOT NULL DEFAULT 0,
    "reminder60Sent" BOOLEAN NOT NULL DEFAULT false,
    "reminder30Sent" BOOLEAN NOT NULL DEFAULT false,
    "reminderFinalSent" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAction" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "filingId" TEXT,
    "actionType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "oldValues" TEXT,
    "newValues" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "filingId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventData" TEXT,
    "pageUrl" TEXT,
    "referrer" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Filing_sunbizFilingNumber_key" ON "Filing"("sunbizFilingNumber");

-- CreateIndex
CREATE INDEX "Filing_userId_status_createdAt_idx" ON "Filing"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FilingStep_filingId_stepNumber_key" ON "FilingStep"("filingId", "stepNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Payment_filingId_status_idx" ON "Payment"("filingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "State_stateCode_key" ON "State"("stateCode");

-- CreateIndex
CREATE UNIQUE INDEX "PricingTier_tierSlug_key" ON "PricingTier"("tierSlug");

-- CreateIndex
CREATE UNIQUE INDEX "AdditionalService_serviceSlug_key" ON "AdditionalService"("serviceSlug");

-- CreateIndex
CREATE UNIQUE INDEX "FilingAdditionalService_filingId_serviceId_key" ON "FilingAdditionalService"("filingId", "serviceId");

-- CreateIndex
CREATE INDEX "EmailNotification_userId_notificationType_createdAt_idx" ON "EmailNotification"("userId", "notificationType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualReport_filingId_reportYear_key" ON "AnnualReport"("filingId", "reportYear");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_userId_eventType_createdAt_idx" ON "AnalyticsEvent"("userId", "eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "Filing" ADD CONSTRAINT "Filing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingStep" ADD CONSTRAINT "FilingStep_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerMember" ADD CONSTRAINT "ManagerMember_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingAdditionalService" ADD CONSTRAINT "FilingAdditionalService_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingAdditionalService" ADD CONSTRAINT "FilingAdditionalService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "AdditionalService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegisteredAgentService" ADD CONSTRAINT "RegisteredAgentService_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailNotification" ADD CONSTRAINT "EmailNotification_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailNotification" ADD CONSTRAINT "EmailNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReport" ADD CONSTRAINT "AnnualReport_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

