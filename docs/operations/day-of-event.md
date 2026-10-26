# Day-of-event checklist

One page for the crew, to print or keep open on a phone. It assumes the event was set up the day before (rooms, languages, agenda, the Gemini key, the public address, QR posters): if not, start with the [runbook](runbook.md#one-day-before). Something wrong? [Troubleshooting](troubleshooting.md). In Spanish: [event-day.es.md](event-day.es.md).

## Before doors open

- [ ] OpenCaptions is running: the Mac or Windows window is open (don't close it), or the server is up. The badge at the top of the dashboard says **Gemini** (or this computer, if that's the plan), not simulated captions.
- [ ] No update is pending in the middle of the day: if the dashboard offers a new version, install it now or after the event, never between talks (captions pause for about a minute).
- [ ] The computer running OpenCaptions and every room computer are plugged in and set to never sleep.
- [ ] You're signed in to the dashboard. Volunteers use the **crew password**, not the admin one.
- [ ] **Alerts on your phone** work: **Settings → Alerts → Send a test**.

## Each room, 60 minutes before

- [ ] The room's sound is connected: its card shows the level moving, not **No sound yet**.
- [ ] Someone speaks into the stage microphone: the sound page says **Good level**, and captions appear on the room's card within about 5 seconds.
- [ ] A translation shows on a phone in each caption language.
- [ ] The stage screen shows captions and its QR code scans from the back of the room.
- [ ] A phone that scans the **printed** QR poster gets captions (it must point to the public address, not `localhost`).
- [ ] OBS or vMix shows the overlay on the program output, if there's a livestream.
- [ ] Silence: after 30 s the card says **Listening · nobody speaking**, and captions come back when someone talks.
- [ ] Names that matter (speakers, sponsors) are in the **Glossary** (Advanced mode).

## When doors open

- [ ] Turn on **Event mode** (bottom of the sidebar): rooms, agenda and glossary can't be changed by accident; live controls still work.
- [ ] Announce it once per talk, or put it on the slides: *"Live captions and translation on your phone: scan the QR. Arrived late? Tap What did I miss?"*

## During talks

There's nothing to press. Watch the dashboard (**Tools → Floating window** keeps it on top of OBS or vMix) and act only on alerts:

| You see | Do |
|---|---|
| **No sound yet** / **Muted?** | Check the cable, the desk fader and the room computer. |
| A card turns orange: a talk is running over | Press **Start "…"** when the next speaker begins, or let it switch at the next pause. |
| A name is misspelled | **See details → Fix captions**, and accept "always write it this way". |
| Wrong language | The room → **Settings → Talk language → Detect automatically**. |
| Walk-in music or a video | Nothing: it's not captioned. A talk taken for music: **It's a talk: caption anyway**. |
| A coffee break | **Break** on the card, or let the agenda do it. |
| The venue's internet drops | With the offline backup, captions move to this computer by themselves. Without it, they come back when the internet does. |

Every alert is explained in the [runbook](runbook.md#dashboard-alerts).

## End of the day

- [ ] **Settings → Alerts → Pause until tomorrow**, so nobody's phone buzzes while rooms are packed up.
- [ ] Back up the data folder ([where it is](../deployment.md#backups-and-upgrades)).
- [ ] After the last day: **Transcripts → Event report**, sign out other devices and change the crew password in **Settings → Security**.
