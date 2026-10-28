-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PARTNER');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('PER_FINE_GRAM', 'PER_GROSS_GRAM');

-- CreateEnum
CREATE TYPE "PurchaseType" AS ENUM ('ACCOUNTING', 'FORMAL');

-- CreateEnum
CREATE TYPE "FormalizerStatus" AS ENUM ('AVAILABLE', 'USED');

-- CreateEnum
CREATE TYPE "CapitalMovementType" AS ENUM ('PURCHASE_PAYMENT', 'BATCH_SALE_INCOME', 'CAPITAL_INJECTION', 'CAPITAL_WITHDRAWAL', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('FOUR_PER_THOUSAND', 'OPERATIONAL', 'TRANSPORT', 'MELTING_LAB', 'COMMISSION', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PARTNER',
    "profitSharePercent" DECIMAL(5,2) NOT NULL DEFAULT 50.00,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'OPEN',
    "totalGrossGrams" DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    "totalFineGrams" DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    "totalInvestment" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "averageCostPerFineGram" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "totalSales" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "totalExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "netProfit" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "closedAt" TIMESTAMP(3),
    "formalizerCount" INTEGER,
    "formalizationCostPerPerson" DECIMAL(14,2) DEFAULT 170000.00,
    "formalizationTotalCost" DECIMAL(14,2) DEFAULT 0.00,
    "fourPerThousandAmount" DECIMAL(14,2) DEFAULT 0.00,
    "otherExpensesAmount" DECIMAL(14,2) DEFAULT 0.00,
    "otherExpensesConcept" TEXT,
    "grossSaleAmount" DECIMAL(14,2) DEFAULT 0.00,
    "netSaleAmount" DECIMAL(14,2) DEFAULT 0.00,
    "salePricePerGram" DECIMAL(14,2),
    "soldAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "type" "PurchaseType" NOT NULL DEFAULT 'ACCOUNTING',
    "consecutive" TEXT,
    "supplier" TEXT,
    "vendorDoc" TEXT,
    "vendorAddress" TEXT,
    "vendorPhone" TEXT,
    "vendorCity" TEXT,
    "vendorCountry" TEXT DEFAULT 'Colombia',
    "recipientName" TEXT,
    "recipientDoc" TEXT,
    "recipientAddress" TEXT,
    "description" TEXT,
    "grossGrams" DECIMAL(12,4) NOT NULL,
    "purity" DECIMAL(5,4),
    "purityRaw" INTEGER,
    "fineGrams" DECIMAL(12,4) NOT NULL,
    "pricePerGram" DECIMAL(14,2) NOT NULL,
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'PER_FINE_GRAM',
    "totalCost" DECIMAL(14,2) NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "batchId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL DEFAULT 'company_profile',
    "legalName" TEXT NOT NULL DEFAULT 'DANIEL CAMILO HERRERA RENTERIA',
    "document" TEXT NOT NULL DEFAULT '1.078.000.069',
    "address" TEXT NOT NULL DEFAULT 'CR 8 CL 30 8 07',
    "phone" TEXT DEFAULT '',
    "city" TEXT DEFAULT 'Quibdó',
    "country" TEXT DEFAULT 'Colombia',
    "consecutivePrefix" TEXT NOT NULL DEFAULT 'DH-',
    "lastConsecutiveNum" INTEGER NOT NULL DEFAULT 0,
    "currentCapital" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formalizers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Quibdó-Chocó',
    "country" TEXT NOT NULL DEFAULT 'Colombia',
    "status" "FormalizerStatus" NOT NULL DEFAULT 'AVAILABLE',
    "usedInBatchId" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formalizers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capital_movements" (
    "id" TEXT NOT NULL,
    "type" "CapitalMovementType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceBefore" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capital_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "customer" TEXT,
    "description" TEXT,
    "grossGrams" DECIMAL(12,4),
    "fineGrams" DECIMAL(12,4),
    "pricePerGram" DECIMAL(14,2),
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batchId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OPERATIONAL',
    "amount" DECIMAL(14,2) NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batchId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "totalSales" DECIMAL(14,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "totalExpenses" DECIMAL(14,2) NOT NULL,
    "netProfit" DECIMAL(14,2) NOT NULL,
    "clientProfit" DECIMAL(14,2) NOT NULL,
    "partnerProfit" DECIMAL(14,2) NOT NULL,
    "clientPercent" DECIMAL(5,2) NOT NULL,
    "partnerPercent" DECIMAL(5,2) NOT NULL,
    "settlementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "batches_code_key" ON "batches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_consecutive_key" ON "purchases"("consecutive");

-- CreateIndex
CREATE UNIQUE INDEX "formalizers_document_key" ON "formalizers"("document");

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formalizers" ADD CONSTRAINT "formalizers_usedInBatchId_fkey" FOREIGN KEY ("usedInBatchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
