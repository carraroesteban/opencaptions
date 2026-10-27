# Knowing it's used, without spying

Today there is no way to know an event happened with OpenCaptions, by design: [no analytics, no accounts, nothing about the audience](../privacy.md). Three ways to learn more, from least to most intrusive. Pick before 1.0; none is built.

| | What it tells you | What it never tells you | Cost to privacy | Effort |
|---|---|---|---|---|
| **1. What already exists** | GitHub release downloads per file and version; the website's visits per `?ref=` (home, phone, transcripts, talk), through whatever the website host already logs; GitHub stars, issues, Discussions | Which events, how many people, whether the download was used | None new | None: read the numbers weekly ([GitHub API](https://docs.github.com/en/rest/releases/releases): `download_count` per asset) |
| **2. "Tell us you used it"** | Events whose organizers choose to say so: name, size, languages, what went wrong | Anything about events that don't answer | None: the organizer decides and writes it | Small: a line at the end of the event report ("Did OpenCaptions work for your event? Tell us in one minute") linking to a GitHub Discussions thread or a short form |
| **3. An opt-in anonymous count** | How many servers ran an event this week, rooms and room-hours, in buckets | Event names, addresses, audio, text, anything about the audience | Small but real: a request to a server you run, with a random install id. Off by default, asked once in the wizard, listed in `docs/privacy.md` | Medium: an endpoint to receive it, a switch, docs, and keeping the promise forever |

**Recommendation:** 1 now, 2 with the 1.0 release (it also brings stories you can quote, with permission), 3 only if 1 and 2 leave you blind after three months, and then only opt-in.

What the version check already does, for reference: once a day, `GET api.github.com/repos/carraroesteban/opencaptions/releases/latest`, carrying nothing about the install (`src/updates.js`). GitHub sees the IP; you see nothing. Counting those would need a server of yours in the middle, which is option 3 in disguise: don't.
