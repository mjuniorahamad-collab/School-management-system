-- "Online Payment / UPI" is a MANUAL (staff-recorded) fee payment method.
-- Funds are collected outside the system (a UPI app or a bank transfer) and
-- entered by staff, exactly like CASH / CHEQUE / BANK_TRANSFER. There is no
-- gateway, no callback, no webhook and no server-side verification.
--
-- ALTER TYPE ... ADD VALUE takes a brief lock on the type only; FeePayment and
-- FeeReceipt rows are not rewritten and no backfill is required. Safe on
-- PostgreSQL 16 (non-transactional ADD VALUE has been permitted since PG 12).
ALTER TYPE "PaymentMethod" ADD VALUE 'UPI';
