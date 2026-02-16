# Calendar Page Design

## Goal

Add a full appointment management calendar page to the sidebar. Users can visualize, create, edit, cancel, and reschedule appointments in a visual grid — week, day, or month view.

## Decisions

| Question | Answer |
|----------|--------|
| Scope | Full management: view + create + edit + cancel + reschedule |
| Default view | Weekly (switchable to day/month) |
| Professional display | All professionals on same grid, differentiated by color |
| New appointment interaction | Click empty slot → modal with pre-filled day/time |
| Implementation approach | Custom CSS Grid (no external calendar lib) |

## Architecture

### Navigation

New sidebar item between "Inbox" and "Módulos":
- Icon: `CalendarDays` (Lucide)
- Label: "Agenda" (translation key: `nav.calendar`)
- Route: `/calendar`

### Page Layout

```
┌─────────────────────────────────────────────────────┐
│  Agenda          < Hoje >     Dia | Semana | Mês    │
│                               [Filtro profissional] │
├─────────────────────────────────────────────────────┤
│        Seg 17   Ter 18   Qua 19   Qui 20   ...     │
│  06:00  ░░░░░    ░░░░░    ░░░░░    ░░░░░           │
│  06:30  ░░░░░    ░░░░░    ░░░░░    ░░░░░           │
│  07:00  ░░░░░    ░░░░░    ░░░░░    ░░░░░           │
│  ...                                                │
│  09:00  ░░░░░    ██████   ░░░░░    ░░░░░           │
│  09:30  ░░░░░    ██████   ░░░░░    ██████          │
│  10:00  ░░░░░    ░░░░░    ██████   ██████          │
│  ...                                                │
│  21:00  ░░░░░    ░░░░░    ░░░░░    ░░░░░           │
└─────────────────────────────────────────────────────┘
```

- **Y axis**: hours 06:00–21:00, 30-min slots (matching CompactScheduleGrid range)
- **X axis**: 7 days with weekday name + date
- **Events**: absolute-positioned blocks within day columns
  - Height proportional to duration
  - Color assigned per professional (palette of 8 colors)
  - Shows: time + patient name + service (truncated)
  - Click → opens edit modal
- **Now indicator**: red horizontal line on current time (today column only)
- **Empty slot click**: opens new appointment modal with day/time pre-filled

### Day View

Same grid for a single day. More horizontal space per event — shows full patient name, phone, service, and status badge.

### Month View

Classic 7×5 grid. Each cell shows:
- Day number
- Appointment count badge
- Click day → switches to day view for that date

### Appointment Modal (Create/Edit)

Fields:
- **Patient**: search by name or phone (autocomplete, GET `/api/calendar/patients/search?q=...`)
- **Professional**: dropdown (pre-selected if clicked a slot or color-filtered)
- **Service**: dropdown, filtered by selected professional's assigned services (from `professional_services`)
- **Date**: date picker (pre-filled from slot click)
- **Start time**: time select (pre-filled from slot click)
- **End time**: auto-calculated from service duration
- **Insurance plan**: optional dropdown of clinic's plans
- **Status**: visual badge (only in edit mode: scheduled → confirmed → completed / cancelled / no_show)

Actions:
- **Save** (create or update)
- **Cancel appointment** (sets status to `cancelled`, prompts for reason)
- **Delete** (hard delete, owner only)

On save:
1. Create/update `appointments` row
2. Sync to Google Calendar (if professional has connected)
3. Enqueue confirmations for new appointments (48h/24h/2h via `enqueueConfirmations()`)

### API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/calendar/appointments` | GET | List appointments by date range + optional professional filter |
| `/api/calendar/appointments` | POST | Create appointment (+ Google Calendar sync + enqueue confirmations) |
| `/api/calendar/appointments/[id]` | PUT | Update appointment (+ Google Calendar sync) |
| `/api/calendar/appointments/[id]` | DELETE | Delete appointment (+ Google Calendar delete) |
| `/api/calendar/patients/search` | GET | Search patients by name or phone (for autocomplete) |

**GET `/api/calendar/appointments` query params:**
- `start` (ISO 8601, required) — start of date range
- `end` (ISO 8601, required) — end of date range
- `professional_id` (UUID, optional) — filter by professional

**Response shape:**
```ts
interface CalendarAppointment {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  cancellation_reason: string | null;
  patient: { id: string; name: string; phone: string };
  professional: { id: string; name: string; color: string };
  service: { id: string; name: string; duration_minutes: number } | null;
  insurance_plan: { id: string; name: string } | null;
  google_event_id: string | null;
}
```

### Professional Colors

Assign deterministic colors to professionals based on their index in the clinic's professional list:

```ts
const PROFESSIONAL_COLORS = [
  "#6366f1", // indigo
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#f43f5e", // rose
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
];
```

Color is assigned by array index (mod 8), not stored in DB.

### Translations

New keys in `messages/{locale}.json`:

```json
{
  "nav": {
    "calendar": "Agenda"
  },
  "calendar": {
    "title": "Agenda",
    "today": "Hoje",
    "views": {
      "day": "Dia",
      "week": "Semana",
      "month": "Mês"
    },
    "allProfessionals": "Todos os profissionais",
    "newAppointment": "Novo agendamento",
    "editAppointment": "Editar agendamento",
    "patient": "Paciente",
    "professional": "Profissional",
    "service": "Serviço",
    "date": "Data",
    "startTime": "Horário",
    "endTime": "Término",
    "insurancePlan": "Convênio",
    "status": "Status",
    "cancellationReason": "Motivo do cancelamento",
    "searchPatient": "Buscar paciente...",
    "noAppointments": "Nenhum agendamento",
    "appointmentCount": "{count} consultas",
    "saveSuccess": "Agendamento salvo",
    "saveError": "Falha ao salvar agendamento",
    "deleteConfirm": "Excluir este agendamento?",
    "cancelConfirm": "Cancelar este agendamento?",
    "statuses": {
      "scheduled": "Agendado",
      "confirmed": "Confirmado",
      "completed": "Realizado",
      "cancelled": "Cancelado",
      "no_show": "Falta"
    }
  }
}
```

### Components

| Component | Type | Description |
|-----------|------|-------------|
| `src/app/(dashboard)/calendar/page.tsx` | Server | Page shell, fetches professionals list |
| `src/components/calendar/calendar-view.tsx` | Client | Main calendar container with view switching, date nav, professional filter |
| `src/components/calendar/week-view.tsx` | Client | Weekly grid with events |
| `src/components/calendar/day-view.tsx` | Client | Daily grid with events |
| `src/components/calendar/month-view.tsx` | Client | Monthly grid with day cells |
| `src/components/calendar/appointment-card.tsx` | Client | Event block rendered inside grid |
| `src/components/calendar/appointment-modal.tsx` | Client | Create/edit modal with form |
| `src/components/calendar/patient-search.tsx` | Client | Autocomplete search for patients |

### Data Flow

```
Page load
  → Server: fetch professionals (for color assignment + filter dropdown)
  → Client: CalendarView mounts
    → GET /api/calendar/appointments?start=...&end=...
    → Render events on grid

Click empty slot
  → Open AppointmentModal(mode="create", prefill={date, time})
  → User fills patient + professional + service
  → POST /api/calendar/appointments
  → On success: refetch appointments, close modal

Click event
  → Open AppointmentModal(mode="edit", appointment={...})
  → User can modify fields or cancel/delete
  → PUT/DELETE /api/calendar/appointments/[id]
  → On success: refetch appointments, close modal

Navigate week/day
  → Update date range state
  → GET /api/calendar/appointments with new range
```

### Insurance Plan on Appointment

The `appointments` table currently has no `insurance_plan_id` column. The migration will add:

```sql
ALTER TABLE appointments ADD COLUMN insurance_plan_id uuid REFERENCES insurance_plans(id) ON DELETE SET NULL;
```

This is optional on create — not all appointments use insurance.

### Validation Schemas

```ts
const createAppointmentSchema = z.object({
  patient_id: z.string().uuid(),
  professional_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  insurance_plan_id: z.string().uuid().optional(),
});

const updateAppointmentSchema = createAppointmentSchema.partial().extend({
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]).optional(),
  cancellation_reason: z.string().max(500).optional(),
});
```
