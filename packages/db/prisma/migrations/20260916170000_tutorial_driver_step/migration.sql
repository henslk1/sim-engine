-- Nullable so existing players can import their browser checkpoint once.
ALTER TABLE "PlayerSeniority" ADD COLUMN "tutorialDriverStep" INTEGER;
