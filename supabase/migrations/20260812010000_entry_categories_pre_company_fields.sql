-- Pre-company handover fields + documentation tracking.
ALTER TABLE public.finance_entries
  ADD COLUMN IF NOT EXISTS paid_by text,
  ADD COLUMN IF NOT EXISTS reimbursed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accountant_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS documentation_status text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.finance_entries
  DROP CONSTRAINT IF EXISTS finance_entries_documentation_status_check;

ALTER TABLE public.finance_entries
  ADD CONSTRAINT finance_entries_documentation_status_check
  CHECK (documentation_status IN ('unknown', 'missing', 'incomplete', 'complete'));

COMMENT ON COLUMN public.finance_entries.paid_by IS
  'Who paid a pre-company expense (person name). Used to track liability / reimbursement.';
COMMENT ON COLUMN public.finance_entries.reimbursed IS
  'Whether the payer has been reimbursed by the company.';
COMMENT ON COLUMN public.finance_entries.accountant_approved IS
  'Whether the accountant has approved the entry for final booking.';
COMMENT ON COLUMN public.finance_entries.documentation_status IS
  'Documentation readiness: unknown | missing | incomplete | complete.';

-- Soft normalize common category aliases toward controlled taxonomy.
UPDATE public.finance_entries
SET category = 'Varekost',
    category_group = 'Varekost'
WHERE lower(coalesce(category, '')) IN ('varekjøp', 'varekjop', 'råvarer', 'raavarer', 'varekost')
   OR lower(coalesce(category_group, '')) IN ('varekjøp', 'varekjop', 'råvarer', 'raavarer', 'varekost');

UPDATE public.finance_entries
SET category = 'Driftsutstyr',
    category_group = 'Driftsutstyr'
WHERE lower(coalesce(category, '')) IN ('driftsutstyr', 'utstyr', 'equipment');

UPDATE public.finance_entries
SET category = 'Administrasjon',
    category_group = 'Administrasjon'
WHERE lower(coalesce(category, '')) IN ('administrasjon', 'admin', 'overhead');

UPDATE public.finance_entries
SET category = 'Salg',
    category_group = 'Salg'
WHERE entry_type = 'income'
  AND (
    lower(coalesce(category, '')) IN ('salg', 'inntekter', 'income', 'revenue')
    OR lower(coalesce(category_group, '')) IN ('salg', 'inntekter', 'income', 'revenue')
  );

UPDATE public.finance_entries
SET category = 'Driftskostnader',
    category_group = coalesce(nullif(category_group, ''), 'Driftskostnader')
WHERE entry_type = 'expense'
  AND (
    category IS NULL
    OR lower(category) IN ('annet', 'other', 'driftskostnader', 'driftskostnad', 'drift', 'opex')
  );
