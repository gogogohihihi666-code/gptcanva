-- CanvasMind commercial payment closure phase 1.
-- Adds verifiable payment transaction records, benefit grants, and safer order states.

ALTER TABLE `membership_orders`
  MODIFY `status` ENUM(
    'PENDING',
    'PAYING',
    'PAID',
    'BENEFIT_GRANTED',
    'CANCELED',
    'FAILED',
    'REFUNDING',
    'REFUNDED',
    'PARTIAL_REFUNDED',
    'CLOSED'
  ) NOT NULL DEFAULT 'PENDING';

ALTER TABLE `recharge_orders`
  MODIFY `pay_status` ENUM(
    'PENDING',
    'PAYING',
    'PAID',
    'BENEFIT_GRANTED',
    'FAILED',
    'CANCELED',
    'CLOSED',
    'REFUNDING',
    'REFUNDED',
    'PARTIAL_REFUNDED'
  ) NOT NULL DEFAULT 'PENDING';

ALTER TABLE `point_account_logs`
  ADD COLUMN `idempotency_key` VARCHAR(128) NULL,
  ADD UNIQUE INDEX `uk_point_account_logs_idempotency_key`(`idempotency_key`);

CREATE TABLE `payment_transactions` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `order_type` ENUM('MEMBERSHIP', 'RECHARGE') NOT NULL,
  `order_no` VARCHAR(64) NOT NULL,
  `provider` VARCHAR(32) NOT NULL DEFAULT 'LOCAL',
  `provider_payment_id` VARCHAR(128) NULL,
  `provider_transaction_id` VARCHAR(128) NULL,
  `channel` ENUM('ALIPAY', 'WECHAT', 'MANUAL', 'OTHER') NOT NULL,
  `channel_transaction_no` VARCHAR(128) NOT NULL,
  `idempotency_key` VARCHAR(128) NULL,
  `status` ENUM('RECEIVED', 'INTENT_CREATED', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'RECEIVED',
  `expected_amount` DECIMAL(10, 2) NOT NULL,
  `paid_amount` DECIMAL(10, 2) NOT NULL,
  `currency` VARCHAR(16) NOT NULL DEFAULT 'CNY',
  `verified_at` DATETIME(3) NULL,
  `paid_at` DATETIME(3) NULL,
  `failure_reason` VARCHAR(255) NULL,
  `raw_payload_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `uk_payment_transactions_channel_no`(`order_type`, `channel`, `channel_transaction_no`),
  UNIQUE INDEX `uk_payment_transactions_order_idempotency`(`order_type`, `order_no`, `idempotency_key`),
  UNIQUE INDEX `uk_payment_transactions_provider_payment_id`(`provider`, `provider_payment_id`),
  UNIQUE INDEX `uk_payment_transactions_provider_transaction_id`(`provider`, `provider_transaction_id`),
  INDEX `idx_payment_transactions_user_created_at`(`user_id`, `created_at`),
  INDEX `idx_payment_transactions_provider_order`(`provider`, `order_type`, `order_no`),
  INDEX `idx_payment_transactions_order_status`(`order_type`, `order_no`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `benefit_grants` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `order_type` ENUM('MEMBERSHIP', 'RECHARGE') NOT NULL,
  `order_no` VARCHAR(64) NOT NULL,
  `grant_type` ENUM('MEMBERSHIP', 'POINTS', 'MEMBERSHIP_BONUS_POINTS') NOT NULL,
  `status` ENUM('PENDING', 'SUCCESS', 'FAILED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
  `benefit_id` VARCHAR(64) NULL,
  `payment_transaction_id` VARCHAR(36) NULL,
  `amount` INTEGER NOT NULL DEFAULT 0,
  `reason` VARCHAR(255) NULL,
  `meta_json` JSON NULL,
  `granted_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `uk_benefit_grants_order_type`(`order_type`, `order_no`, `grant_type`),
  INDEX `idx_benefit_grants_user_created_at`(`user_id`, `created_at`),
  INDEX `idx_benefit_grants_payment_transaction_id`(`payment_transaction_id`),
  INDEX `idx_benefit_grants_order_status`(`order_type`, `order_no`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `payment_transactions`
  ADD CONSTRAINT `fk_payment_transactions_user`
  FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `benefit_grants`
  ADD CONSTRAINT `fk_benefit_grants_user`
  FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `benefit_grants`
  ADD CONSTRAINT `fk_benefit_grants_payment_transaction`
  FOREIGN KEY (`payment_transaction_id`) REFERENCES `payment_transactions`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
