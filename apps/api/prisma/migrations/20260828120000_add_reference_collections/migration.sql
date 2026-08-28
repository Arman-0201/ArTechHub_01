-- Reference collections: an encyclopedia of many small, similar entries.
--
-- Purely additive. Three new tables and one new section type; nothing existing
-- is altered, so a deploy that runs this leaves every page, course and section
-- exactly as it was.
--
-- `ALTER TYPE ... ADD VALUE` comes first and is not read again in this
-- migration -- none of the tables below reference `SectionType` -- which is
-- what PostgreSQL requires of an enum extended inside a transaction.

-- AlterEnum
ALTER TYPE "SectionType" ADD VALUE 'COLLECTION_GRID';

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconName" TEXT,
    "eyebrow" TEXT,
    "searchPlaceholder" TEXT,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_categories" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "collection_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_entries" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "categoryId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "summary" TEXT,
    "badge" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'DEFAULT',
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "facts" JSONB NOT NULL DEFAULT '[]',
    "panels" JSONB NOT NULL DEFAULT '[]',
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collections_slug_key" ON "collections"("slug");

-- CreateIndex
CREATE INDEX "collections_status_sortOrder_idx" ON "collections"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "collection_categories_collectionId_sortOrder_idx" ON "collection_categories"("collectionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "collection_categories_collectionId_slug_key" ON "collection_categories"("collectionId", "slug");

-- CreateIndex
CREATE INDEX "collection_entries_collectionId_status_sortOrder_idx" ON "collection_entries"("collectionId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "collection_entries_categoryId_idx" ON "collection_entries"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "collection_entries_collectionId_slug_key" ON "collection_entries"("collectionId", "slug");

-- AddForeignKey
ALTER TABLE "collection_categories" ADD CONSTRAINT "collection_categories_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_entries" ADD CONSTRAINT "collection_entries_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_entries" ADD CONSTRAINT "collection_entries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "collection_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

