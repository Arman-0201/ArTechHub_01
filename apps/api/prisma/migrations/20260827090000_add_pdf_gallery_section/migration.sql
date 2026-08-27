-- Adds the PDF gallery section type.
--
-- `ALTER TYPE ... ADD VALUE` is additive: existing rows and every section type
-- already in use are untouched, so a page built before this migration renders
-- exactly as it did. The new value is only added here, never read in the same
-- transaction, which is what PostgreSQL requires of an enum extension inside
-- a migration block.
ALTER TYPE "SectionType" ADD VALUE IF NOT EXISTS 'PDF_GALLERY';
