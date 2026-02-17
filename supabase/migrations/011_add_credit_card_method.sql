-- 011_add_credit_card_method.sql
-- Expand payment_links.method CHECK constraint to include credit_card

ALTER TABLE payment_links
  DROP CONSTRAINT IF EXISTS payment_links_method_check;

ALTER TABLE payment_links
  ADD CONSTRAINT payment_links_method_check
  CHECK (method IN ('pix', 'boleto', 'credit_card'));
