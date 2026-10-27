# The public sandbox

What runs at https://try-opencaptions.kvza.ar. Pressing **Start my copy** gives the visitor a private OpenCaptions of their own for one hour. It has simulated captions (`ENGINE=mock`: sample sentences when there's sound, no AI, no cost), no sign-in, and a **Main Stage** room looping the sample talk (`event.json`). Visitors can open the admin page, change anything, switch to Just for me and use their microphone. A cookie tells `sandbox.js` which copy belongs to which browser, and the copy is deleted after `COPY_MINUTES`.

- **Limits:** up to `MAX_COPIES` copies at once (8 by default: 8 × 300 MB fits a 4 GB server with room to spare), each at most 300 MB of memory, half a CPU and 64 MB of data, held in memory only. One visitor can start at most 4 copies an hour. An idle copy uses about 40 MB.
- **Isolation:** copies run on an internal Docker network (`oc-sandbox`) with no internet access. They can't reach other copies' data, the server, or anything outside, so pasting a Gemini key or a stream address in a copy goes nowhere.
- **Risk:** the `sandbox` container uses the Docker socket to start and delete copies, which gives it root on the server. Keep `sandbox.js` small and reviewed.

## Run it

On the server, in this folder, put the Cloudflare tunnel's token in `.env` (`TUNNEL_TOKEN=…`). The tunnel's public hostname must point at `http://localhost:8080` in the Cloudflare dashboard. Then run:

```
docker compose up -d
```

## Update it

```
docker compose pull && docker compose up -d
```

New copies use the new image. Copies already running keep the old one until their hour ends.

## Check it

`docker compose logs sandbox` shows each copy started. `docker ps --filter label=oc.sandbox` lists the running copies, oldest last.
