# 0012. Navigate like the apps organizers already use

- Status: Accepted
- Date: 2026-10-11

## Context

Organizers said the dashboard was hard to find their way around and had too much explanatory text on screen. They asked for a back button, a sidebar they can hide, icons, and "the best of" the apps they use every day. Each organizer page (dashboard, setup wizard, event report) had its own header, and the paragraphs that explained each control made the controls hard to find. Constraints: no framework and no build step ([0006](0006-vanilla-js-frontend.md)), WCAG 2.2 AA in light and dark, Spanish and English, and phones as well as laptops. Audience pages (captions on phones, the stage screen) stay minimal.

We looked at how these behave (their public help pages and design guides, not their code or assets): Slack, Discord, Notion, Linear, Zoom, Google's Material 3 (navigation rail and drawer, menus), and event-production tools (vMix and OBS for the on-air "tally" light, Whova and Hopin for event dashboards).

## Options considered

1. Keep each page's own header and trim the text only.
2. A single-page app with a client-side router: one shell for everything. That's a rewrite, and against 0006.
3. One small shared script (`public/nav.js`) that every organizer page loads. It adds the same sidebar, back button, breadcrumb and quick switcher, and turns explanations into "?" popovers. Pages stay separate HTML files.

## Decision

Option 3, with these seven patterns:

| Pattern | Borrowed from | Why | Where |
|---|---|---|---|
| Left navigation with icons and labels that collapses to icons only, and is remembered | Material 3 navigation rail/drawer, Slack, Notion, Gmail's ☰ | Short labels plus an icon are found faster than either alone; collapsing gives the live cards room on a laptop | Dashboard, setup wizard, report. On a phone it's a menu that opens from ☰ |
| A back button plus a breadcrumb of where you are | Notion's page path, Material's top app bar, Zoom's settings | You always know where you are and how to get out. Back goes to the previous page, or one level up when there is no previous page | Top of every organizer page |
| ⌘K / Ctrl+K quick switcher | Slack's "Jump to", Discord's Quick Switcher, Notion, Miro | Jump to any room, page or setting by typing a few letters, without knowing where it lives | Every organizer page (also a "Search" button in the sidebar) |
| Rooms as "channels" in the sidebar with a live status dot | Slack and Discord channels; the vMix/OBS tally light | See at a glance which room is live, paused, silent or needs attention, from any page. Click to focus that room | Sidebar, below the sections |
| Short labels; explanations behind a small "?" or in empty states | Material supporting text, Google's help icons, Zoom's ⓘ | The screen shows what you can do; the "why" is one click away. Warnings and errors that matter on event day stay visible | Every organizer page |
| One primary (filled) button per screen, the rest secondary | Material filled/outlined buttons, Slack | The next step is obvious | Every page (we were mostly there) |
| Recent items first in ⌘K, then best match (name starts with it, then a word does, then anywhere) | Slack, Linear | The room you just opened is one keystroke away during a live event | ⌘K |
| `?` opens a keyboard cheat sheet; G then a letter jumps to a section; ⌘\\ hides the sidebar | Linear, Gmail, Notion | Power users never reach for the mouse, and the shortcuts are discoverable | Every organizer page |
| Right-click (or Shift+F10) on a room for its actions | Slack and Discord channel menus | Sound page, stage screen, phone captions, QR poster and transcripts of that room in one move | Sidebar rooms |
| A count badge on Live when a room needs attention | Slack mention badges, Whova/Hopin's "live now" | Trouble is visible from any section | Sidebar ("En vivo" / "Live") |

## Consequences

- Good: one place (`public/nav.js` plus the `.side` and `.crumbbar` rules in `style.css`) defines how organizers move around. A new organizer page gets it by adding `<div class="crumbbar" id="crumbbar"></div>` and calling `mountNav()`.
- Good: the "?" popovers use the browser's built-in Popover API, so there's no positioning library. Where CSS anchor positioning is supported, the popover appears next to its "?"; elsewhere it's centered on screen.
- Bad: the sidebar is drawn by JavaScript, so it appears a moment after the page. Every organizer page already needs JavaScript.
- Bad: explanations behind "?" are one click further away. We kept the ones that matter on event day visible (sound missing, privacy of room sound, locked setup, errors).
- Follow-ups: other organizer tools (QR kit, caption style, sound page) can adopt the shared header the same way.
