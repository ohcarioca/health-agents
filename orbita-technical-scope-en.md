# Órbita — Scope Overview

## What it is

Autonomous agent platform via WhatsApp for healthcare SMBs in Brazil. Handles the full patient revenue and retention cycle without human intervention. The client sets it up in ~15 minutes and the system runs on its own.

## Target audience

Medical, dental, aesthetic, physiotherapy, psychology, and veterinary clinics. 1 to 20 healthcare professionals. Monthly revenue between R$30k and R$500k.

## The cycle (6 modules)

| # | Module | What it does | Entry trigger |
|---|--------|-------------|---------------|
| 01 | **Basic Support** | Answers FAQ, insurance plans, hours, address. Routes to the right module. | Patient sends a message |
| 02 | **Scheduling** | Books, reschedules, and cancels appointments based on real-time availability. | Patient wants to book or handoff from Support |
| 03 | **Confirmation** | Confirms attendance 48h/24h/2h before. Reschedules cancellations. Detects no-shows. | Appointment booked |
| 04 | **NPS** | Collects post-appointment satisfaction. Promoters go to Google Reviews. Detractors trigger alerts. | Appointment completed |
| 05 | **Billing** | Payment reminder drip sequence. Tone adapted by NPS score. Sends Pix/boleto payment links. | Open invoice or NPS collected |
| 06 | **Recall** | Reactivates inactive patients (>90 days). Directs to new scheduling. | Daily batch scan of inactive patients |

All modules escalate to a human when they can't resolve (mandatory fallback).

## Channel

WhatsApp Business API. For the patient it's a single continuous conversation — under the hood, specialized agents hand off to each other.

## Client interface (web)

| Screen | Who uses it | Purpose |
|--------|------------|---------|
| Dashboard | Owner / Reception | Visual funnel of the cycle, daily metrics, alerts |
| Inbox | Reception | Escalated conversations, take over / hand back to agent |
| Modules | Owner | Toggle on/off, configs, message preview |
| Reports | Owner | ROI, comparisons, PDF export |
| Team | Owner | Users and permissions (Owner vs. Reception) |
| Settings | Owner | Clinic data, integrations, WhatsApp |

No mention of "agents" in the interface — the client sees modules and results.

## Integrations

WhatsApp Business, Google Calendar, Gmail, Pagar.me.


**Supported data sources:** API integration, CSV/XLSX upload, manual entry.

## Minimum data to operate

- **Clinic:** name, address, hours, insurance plans, services
- **Professionals:** name, specialty, schedule grid, appointment duration
- **Patients:** name, WhatsApp phone number connection (most critical field), appointment history

## Global rules

- **Tone:** friendly, professional, moderate emoji use, patient's first name
- **Hours:** active outbound messages only 8am–8pm Mon-Sat. Responses 24/7.
- **Rate limit:** max 3 active messages per patient per day, prioritizing Confirmation > Billing > NPS > Recall
- **Fallback:** every agent escalates to human after N attempts (default: 2)


## Product principles

1. **Works without any configuration** — smart defaults on all modules
2. **One conversation, multiple agents** — patient doesn't notice the switch
3. **Escalates to human, never fails silently**
4. **5 minutes a day** — owner checks dashboard and acts only on exceptions
5. **Visible results in 24h** — first confirmation goes out the day after activation

---

