-- CreateTable
CREATE TABLE "device_calibration" (
    "device_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_calibration_pkey" PRIMARY KEY ("device_id")
);

-- CreateTable
CREATE TABLE "device_progress" (
    "device_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_progress_pkey" PRIMARY KEY ("device_id")
);
