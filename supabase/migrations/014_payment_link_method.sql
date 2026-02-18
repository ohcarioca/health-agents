-- 014_payment_link_method.sql
-- Add 'link' method to payment_links for universal payment links (patient chooses method on Asaas page)

ALTER TABLE payment_links
  DROP CONSTRAINT IF EXISTS payment_links_method_check;

ALTER TABLE payment_links
  ADD CONSTRAINT payment_links_method_check
  CHECK (method IN ('pix', 'boleto', 'credit_card', 'link'));
