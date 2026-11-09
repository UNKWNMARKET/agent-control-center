-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AgencyStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'AGENT');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTED', 'SOLD', 'LOST', 'DNC');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CREATED', 'IMPORTED', 'NOTE', 'STATUS_CHANGE', 'ASSIGNMENT', 'CALL', 'SMS', 'EMAIL', 'DNC');

-- CreateEnum
CREATE TYPE "DncStatus" AS ENUM ('UNKNOWN', 'OK', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "AgencyStatus" NOT NULL DEFAULT 'ACTIVE',
    "monthlyFee" DOUBLE PRECISION,
    "paidThrough" TIMESTAMP(3),
    "billingNotes" TEXT,
    "state" TEXT NOT NULL DEFAULT 'FL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DncEntry" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DncEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'AGENT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "monthlyGoal" INTEGER,
    "isPlatformOwner" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'AGENT',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "webhookToken" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "costPerLead" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "agencyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("agencyId","key")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "phoneSecondary" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "dob" TEXT,
    "maritalStatus" TEXT,
    "product" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "premium" DOUBLE PRECISION,
    "carrier" TEXT,
    "policyNumber" TEXT,
    "effectiveDate" TEXT,
    "policyExpiresAt" TIMESTAMP(3),
    "currentCarrier" TEXT,
    "notes" TEXT,
    "externalId" TEXT,
    "source" TEXT,
    "rawPayload" JSONB,
    "vehicles" JSONB,
    "property" JSONB,
    "permits" JSONB,
    "propertyCheckedAt" TIMESTAMP(3),
    "dncStatus" "DncStatus" NOT NULL DEFAULT 'UNKNOWN',
    "dncReason" TEXT,
    "dncCheckedAt" TIMESTAMP(3),
    "followUpAt" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vendorId" TEXT,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contactedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "smsOptOut" BOOLEAN NOT NULL DEFAULT false,
    "initialSmsAt" TIMESTAMP(3),
    "followupSmsAt" TIMESTAMP(3),
    "isCustomer" BOOLEAN NOT NULL DEFAULT false,
    "drivers" JSONB,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "product" TEXT,
    "carrier" TEXT,
    "policyNumber" TEXT,
    "premium" DOUBLE PRECISION,
    "termMonths" INTEGER NOT NULL DEFAULT 12,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "soldById" TEXT,
    "autoIncluded" BOOLEAN NOT NULL DEFAULT false,
    "homeownerDiscount" BOOLEAN NOT NULL DEFAULT false,
    "packagePolicy" BOOLEAN NOT NULL DEFAULT false,
    "priorAutoDeclared" BOOLEAN NOT NULL DEFAULT false,
    "windMitDiscount" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDocument" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "policyId" TEXT,
    "kind" TEXT,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "ActivityType" NOT NULL DEFAULT 'NOTE',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agency_slug_key" ON "Agency"("slug");

-- CreateIndex
CREATE INDEX "Agency_status_idx" ON "Agency"("status");

-- CreateIndex
CREATE INDEX "DncEntry_agencyId_idx" ON "DncEntry"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "DncEntry_agencyId_phone_key" ON "DncEntry"("agencyId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_agencyId_idx" ON "User"("agencyId");

-- CreateIndex
CREATE INDEX "User_agencyId_active_idx" ON "User"("agencyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE INDEX "Invite_agencyId_idx" ON "Invite"("agencyId");

-- CreateIndex
CREATE INDEX "Invite_email_idx" ON "Invite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_webhookToken_key" ON "Vendor"("webhookToken");

-- CreateIndex
CREATE INDEX "Vendor_agencyId_idx" ON "Vendor"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_agencyId_slug_key" ON "Vendor"("agencyId", "slug");

-- CreateIndex
CREATE INDEX "Lead_agencyId_idx" ON "Lead"("agencyId");

-- CreateIndex
CREATE INDEX "Lead_agencyId_status_idx" ON "Lead"("agencyId", "status");

-- CreateIndex
CREATE INDEX "Lead_agencyId_assignedToId_idx" ON "Lead"("agencyId", "assignedToId");

-- CreateIndex
CREATE INDEX "Lead_agencyId_createdAt_idx" ON "Lead"("agencyId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_agencyId_followUpAt_idx" ON "Lead"("agencyId", "followUpAt");

-- CreateIndex
CREATE INDEX "Lead_agencyId_dncStatus_idx" ON "Lead"("agencyId", "dncStatus");

-- CreateIndex
CREATE INDEX "Lead_vendorId_idx" ON "Lead"("vendorId");

-- CreateIndex
CREATE INDEX "Lead_propertyCheckedAt_idx" ON "Lead"("propertyCheckedAt");

-- CreateIndex
CREATE INDEX "Policy_agencyId_idx" ON "Policy"("agencyId");

-- CreateIndex
CREATE INDEX "Policy_agencyId_status_idx" ON "Policy"("agencyId", "status");

-- CreateIndex
CREATE INDEX "Policy_agencyId_expiresAt_idx" ON "Policy"("agencyId", "expiresAt");

-- CreateIndex
CREATE INDEX "Policy_soldById_idx" ON "Policy"("soldById");

-- CreateIndex
CREATE INDEX "Policy_leadId_idx" ON "Policy"("leadId");

-- CreateIndex
CREATE INDEX "PolicyDocument_policyId_idx" ON "PolicyDocument"("policyId");

-- CreateIndex
CREATE INDEX "PolicyDocument_leadId_idx" ON "PolicyDocument"("leadId");

-- CreateIndex
CREATE INDEX "PolicyDocument_leadId_kind_idx" ON "PolicyDocument"("leadId", "kind");

-- CreateIndex
CREATE INDEX "Activity_leadId_idx" ON "Activity"("leadId");

-- AddForeignKey
ALTER TABLE "DncEntry" ADD CONSTRAINT "DncEntry_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDocument" ADD CONSTRAINT "PolicyDocument_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDocument" ADD CONSTRAINT "PolicyDocument_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

