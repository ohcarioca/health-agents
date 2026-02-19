# Inbox: Fixed-Height Chat Layout + Textarea Input

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the inbox page fill the viewport height, messages scroll inside the chat panel, and replace the single-line input with a fixed-height textarea that scrolls when text overflows multiple lines.

**Architecture:** Three focused changes — (1) the page grid gets an explicit viewport-height calculation so panels don't grow unconstrained; (2) `ConversationList` gets `h-full flex-col` so filter chips stay sticky and the conversation rows scroll; (3) `ConversationDetail` input becomes a `<textarea>` with a fixed row count and `overflow-y-auto`, with Enter-to-send / Shift+Enter-newline.

**Tech Stack:** React 19, Tailwind CSS v4, next-intl (pt-BR)

---

## Context for the implementer

### Current broken behaviour

`DashboardShell` renders `main` with `pt-16` (64 px top bar) and `min-h-screen`.
`PageContainer` adds `py-6 px-6` padding.
`PageHeader` adds roughly 36 px of title.
The grid (`mt-6`) is unrestricted in height, so `ConversationDetail`'s `h-full` expands to the full content height — messages never scroll and the panel just grows.

### Fixed layout target

```
viewport height (100vh)
  └─ topbar                   → 4rem (pt-16)
  └─ PageContainer py-6       → 1.5rem top + 1.5rem bottom
  └─ PageHeader (title)       → ~2.25rem
  └─ mt-6 gap                 → 1.5rem
  └─ GRID (fills rest)        → calc(100vh - 11rem)
       ├─ LEFT col  (1/3)     → h-full, flex-col, list scrolls
       └─ RIGHT col (2/3)     → h-full, messages scroll, input fixed
```

### Textarea behaviour

- `<textarea>` replaces `<input type="text">`.
- Fixed at `rows={3}` with `resize-none` and `overflow-y-auto` → shows scroll bar if the user types more than 3 lines.
- `Enter` key submits the form (calls `handleSend`).
- `Shift+Enter` inserts a newline.
- `onKeyDown` handler checks `e.key === "Enter" && !e.shiftKey` → `e.preventDefault()` + submit.

---

### Task 1: Fix inbox page grid height

**Files:**
- Modify: `src/app/(dashboard)/inbox/page.tsx`

**What to change:**

The outer grid `<div>` currently uses no height class. Add `h-[calc(100vh-11rem)]` so the panels fill the remaining viewport. Also make the left-panel `<div>` fill height with `flex flex-col h-full`.

**Step 1: Locate the grid div (line ~115)**

```tsx
// BEFORE (line ~115)
<div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">

// AFTER
<div className="mt-6 grid h-[calc(100vh-11rem)] grid-cols-1 gap-6 lg:grid-cols-3">
```

**Step 2: Make the left-panel div fill height (line ~117)**

```tsx
// BEFORE
<div>
  {listLoading ? (

// AFTER
<div className="flex h-full flex-col overflow-hidden">
  {listLoading ? (
```

**Step 3: Make the right-panel div fill height (line ~130)**

```tsx
// BEFORE
<div className="lg:col-span-2">

// AFTER
<div className="flex h-full flex-col lg:col-span-2">
```

**Step 4: Make the right-panel empty/spinner cards fill height**

The `Card` wrappers used for the spinner and the empty state need `h-full` so they don't collapse:

```tsx
// BEFORE (two places)
<Card>
  <div className="flex min-h-[400px] items-center justify-center">

// AFTER (both)
<Card className="h-full">
  <div className="flex h-full items-center justify-center">
```

**Step 5: Commit**

```bash
git add src/app/(dashboard)/inbox/page.tsx
git commit -m "feat: set fixed viewport height on inbox grid"
```

---

### Task 2: Make ConversationList scroll within its panel

**Files:**
- Modify: `src/components/inbox/conversation-list.tsx`

**What to change:**

The root `<div>` must become `flex flex-col h-full` so the filter chips stay at the top and the conversations list area gets `flex-1 overflow-y-auto`.

**Step 1: Update root and filter-bar divs**

```tsx
// BEFORE (line ~55-65)
return (
  <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">

// AFTER
return (
  <div className="flex h-full flex-col gap-3">
    <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
```

**Step 2: Make conversation rows area scrollable**

```tsx
// BEFORE (line ~67)
<div className="space-y-2">
  {filtered.length === 0 ? (

// AFTER
<div className="flex-1 space-y-2 overflow-y-auto">
  {filtered.length === 0 ? (
```

**Step 3: Commit**

```bash
git add src/components/inbox/conversation-list.tsx
git commit -m "feat: make conversation list scroll within fixed-height panel"
```

---

### Task 3: Replace input with fixed-height textarea in ConversationDetail

**Files:**
- Modify: `src/components/inbox/conversation-detail.tsx`

**What to change:**

1. Add an `onKeyDown` handler that submits on `Enter` (without `Shift`).
2. Replace `<input type="text">` with `<textarea>` using `rows={3}`, `resize-none`, `overflow-y-auto`.
3. Change `items-center` on the form to `items-end` so the send button aligns to the bottom of the textarea.

**Step 1: Add keyboard handler (after the `handleSend` function, ~line 113)**

Inside the `ConversationDetail` function body, add:

```tsx
function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!messageText.trim() || sendLoading) return;
    handleSend(e as unknown as FormEvent);
  }
}
```

**Step 2: Replace the `<input>` with `<textarea>` (line ~207-219)**

```tsx
// BEFORE
<form
  onSubmit={handleSend}
  className="flex items-center gap-2 border-t px-5 py-3"
  style={{ borderColor: "var(--border)" }}
>
  <input
    type="text"
    value={messageText}
    onChange={(e) => setMessageText(e.target.value)}
    placeholder={t("messagePlaceholder")}
    disabled={sendLoading}
    className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
    style={{
      borderColor: "var(--border)",
      color: "var(--text-primary)",
    }}
  />

// AFTER
<form
  onSubmit={handleSend}
  className="flex items-end gap-2 border-t px-5 py-3"
  style={{ borderColor: "var(--border)" }}
>
  <textarea
    rows={3}
    value={messageText}
    onChange={(e) => setMessageText(e.target.value)}
    onKeyDown={handleKeyDown}
    placeholder={t("messagePlaceholder")}
    disabled={sendLoading}
    className="flex-1 resize-none overflow-y-auto rounded-lg border bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
    style={{
      borderColor: "var(--border)",
      color: "var(--text-primary)",
    }}
  />
```

**Step 3: Verify the Button import still works** — no change needed, `Button` is already imported.

**Step 4: Commit**

```bash
git add src/components/inbox/conversation-detail.tsx
git commit -m "feat: replace single-line input with fixed-height textarea in chat panel"
```

---

### Task 4: Smoke test the layout

**Manual checks:**

1. Open `/inbox`.
2. Verify the page does NOT scroll beyond the topbar — the grid stops at the bottom of the viewport.
3. Add enough conversations that the list overflows → list should scroll independently.
4. Select a conversation with many messages → messages panel scrolls, header and input stay fixed.
5. Type 4+ lines in the textarea → textarea shows internal scrollbar, does not grow.
6. Press `Enter` → message sends (or shows send-loading spinner).
7. Press `Shift+Enter` → newline inserted, no send.
8. On mobile/small screen (`lg:` breakpoint not active) — layout stacks; grid `h-[calc(100vh-11rem)]` still applies but column stacking is fine on mobile since the page will scroll normally.

> **Note on the calc value:** `11rem` = 4rem (topbar) + 1.5rem (container-top) + 2.25rem (header height) + 1.5rem (mt-6) + 1.75rem (container-bottom + buffer). If the actual layout shifts (e.g., banner is visible), adjust to `12rem` or `13rem`.

---
