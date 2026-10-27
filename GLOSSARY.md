# OpenCaptions

Live captions and translation for talks at events, from one room to many at the same time, read on phones, projectors and the livestream.

## The event

**Event**:
One conference, meeting or festival run from one OpenCaptions server: its rooms, agenda, glossary and audience.
_Avoid_: Conference, instance

**Room**:
A physical room or track where talks happen, each with its own audio and its own captions. `stage` is only its identifier in URLs and the API.
_Avoid_: Stage (in prose), track, channel

**Talk**:
One continuous stretch of speech in a room, with its own title and transcript. A new talk starts when the crew starts the next one, the agenda says so, or speech returns after the room went idle.
_Avoid_: Session, presentation

**Agenda**:
The event's list of talks per room with times and speakers, used to name talks and flag one running over.
_Avoid_: Schedule (in prose), program

**Speaker**:
The person giving a talk, whose name can appear with the captions.
_Avoid_: Presenter

**Break**:
A pause between talks, announced by the crew, the agenda or the vision mixer switching to a break scene, during which captions pause.
_Avoid_: Intermission

**Event mode**:
A switch that locks the event's setup (rooms, agenda, glossary, name) while doors are open; live controls keep working.
_Avoid_: Lock, read-only mode

**Just for me**:
The single-person use of OpenCaptions: captions of one's own calls and videos on one's own computer, never public.
_Avoid_: Personal mode, solo mode

## People

**Audience**:
Anyone reading the captions without signing in: in the room on a phone, on the projector, or on the stream.
_Avoid_: Viewers, attendees, users

**Organizer**:
A person with the admin role, who sets up and changes the event.
_Avoid_: Admin (in prose), owner

**Crew**:
A person with the crew role, who runs the live controls on the day but can't change the setup.
_Avoid_: Volunteer (as a role), operator, staff

## Audio in

**Ingest**:
A room's audio arriving at the server, pushed from the venue.
_Avoid_: Upload, input

**Room computer**:
The PC in a room that sends its audio, through the agent or the browser ingest page.
_Avoid_: Venue PC, encoder

**Agent**:
The headless program on a room computer that captures the sound card and sends it to the server.
_Avoid_: Client, daemon

**Pull**:
The server fetching a room's audio from a stream the venue already produces (SRT, RTMP, HLS, YouTube).
_Avoid_: Stream ingest

**Main source / backup source**:
A room's two possible audio inputs; the backup takes over by itself when the main one drops.
_Avoid_: Primary/secondary, failover source

**Silence gate**:
Stopping a room's audio from reaching the AI while nobody speaks, so nothing is billed.
_Avoid_: VAD, mute

**Live / Paused / Idle**:
A room's state: hearing speech; silent for a short while with no audio sent; silent long enough that the talk ended.
_Avoid_: Active, sleeping, stopped

## Captions out

**Caption**:
A line of a talk's text in one caption language, shown as it's spoken.
_Avoid_: Subtitle (for the live text), transcript line

**Original**:
The captions in the language the speaker is using.
_Avoid_: Source text, transcription

**Caption language**:
A language the event offers its captions in; the audience picks one.
_Avoid_: Target language, locale

**Passthrough**:
Showing the original as-is for a caption language the speaker is already speaking.
_Avoid_: Identity translation

**Partial / final caption**:
Text still being refined while the speaker talks / text that won't change.
_Avoid_: Interim, draft, committed

**Provisional translation**:
A translation of the sentence still in progress, replaced when the sentence ends.
_Avoid_: Partial translation, preview

**Glossary**:
The event's list of names and technical terms, used to recognize and spell them right in every caption.
_Avoid_: Dictionary, vocabulary, hints

**Transcript**:
The stored text of one talk in every caption language, readable and downloadable afterwards.
_Avoid_: Log, recording

**Translated voice**:
A room's captions read aloud in a chosen language, heard on the phone through headphones.
_Avoid_: Dubbing, TTS

**The room's sound**:
The room's own audio, relayed live to phones for hearing aids and earbuds.
_Avoid_: Audio stream, hearing loop

## Screens

**Phone page**:
The audience's captions for one room, opened from the room's QR code.
_Avoid_: Watch page, viewer

**Projector screen**:
Large, high-contrast captions for the room's screen, with the QR code.
_Avoid_: Stage screen, display

**Overlay**:
Transparent captions laid over the livestream in vMix or OBS.
_Avoid_: Lower third, CG

**Dashboard**:
The organizers' and crew's page for every room's status, controls and settings.
_Avoid_: Admin panel, control room

**QR kit**:
The printable posters with each room's QR code.
_Avoid_: Signage

## The AI

**Engine**:
What turns a room's audio into text: Gemini in the cloud, or a model on the organizer's own computer.
_Avoid_: Backend, provider, ASR

**Local mode**:
Running the engine and the translations on the organizer's own computer, with no account and no cost per hour.
_Avoid_: Offline mode

**Offline backup**:
Moving rooms to the local engine by itself when the connection to the cloud is lost, and back when it returns.
_Avoid_: Failover (in prose), fallback mode

**Assistant**:
The audience's two questions to the talk: *What did I miss?* (a summary) and *Ask the talk* (an answer quoted from the transcript).
_Avoid_: Chatbot, AI chat

## Running it

**Alert**:
A message on the organizers' phones when a room needs attention, sent once and cleared when it's over.
_Avoid_: Notification, alarm

**History**:
Every change to the setup, with what it replaced, who made it, and undo.
_Avoid_: Audit log, changelog

**Public address**:
The internet address the audience's phones open, made from the organizer's computer.
_Avoid_: Tunnel, public URL

**Event report**:
The record after the event of each talk's audience and cost.
_Avoid_: Analytics, stats
