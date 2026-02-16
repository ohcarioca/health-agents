# Settings UI Improvements Design

## Problem

The current settings page is missing critical configuration:
- No UI for services (name, duration, price)
- No UI for insurance plans (convênios)
- No clinic operating hours configuration
- No way to assign services to professionals with per-professional pricing
- The professional schedule grid editor is excessively tall (shows all 7 days expanded)

## Decisions

| Question | Answer |
|----------|--------|
| Schedule UI | Compact weekly visual grid (calendar-like, click to toggle 30min blocks) |
| Pricing model | Per-professional (junction table `professional_services`) |
| Insurance fields | Name only (simple list) |
| Service-professional linking | Inside professional form (subtabs) |
| Clinic operating hours | Yes, in clinic tab with same visual grid component |

## Design

### Tab Structure (updated)

```
Clínica | Profissionais | Serviços | Convênios | Integrações | WhatsApp
```

Replaces the "Pacientes" placeholder tab with "Serviços" and adds "Convênios".

### 1. Compact Weekly Schedule Grid (shared component)

Replaces the current `ScheduleGridEditor`. Used by both clinic operating hours and professional schedule.

**Layout:**
```
        06  07  08  09  10  11  12  13  14  15  16  17  18  19  20  21
Seg     [  ][██][██][██][██][██][██][  ][██][██][██][██][  ][  ][  ][  ]
Ter     [  ][██][██][██][██][██][██][  ][██][██][██][██][  ][  ][  ][  ]
Qua     [  ][██][██][██][██][██][██][  ][██][██][██][██][  ][  ][  ][  ]
Qui     [  ][██][██][██][██][██][██][  ][██][██][██][██][  ][  ][  ][  ]
Sex     [  ][██][██][██][██][██][██][  ][██][██][██][██][  ][  ][  ][  ]
Sáb     [  ][██][██][██][██][  ][  ][  ][  ][  ][  ][  ][  ][  ][  ][  ]
Dom     [  ][  ][  ][  ][  ][  ][  ][  ][  ][  ][  ][  ][  ][  ][  ][  ]
```

- Each cell = 30min slot. Click to toggle. Drag to select range.
- Active = accent color. Inactive = surface color.
- Fits ~600px width. Mobile: horizontal scroll with sticky day labels.
- Shortcut buttons: "Copy Mon to all", "Clear all"
- Internally still produces the same `ScheduleGrid` JSON format for backward compat.

### 2. Clinic Tab — Operating Hours

Add a "Horário de Funcionamento" section below the existing clinic fields.
Uses the compact weekly grid. Saves to `clinics.operating_hours` (JSONB, already exists).

### 3. Services Tab (new, replaces Patients placeholder)

CRUD list with dialog-based add/edit.

| Field | Type | Validation |
|-------|------|-----------|
| Name | text | required, 2-100 chars |
| Duration (min) | number | 5-480, default 30 |
| Base price (R$) | currency input | optional, stored as cents |

- Card list showing name, duration, price
- Dialog for add/edit
- Delete with confirmation
- No pagination needed (clinics typically have <20 services)

### 4. Insurance Plans Tab (new)

Minimal CRUD — inline add with list:

- Input field + "Add" button at top
- List of name badges with delete button
- No dialog needed — inline creation
- Delete with confirmation

### 5. Professional Form — Internal Subtabs

The professional add/edit dialog gains 3 subtabs:

**"Dados" subtab:** name, specialty, default duration (existing fields)

**"Horário" subtab:** compact weekly grid (same shared component)

**"Serviços & Preços" subtab:**
- Checkbox list of clinic services
- Each checked service shows a price input field
- Example: `[x] Consulta Cardiológica — R$ 250,00`
- Unchecked = professional doesn't offer this service
- Requires `professional_services` junction table

### 6. Database Migration

```sql
-- 009_professional_services.sql
create table professional_services (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  price_cents integer not null,
  created_at timestamptz not null default now(),
  unique (professional_id, service_id)
);

-- RLS
alter table professional_services enable row level security;

create policy "Users can manage professional_services for their clinic"
  on professional_services for all
  using (
    exists (
      select 1 from professionals p
      join clinic_users cu on cu.clinic_id = p.clinic_id
      where p.id = professional_services.professional_id
        and cu.user_id = auth.uid()
    )
  );
```

### 7. API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/settings/services` | GET | List services for clinic |
| `/api/settings/services` | POST | Create service |
| `/api/settings/services/[id]` | PUT | Update service |
| `/api/settings/services/[id]` | DELETE | Delete service |
| `/api/settings/insurance-plans` | GET | List insurance plans |
| `/api/settings/insurance-plans` | POST | Create plan |
| `/api/settings/insurance-plans/[id]` | DELETE | Delete plan |
| `/api/settings/professionals/[id]/services` | GET | List professional's services with prices |
| `/api/settings/professionals/[id]/services` | PUT | Upsert professional's service assignments |

### 8. Validation Schemas (Zod)

```typescript
// Services
export const createServiceSchema = z.object({
  name: z.string().min(2).max(100),
  duration_minutes: z.number().int().min(5).max(480).default(30),
  price_cents: z.number().int().min(0).optional(),
});

// Insurance plans
export const createInsurancePlanSchema = z.object({
  name: z.string().min(2).max(100),
});

// Professional services (upsert)
export const upsertProfessionalServicesSchema = z.object({
  services: z.array(z.object({
    service_id: z.string().uuid(),
    price_cents: z.number().int().min(0),
  })),
});
```

### 9. Files to Create/Modify

**New files:**
- `src/components/settings/compact-schedule-grid.tsx` — shared visual grid
- `src/components/settings/services-list.tsx` — services CRUD
- `src/components/settings/insurance-plans-list.tsx` — plans CRUD
- `src/components/settings/professional-services-form.tsx` — service assignment subtab
- `src/app/api/settings/services/route.ts` — GET/POST
- `src/app/api/settings/services/[id]/route.ts` — PUT/DELETE
- `src/app/api/settings/insurance-plans/route.ts` — GET/POST
- `src/app/api/settings/insurance-plans/[id]/route.ts` — DELETE
- `src/app/api/settings/professionals/[id]/services/route.ts` — GET/PUT
- `supabase/migrations/009_professional_services.sql`

**Modified files:**
- `src/app/(dashboard)/settings/page.tsx` — update tabs
- `src/components/settings/professional-form.tsx` — add subtabs
- `src/components/settings/clinic-form.tsx` — add operating hours section
- `src/lib/validations/settings.ts` — add new schemas
- `src/types/database.ts` — add `professional_services` type
- `messages/pt-BR.json`, `messages/en.json`, `messages/es.json` — new translation keys
