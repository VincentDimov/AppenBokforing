-- CreateTable
CREATE TABLE "bootstrap_markers" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bootstrap_markers_pkey" PRIMARY KEY ("id")
);
