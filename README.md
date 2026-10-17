# Juan Paolo & Arlene — Wedding Invitation

A garden-in-bloom wedding invitation website, themed on the wedding's eight-colour palette. Pure HTML, CSS, and vanilla JavaScript — no build step, no framework, no dependencies to install.

## File structure

```
/index.html
/css/style.css
/js/main.js          -> falling petals (canvas), gate + staged hero entrance, navbar, countdown, scroll reveal, gallery carousel/lightbox, accordion, background music
/js/rsvp.js           -> strict RSVP portal logic (name lookup, seats, accept/decline, Google Sheet logging)
/assets/images/       -> drop real photos here (see assets/images/README.md)
/assets/data/guests.json  -> the real guest database (59 invitations / 97 seats, from "Guest List - Master.xlsx")
/Guest List - Master.xlsx -> master spreadsheet version of the guest list, incl. RSVP status tracking
/google-apps-script.gs    -> paste into Google Apps Script to log RSVPs to a Sheet (→ Excel)
```

## Running locally

This is static HTML/CSS/JS, so you can open `index.html` directly — but the RSVP portal fetches `assets/data/guests.json`, which browsers block over `file://` due to CORS (a hardcoded fallback list keeps it working either way). For the full experience, serve it locally:

```bash
npx serve .
```

or, with Python:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`.

## Customizing content

- **Names, date, venues, FAQs, story timeline:** edit the text directly in `index.html`.
- **Wedding date/time (countdown):** `WEDDING_DATE_ISO` at the top of `js/main.js`.
- **RSVP deadline:** `RSVP_DEADLINE_ISO` at the top of `js/rsvp.js`.
- **Colors:** the eight palette colours (`--blush`, `--rose`, `--marigold`, `--buttercream`, `--lime`, `--turquoise`, `--periwinkle`, `--lavender`) and their deeper text/line variants (`--rose-deep`, `--marigold-deep`, …) are CSS custom properties at the top of `css/style.css`. The same hex codes appear in the palette card in `index.html`, in `PETAL_COLORS` in `js/main.js`, and in the botanical corner artwork (an SVG sprite inside `index.html`).
- **Entrance animation:** every piece of the cover and hero has its own start time in its inline `--d` style (seconds) in `index.html` — change those numbers to speed up or slow down the one-by-one build.
- **Photos:** see the `README.md` file inside `assets/images/`.
- **Background music:** `YOUTUBE_MUSIC_ID` at the top of `js/main.js` — the video ID from any YouTube URL (e.g. `https://www.youtube.com/shorts/bwoBmIm0YI8` → ID is `bwoBmIm0YI8`). Music streams via an invisible, official YouTube embed (loops automatically) rather than a downloaded file, so no audio is hosted on the site and the source video's own rights/monetization stay intact. It starts when a guest clicks "Open Invitation" or the music-note icon in the navbar — browsers require that kind of real click before audio can play, so it can't truly autoplay on page load.

## Guest list

`assets/data/guests.json` is the real guest database — 59 invitations (97 seats) generated from the **Guest List** tab of `Guest List - Master.xlsx` (33 from the Groom's side, 26 from the Bride's side). `Guest List - Master.xlsx` is the source of truth: after editing it, `guests.json` and the `FALLBACK_GUESTS` list in `js/rsvp.js` must be regenerated so all three stay in sync (ask Claude to "sync the guest list").

```json
[
  { "code": "JPA005", "name": "Kat", "allowedSeats": 3, "members": ["Kat", "Alo", "Lexi"], "rsvpSubmitted": false }
]
```

Guests RSVP by typing their **full name** (not a code) — the portal matches it case-insensitively against `name` below. Once found, the portal lists every name in `members` **individually**, each with its own Accept/Decline choice — strictly the named guests on that invitation, nothing more. There's no "how many are attending" number to pick; the confirmed party size is simply however many of the named members clicked Accept.

- `name` — must match exactly what the guest will type (as printed on their invitation). Matching is case-insensitive and trims extra spaces, but "Juan Dela Cruz" and "Juan D. Cruz" are treated as different names — use the guest's full formal name.
- `members` — every person this invitation covers (the main guest plus any named plus-ones), rendered as individual Accept/Decline rows in the RSVP portal. Omit this field (or make it a single-item array matching `name`) for a solo guest with no plus-one.
- `code` — an internal ID only; guests never see it. It's used to key `localStorage` (duplicate prevention) and to generate confirmation numbers.
- `allowedSeats` — the max number of people that invitation covers; should equal `members.length`.
- `rsvpSubmitted` — set to `true` to manually lock an invitation from further RSVPs (e.g. if collected offline).

To add guests, add more objects to this array before deploying. If two guests could plausibly share an identical full name, give one of them a slightly more specific name (e.g. include a middle initial) so lookups stay unambiguous.

### ⚠️ Keep the Excel in sync with four corrected names

Four invitations had the Main Guest Name spelled differently from Party Members. The site now uses the confirmed spellings below, but if `Guest List - Master.xlsx` still shows the old ones, update it too — otherwise the next "sync the guest list" would bring the old spellings back:

| Code | Main Guest Name | Party Members |
|---|---|---|
| JPA001 | Ma. Theresa Angeles | Ma. Theresa Angeles |
| JPA005 | Katrina Paola Ramirez | Katrina Paola Ramirez, Michael Angelo Ramirez, Alexis Katherine Ramirez |
| JPA058 | Joyce Abano | Joyce Abano, Marites Lasquite |
| JPA059 | Mara Villafranca | Mara Villafranca, Norma Villafranca |

The full reasoning for every party's seat count — including exactly which named plus-ones are grouped under which main guest on the Groom's side (e.g. "Kat" = Kat + Alo + Lexi, 3 seats) — is in the **Legend** tab of `Guest List - Master.xlsx`.

### Important limitation (static site, no backend)

Because there's no server/database, "preventing duplicate RSVPs" works per-browser via `localStorage` — a guest can't resubmit from the same device/browser, but this JSON file itself is never rewritten by the client. For a real, centralized record of who's coming (which you'll want for actual seating/catering), connect the Google Sheet logger described below.

## Getting RSVPs into an Excel file (seating arrangement + attending/declined lists)

Because this is a static site with no server of its own, guest RSVPs are logged to a **Google Sheet** in real time — which you can open, sort, and download as an actual `.xlsx` Excel file whenever you like (File → Download → Microsoft Excel). This needs a one-time, free setup:

1. Create a new Google Sheet at [sheets.new](https://sheets.new) and name it e.g. "Wedding RSVPs".
2. Import **`Guest List - Master.xlsx`** (in this project) into that Sheet: **File → Import → Upload**, select the file, and choose **"Insert new sheet(s)"**. Make sure the imported guest-list tab is named exactly **`Guest List`** (rename it if Sheets adds a suffix like "Guest List (1)").
3. In the Sheet, go to **Extensions → Apps Script**.
4. Delete the placeholder code and paste in the contents of [`google-apps-script.gs`](google-apps-script.gs) from this project.
5. Click **Deploy → New deployment → Web app**. Set "Execute as" to **Me** and "Who has access" to **Anyone**. Click Deploy and authorize when prompted.
5a. **Before deploying**, edit `COUPLE_EMAILS` at the top of the script and put in the groom's and bride's real email addresses (the `REPLACE-…@example.com` placeholders are skipped, so no notification is sent until you change them).
6. Copy the Web App URL it gives you, then paste it into `SHEETS_ENDPOINT` near the top of [`js/rsvp.js`](js/rsvp.js).

> If you edit the script later, use **Deploy → Manage deployments → Edit → New version**, otherwise the live URL keeps running the old code.

### Confirmation letters & couple notifications

Each time a guest confirms, the script (in addition to the logging below):

- **Emails you both** (`COUPLE_EMAILS`) a notice — who responded, who accepted or regretfully declined by name, their message, and a running tally (responded / seats confirmed / declined / pending).
- **Emails the guest a confirmation letter** (seats reserved, per-name status, event details, confirmation number, "strictly no plus one" reminder) — only if they typed an email address in the optional **Email** field on the RSVP form. The guest's name in the letter comes from your Guest List, never from what was typed.
- **Updates the Guest List tab**: `RSVP Status`, `Party Size Confirmed`, `Confirmation Number`, `Submitted At`, plus two columns the script adds — `Guest Email` (J) and `Letter Emailed At` (K).

Guests can also open an on-screen **confirmation letter** from the confirmation pop-up and print / save it as a PDF, with or without an email address.

Notes: only the **first** response per invitation is processed (later attempts are ignored, so nobody can overwrite or spam). Google limits email sending to roughly 100/day on a free Gmail account and about 1,500/day on Google Workspace. Set `SITE_URL` in the script to your deployed website address so the letter can link to it. Set `SEND_GUEST_CONFIRMATIONS` or `SEND_COUPLE_NOTIFICATIONS` to `false` to turn either email off.

Once configured, every RSVP (accept or decline) does two things: it appends a permanent timestamped row to the "RSVPs" audit-log tab — including an **`Attendee Breakdown`** column spelling out exactly who accepted vs. declined by name (e.g. "Ate Edna: Accepted; gab: Accepted; jj: Declined; kuya jeff: Accepted") — **and** it updates that same invitation's row in your imported "Guest List" tab, filling in `RSVP Status` (Attending/Declined), `Party Size Confirmed` (how many named members accepted), `Confirmation Number`, and `Submitted At`. So "Guest List" always shows, at a glance, who has responded and how many seats to set, while the audit log's breakdown tells you exactly which named individuals are coming. Two more live tabs, "Attending" and "Declined", stay automatically filtered from the audit log. Leave `SHEETS_ENDPOINT` blank to skip this entirely; the site still works, it just won't centralize responses anywhere beyond each guest's own browser.

`Guest List - Master.xlsx` also has a **Summary** tab with live formulas (total invitations, total seats invited, confirmed attending seats, declined, pending) and a **Legend** tab explaining every column and the two data caveats above.

## Deployment

This site deploys as-is to any static host. No build command is needed.

**Netlify**
- Drag-and-drop the folder in the Netlify dashboard, or connect the repo.
- Build command: *(none)* — Publish directory: `.` (already configured in `netlify.toml`).

**Vercel**
- Import the repo/folder. Framework preset: "Other" / static.
- `vercel.json` is already included for security headers.

**GitHub Pages**
- Push this folder to a repo, then enable Pages in repo Settings → Pages → Deploy from branch (`main`, root).

**Cloudflare Pages**
- Connect the repo. Build command: *(none)*. Build output directory: `/`.

## Notes on the QR code

The RSVP confirmation modal renders a QR code client-side using the [qrcodejs](https://cdnjs.com/libraries/qrcodejs) library loaded from cdnjs — no data is sent to any external server; the QR image is generated entirely in the browser from the confirmation number.
