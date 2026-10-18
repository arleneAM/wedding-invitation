/**
 * Juan Paolo & Arlene — RSVP back office (Google Apps Script)
 *
 * Every RSVP submitted on the wedding site (accept or decline) is posted here, and this script:
 *   1. appends a permanent, timestamped row to the "RSVPs" audit-log tab;
 *   2. updates that invitation's own row in the "Guest List" tab (status, confirmed party size,
 *      confirmation number, time, guest email) so the list always shows who has responded;
 *   3. emails the bride and groom: who just responded, who is coming, plus a running tally;
 *   4. emails the guest a confirmation letter — only if they typed an email address.
 *
 * Only the FIRST response for each invitation is accepted. A second attempt (from any device) is
 * ignored: it does not change the list and does not trigger any email.
 *
 * ---------------------------------------------------------------------------------------------
 * ONE-TIME SETUP
 *   1. Create a new Google Sheet (sheets.new). Name it "Wedding RSVPs".
 *   2. Import "Guest List - Master.xlsx" (from this project): File → Import → Upload → Insert new
 *      sheet(s). Make sure the imported tab is named exactly "Guest List".
 *   3. Extensions → Apps Script. Delete the starter code and paste this whole file in.
 *   4. EDIT THE SETTINGS BELOW — above all, put the bride's and groom's real email addresses in
 *      COUPLE_EMAILS.
 *   5. Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone.
 *      Google will ask you to authorise the script (it needs the Sheet and permission to send email).
 *   6. Copy the "Web app URL" and paste it into SHEETS_ENDPOINT near the top of js/rsvp.js.
 *   7. Any time you change this script later: Deploy → Manage deployments → pencil → Version: New
 *      version → Deploy (the URL stays the same).
 *
 * EMAIL LIMITS: a free Gmail account can send about 100 emails a day, a Google Workspace account
 * about 1,500. Each RSVP sends one email to the couple, plus one to the guest if they gave an
 * address. If you expect more than ~50 responses in one day on a free account, set
 * SEND_GUEST_CONFIRMATIONS to false, or use a Workspace account.
 * ---------------------------------------------------------------------------------------------
 */

/* ============================ SETTINGS — EDIT THESE ============================ */

// Who is notified of every RSVP. Replace both placeholders with real addresses.
var COUPLE_EMAILS = ['REPLACE-groom@example.com', 'REPLACE-bride@example.com'];

var SEND_COUPLE_NOTIFICATIONS = true;    // email the couple on every RSVP
var SEND_GUEST_CONFIRMATIONS = true;     // email a confirmation letter to guests who gave an address
var SITE_URL = 'https://arleneam.github.io/wedding-invitation/';                       // e.g. 'https://your-wedding-site.netlify.app' (optional; adds a link to the letter)

var EVENT = {
  couple: 'Juan Paolo & Arlene',
  dateText: 'Friday, January 8, 2027',
  ceremony: { time: '4:00 PM', place: 'The Rodolfo’s Garden' },
  reception: { time: 'Cocktails 6:00 PM · Reception 7:00 PM', place: 'Rodolfo’s Function Hall' },
  address: 'Tuazon Farm, Brgy. Lara, San Fernando, Philippines',
  attire: 'Garden formal — wear any shade from our color palette (please avoid white and ivory).',
  mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=The%20Rodolfo%27s%20Garden%2C%20Tuazon%20Farm%2C%20Brgy%20Lara%2C%20San%20Fernando%2C%20Philippines'
};

/* =============================================================================== */

var RSVP_LOG_SHEET = 'RSVPs';
var GUEST_LIST_SHEET = 'Guest List';
var LOG_HEADERS = [
  'Timestamp', 'Code', 'Name', 'Attending', 'Party Size',
  'Attendee Breakdown', 'Message', 'Confirmation Number', 'Guest Email'
];

// Guest List tab columns (1-indexed). A–I come from Guest List - Master.xlsx; J–K are added by this script.
var GL = { CODE: 1, MAIN: 3, SEATS: 5, STATUS: 6, PARTY: 7, CONF: 8, SUBMITTED: 9, EMAIL: 10, LETTER_SENT: 11 };

var PALETTE = { cream: '#FFF9F0', blush: '#F6C9D2', rose: '#E98CA5', roseDeep: '#B8456B', marigoldDeep: '#A8730B', ink: '#33283A', soft: '#6B5D72', turquoiseDeep: '#1B858A' };

/* ------------------------------------------------------------------ entry points */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var data = parsePayload(e);
    if (!data) return jsonOut({ ok: false, error: 'bad payload' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var submittedAt = data.submittedAt ? new Date(data.submittedAt) : new Date();
    var guestRow = findGuestRow(ss, data.code);
    // Safety net: the code must belong to the name that responded; otherwise don't touch the list or email a letter.
    var mismatch = null;
    if (guestRow && !nameMatches(guestRow.values, data)) { mismatch = guestRow; guestRow = null; }

    // One response per invitation: ignore repeats (from any device) without touching anything
    if (guestRow && isAnswered(guestRow.values)) return jsonOut({ ok: true, duplicate: true });

    appendToLog(ss, data, submittedAt);
    if (guestRow) updateGuestListRow(guestRow, data, submittedAt);
    var tally = computeTally(ss);

    if (SEND_COUPLE_NOTIFICATIONS) safely('couple email', function () { notifyCouple(data, tally, guestRow, mismatch); });
    if (SEND_GUEST_CONFIRMATIONS && guestRow) safely('guest letter', function () { sendGuestLetter(guestRow, data); });

    return jsonOut({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

// Open the Web App URL in a browser to check the deployment is live (logs nothing).
function doGet() {
  return ContentService.createTextOutput('Wedding RSVP endpoint is live.');
}

/* ------------------------------------------------------------------ helpers */

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function safely(label, fn) {
  try { fn(); } catch (err) { console.error('[' + label + '] failed: ' + err); }
}

function str(v, max) { return String(v == null ? '' : v).slice(0, max || 500); }

function parsePayload(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return null; }
  if (!d || typeof d !== 'object') return null;
  var members = Array.isArray(d.members) ? d.members.slice(0, 12).map(function (m) {
    return { name: str(m && m.name, 120), attending: !!(m && m.attending) };
  }) : [];
  return {
    code: str(d.code, 20).trim(),
    name: str(d.name, 120),
    attending: d.attending === 'Yes' ? 'Yes' : 'No',
    partySize: Math.max(0, Math.min(12, Number(d.partySize) || 0)),
    members: members,
    attendeeBreakdown: str(d.attendeeBreakdown, 800),
    message: str(d.message, 1000),
    confirmationNumber: str(d.confirmationNumber, 60),
    email: validEmail(d.email) ? str(d.email, 254).trim() : '',
    submittedAt: d.submittedAt
  };
}

function validEmail(v) {
  var s = String(v || '').trim();
  return s.length > 0 && s.length <= 254 && /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(s);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function coupleConfigured() {
  return COUPLE_EMAILS.length > 0 && COUPLE_EMAILS.every(function (m) { return validEmail(m) && m.indexOf('REPLACE') === -1 && m.indexOf('example.com') === -1; });
}

/* ------------------------------------------------------------------ sheets */

function appendToLog(ss, data, submittedAt) {
  var sheet = ss.getSheetByName(RSVP_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(RSVP_LOG_SHEET);
    sheet.appendRow(LOG_HEADERS);
    sheet.setFrozenRows(1);
    ensureFilteredViews(ss);
  }
  sheet.appendRow([
    submittedAt, data.code, data.name, data.attending, data.partySize,
    data.attendeeBreakdown, data.message, data.confirmationNumber, data.email
  ]);
}

function findGuestRow(ss, code) {
  var sheet = ss.getSheetByName(GUEST_LIST_SHEET);
  if (!sheet || !code) return null;
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][GL.CODE - 1]).trim() === code) return { sheet: sheet, rowNum: r + 1, values: values[r] };
  }
  return null;
}

function normName(v) { return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, ''); }

// True when the responding name is the main guest or one of the named party members on that Guest List row
function nameMatches(rowValues, data) {
  var want = normName(data.name);
  if (!want) return false;
  var names = [rowValues[GL.MAIN - 1]].concat(String(rowValues[3] || '').split(','));
  return names.some(function (n) { return normName(n) === want; });
}

function isAnswered(rowValues) {
  var s = String(rowValues[GL.STATUS - 1] || '').trim();
  return s === 'Attending' || s === 'Declined';
}

function ensureGuestListHeaders(sheet) {
  if (!sheet.getRange(1, GL.EMAIL).getValue()) sheet.getRange(1, GL.EMAIL).setValue('Guest Email');
  if (!sheet.getRange(1, GL.LETTER_SENT).getValue()) sheet.getRange(1, GL.LETTER_SENT).setValue('Letter Emailed At');
}

function updateGuestListRow(guestRow, data, submittedAt) {
  var sheet = guestRow.sheet, rowNum = guestRow.rowNum;
  ensureGuestListHeaders(sheet);
  sheet.getRange(rowNum, GL.STATUS).setValue(data.attending === 'Yes' ? 'Attending' : 'Declined');
  sheet.getRange(rowNum, GL.PARTY).setValue(data.partySize);
  sheet.getRange(rowNum, GL.CONF).setValue(data.confirmationNumber);
  sheet.getRange(rowNum, GL.SUBMITTED).setValue(submittedAt);
  if (data.email) sheet.getRange(rowNum, GL.EMAIL).setValue(data.email);
}

// Running totals across the whole Guest List tab
function computeTally(ss) {
  var t = { total: 0, attendingParties: 0, declinedParties: 0, pending: 0, attendingSeats: 0, invitedSeats: 0 };
  var sheet = ss.getSheetByName(GUEST_LIST_SHEET);
  if (!sheet) return t;
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (!String(values[r][GL.CODE - 1]).trim()) continue;
    t.total++;
    t.invitedSeats += Number(values[r][GL.SEATS - 1]) || 0;
    var s = String(values[r][GL.STATUS - 1] || '').trim();
    if (s === 'Attending') { t.attendingParties++; t.attendingSeats += Number(values[r][GL.PARTY - 1]) || 0; }
    else if (s === 'Declined') t.declinedParties++;
    else t.pending++;
  }
  return t;
}

function ensureFilteredViews(ss) {
  if (!ss.getSheetByName('Attending')) {
    ss.insertSheet('Attending').getRange('A1').setFormula(
      '=QUERY(RSVPs!A:I, "select A, C, E, F, G, H, I where D = \'Yes\' order by C label A \'\'")'
    );
  }
  if (!ss.getSheetByName('Declined')) {
    ss.insertSheet('Declined').getRange('A1').setFormula(
      '=QUERY(RSVPs!A:I, "select A, C, F where D = \'No\' order by C label A \'\'")'
    );
  }
}

/* ------------------------------------------------------------------ emails */

function memberListHtml(members) {
  return members.map(function (m) {
    return '<tr><td style="padding:3px 12px 3px 0;color:' + (m.attending ? PALETTE.turquoiseDeep : PALETTE.soft) + ';font-weight:bold;">' + (m.attending ? '&#10003;' : '&#10005;') + '</td>' +
      '<td style="padding:3px 0;' + (m.attending ? '' : 'text-decoration:line-through;color:' + PALETTE.soft + ';') + '">' + esc(m.name) + '</td>' +
      '<td style="padding:3px 0 3px 12px;color:' + PALETTE.soft + ';font-size:12px;">' + (m.attending ? 'joyfully accepts' : 'regretfully declines') + '</td></tr>';
  }).join('');
}

function notifyCouple(data, tally, guestRow, mismatch) {
  if (!coupleConfigured()) { console.warn('COUPLE_EMAILS still contains placeholders — couple notification skipped.'); return; }
  var who = guestRow ? String(guestRow.values[GL.MAIN - 1]) : data.name;
  var subject = data.attending === 'Yes'
    ? 'RSVP: ' + who + ' — ' + data.partySize + ' attending'
    : 'RSVP: ' + who + ' — declined';

  var rows = data.members.length ? memberListHtml(data.members) : '<tr><td>' + esc(data.attendeeBreakdown) + '</td></tr>';
  var warn = guestRow ? '' : '<p style="background:#fff3cd;padding:8px 12px;border-radius:6px;">' + (mismatch
    ? 'Heads up: invitation code ' + esc(data.code) + ' belongs to &ldquo;' + esc(String(mismatch.values[GL.MAIN - 1])) + '&rdquo; in your "Guest List" tab, but the response came from &ldquo;' + esc(data.name) + '&rdquo;. The list was NOT updated and no letter was sent. Check that the Guest List tab matches the website.'
    : 'Heads up: this invitation code was not found in the "Guest List" tab, so the list was not updated.') + '</p>';
  var html =
    '<div style="font-family:Georgia,serif;color:' + PALETTE.ink + ';max-width:560px;">' +
    '<h2 style="margin:0 0 4px;color:' + PALETTE.roseDeep + ';font-weight:normal;font-style:italic;">New RSVP</h2>' +
    '<p style="margin:0 0 14px;color:' + PALETTE.soft + ';">' + esc(who) + (data.attending === 'Yes' ? ' will be joining you.' : ' sent their regrets.') + '</p>' +
    '<table style="border-collapse:collapse;font-size:15px;">' + rows + '</table>' +
    (data.message ? '<p style="margin:16px 0 0;padding:10px 14px;border-left:3px solid ' + PALETTE.rose + ';background:' + PALETTE.cream + ';"><em>&ldquo;' + esc(data.message) + '&rdquo;</em></p>' : '') +
    '<p style="margin:16px 0 0;font-size:13px;color:' + PALETTE.soft + ';">Confirmation no. <strong>' + esc(data.confirmationNumber) + '</strong>' + (data.email ? ' &middot; ' + esc(data.email) : '') + '</p>' +
    warn +
    '<hr style="border:none;border-top:1px solid #eadfd0;margin:18px 0;">' +
    '<p style="margin:0;font-size:14px;"><strong>So far:</strong> ' + (tally.attendingParties + tally.declinedParties) + ' of ' + tally.total + ' invitations have responded &middot; ' +
    '<strong>' + tally.attendingSeats + '</strong> seats confirmed &middot; ' + tally.declinedParties + ' declined &middot; ' + tally.pending + ' still pending.</p>' +
    '</div>';
  var text = subject + '\n' + data.attendeeBreakdown + (data.message ? '\nMessage: ' + data.message : '') +
    '\nConfirmation no. ' + data.confirmationNumber +
    '\nSo far: ' + (tally.attendingParties + tally.declinedParties) + ' of ' + tally.total + ' responded, ' + tally.attendingSeats + ' seats confirmed, ' + tally.declinedParties + ' declined, ' + tally.pending + ' pending.';

  MailApp.sendEmail({ to: COUPLE_EMAILS.join(','), subject: subject, body: text, htmlBody: html, name: 'Wedding RSVP' });
}

function sendGuestLetter(guestRow, data) {
  if (!data.email) return;
  var sheet = guestRow.sheet;
  var guestName = String(guestRow.values[GL.MAIN - 1]) || data.name;   // greet by the name on OUR list, never the client's text
  var attending = data.attending === 'Yes';
  var accepted = data.members.filter(function (m) { return m.attending; });

  var subject = attending
    ? 'Your RSVP is confirmed — ' + EVENT.couple + ', ' + EVENT.dateText
    : 'We received your response — ' + EVENT.couple;

  var details =
    '<table style="border-collapse:collapse;font-size:15px;margin:6px 0 4px;">' +
    row('Date', esc(EVENT.dateText)) +
    row('Ceremony', esc(EVENT.ceremony.time) + ' &middot; ' + esc(EVENT.ceremony.place)) +
    row('Reception', esc(EVENT.reception.time) + ' &middot; ' + esc(EVENT.reception.place)) +
    row('Venue', esc(EVENT.address) + '<br><a href="' + EVENT.mapsUrl + '" style="color:' + PALETTE.roseDeep + ';">Get directions</a>') +
    row('Attire', esc(EVENT.attire)) +
    row('Arrival', 'Please arrive 30 minutes before the ceremony begins.') +
    '</table>';

  var body = attending
    ? '<p>Thank you for your response. With joyful hearts, we have reserved ' + accepted.length + (accepted.length === 1 ? ' seat' : ' seats') + ' for you at our celebration:</p>' +
      '<table style="border-collapse:collapse;font-size:15px;margin:6px 0 14px;">' + memberListHtml(data.members) + '</table>' +
      '<p style="margin:14px 0 4px;"><strong>The details</strong></p>' + details +
      '<p style="font-size:13px;color:' + PALETTE.soft + ';margin-top:14px;">Only the guests named on your invitation will be accommodated &mdash; <strong style="color:' + PALETTE.roseDeep + ';">strictly no plus one</strong>. Thank you for your kind understanding.</p>'
    : '<p>Thank you for letting us know. We are sorry you will not be able to celebrate with us, and you will be missed on our special day. Our love goes with you.</p>';

  var html =
    '<div style="background:' + PALETTE.cream + ';padding:24px 12px;font-family:Georgia,\'Times New Roman\',serif;color:' + PALETTE.ink + ';">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #eadfd0;border-radius:14px;padding:34px 30px;">' +
    '<div style="text-align:center;">' +
    '<div style="letter-spacing:4px;font-size:11px;color:' + PALETTE.roseDeep + ';text-transform:uppercase;">' + (attending ? 'Confirmation of Attendance' : 'Thank You') + '</div>' +
    '<h1 style="margin:10px 0 2px;font-size:34px;font-weight:normal;font-style:italic;">Juan Paolo <span style="color:' + PALETTE.rose + ';">&amp;</span> Arlene</h1>' +
    '<div style="width:60px;height:2px;background:' + PALETTE.marigoldDeep + ';margin:14px auto 22px;opacity:.7;"></div>' +
    '</div>' +
    '<p style="font-size:16px;">Dear <strong>' + esc(guestName) + '</strong>,</p>' +
    body +
    '<p style="margin:22px 0 4px;font-size:13px;color:' + PALETTE.soft + ';">Confirmation no. <strong style="color:' + PALETTE.ink + ';">' + esc(data.confirmationNumber) + '</strong> &mdash; please keep this for the welcome table.</p>' +
    (SITE_URL ? '<p style="font-size:13px;"><a href="' + esc(SITE_URL) + '" style="color:' + PALETTE.roseDeep + ';">Visit our wedding website</a></p>' : '') +
    '<p style="margin:26px 0 0;font-style:italic;color:' + PALETTE.soft + ';">With love and gratitude,</p>' +
    '<p style="margin:2px 0 0;font-size:24px;font-style:italic;color:' + PALETTE.roseDeep + ';">Juan Paolo &amp; Arlene</p>' +
    '</div></div>';

  var text = (attending ? 'Your RSVP is confirmed.\n' : 'We received your response.\n') +
    'Dear ' + guestName + ',\n\n' + (attending
      ? accepted.length + ' seat(s) reserved: ' + accepted.map(function (m) { return m.name; }).join(', ') + '.\n\n' +
        EVENT.dateText + '\nCeremony: ' + EVENT.ceremony.time + ', ' + EVENT.ceremony.place + '\nReception: ' + EVENT.reception.time + ', ' + EVENT.reception.place +
        '\nVenue: ' + EVENT.address + '\nAttire: ' + EVENT.attire + '\n\nStrictly no plus one. Thank you for your kind understanding.'
      : 'You will be missed on our special day.') +
    '\n\nConfirmation no. ' + data.confirmationNumber + '\n\nWith love and gratitude,\n' + EVENT.couple;

  var opts = { to: data.email, subject: subject, body: text, htmlBody: html, name: EVENT.couple };
  if (coupleConfigured()) opts.replyTo = COUPLE_EMAILS[0];
  MailApp.sendEmail(opts);
  sheet.getRange(guestRow.rowNum, GL.LETTER_SENT).setValue(new Date());

  function row(label, value) {
    return '<tr><td style="padding:4px 14px 4px 0;color:' + PALETTE.marigoldDeep + ';font-size:12px;letter-spacing:1px;text-transform:uppercase;vertical-align:top;white-space:nowrap;">' + label + '</td><td style="padding:4px 0;">' + value + '</td></tr>';
  }
}

// Run this ONCE from the editor (choose "authorizeScript" in the dropdown, click Run) to grant the script
// permission to use the Sheet, Gmail and locks. It changes nothing.
function authorizeScript() {
  LockService.getScriptLock();
  SpreadsheetApp.getActiveSpreadsheet().getName();
  MailApp.getRemainingDailyQuota();
}

/* ------------------------------------------------------------------ one-time helper */

// The invitation list exactly as on the website (assets/data/guests.json): [code, side, main guest, party members, seats]
var GUEST_SEED = [
  ["JPA001","Groom","Ma. Theresa Angeles","Ma. Theresa Angeles, Alan Jay Angeles, Patrick Paolo Angeles",3],
  ["JPA002","Groom","Teresita Lopez","Teresita Lopez",1],
  ["JPA003","Groom","Alliyah Shantelle Angeles","Alliyah Shantelle Angeles",1],
  ["JPA004","Groom","Katrina Paola Ramirez","Katrina Paola Ramirez, Michael Angelo Ramirez, Alexis Katherine Ramirez",3],
  ["JPA005","Groom","Noah Angeles","Noah Angeles",1],
  ["JPA006","Groom","Shelby Angeles","Shelby Angeles",1],
  ["JPA007","Groom","Edna Lopez","Edna Lopez, Gab Lopez, JJ Lopez, Jeffrey Lopez",4],
  ["JPA008","Groom","Reymart Landingin","Reymart Landingin, Derrick Garcia",2],
  ["JPA009","Groom","Josh De Dios","Josh De Dios, Amharry Quibal",2],
  ["JPA010","Groom","Kristine Joy Escoto","Kristine Joy Escoto, Chester Escoto",2],
  ["JPA011","Groom","Jayson Abamo","Jayson Abamo",1],
  ["JPA012","Groom","Shiela Miclat","Shiela Miclat",1],
  ["JPA013","Groom","Winvic Gonzales","Winvic Gonzales",1],
  ["JPA014","Groom","Marlou Roxas","Marlou Roxas",1],
  ["JPA015","Groom","Sandra David","Sandra David",1],
  ["JPA016","Groom","Ron Macatuno","Ron Macatuno",1],
  ["JPA017","Groom","Ton Malonzo","Ton Malonzo",1],
  ["JPA018","Groom","Rayniel Reynaldo","Rayniel Reynaldo, Kayeneth Reynaldo",2],
  ["JPA019","Groom","Marx Castro","Marx Castro, Kaye Medina",2],
  ["JPA020","Groom","Arlene Joy Lazaro","Arlene Joy Lazaro, Angelo Lazaro, Aaron Lazaro",3],
  ["JPA021","Groom","Marcelina Malonzo","Marcelina Malonzo, Jopet Malonzo",2],
  ["JPA022","Groom","Lilia Esquivel","Lilia Esquivel, Ron Esquivel",2],
  ["JPA023","Groom","Marion Pablo","Marion Pablo, Maria Angela Leonardo",2],
  ["JPA024","Groom","Precious Cabarloc","Precious Cabarloc, JC Cabarloc",2],
  ["JPA025","Groom","Kyla Gonzales","Kyla Gonzales",1],
  ["JPA026","Groom","Alena Deles","Alena Deles, Allen John Deles, Antonette Deles, Angie Deles",4],
  ["JPA027","Groom","Edgar Salvador","Edgar Salvador",1],
  ["JPA028","Groom","Rosemarie Roxas","Rosemarie Roxas, Abit Dumalaog",2],
  ["JPA029","Groom","Rowena Caro","Rowena Caro, Jonathan Caro",2],
  ["JPA030","Groom","Ma. Lourdes Salvador","Ma. Lourdes Salvador, Joel Salvador",2],
  ["JPA031","Groom","Rowie Miranda","Rowie Miranda",1],
  ["JPA032","Groom","Reynaldo Munoz","Reynaldo Munoz",1],
  ["JPA033","Bride","Emelyn Lasquite","Emelyn Lasquite",1],
  ["JPA034","Bride","Arnulfo Lasquite","Arnulfo Lasquite",1],
  ["JPA035","Bride","Athalia Jaileen Cimara","Athalia Jaileen Cimara",1],
  ["JPA036","Bride","Angela Lasquite","Angela Lasquite",1],
  ["JPA037","Bride","Mary Grace Lasquite","Mary Grace Lasquite, Michalin Lajara, Matthew Lajara",3],
  ["JPA038","Bride","Mary Ann Lasquite","Mary Ann Lasquite",1],
  ["JPA039","Bride","Arnulfo Junior Lasquite","Arnulfo Junior Lasquite",1],
  ["JPA040","Bride","Jhun Alfredo Lasquite","Jhun Alfredo Lasquite, Anaya Riego, Lady Virtudazo, Tyler Lasquite",4],
  ["JPA041","Bride","Rose Cairme","Rose Cairme, Riva Lasquite, John Gabriel Lasquite",3],
  ["JPA042","Bride","Joandrea Lasquite","Joandrea Lasquite, Arthur Lasquite, Ezion Lasquite",3],
  ["JPA043","Bride","Lyra Jomillo","Lyra Jomillo",1],
  ["JPA044","Bride","Lareza Jomillo","Lareza Jomillo",1],
  ["JPA045","Bride","Jackie Saquibal","Jackie Saquibal",1],
  ["JPA046","Bride","Jay Ralp Lasquite","Jay Ralp Lasquite, Teofreda Lasquite, Reynante Lasquite",3],
  ["JPA047","Bride","Janine Lasquite","Janine Lasquite, John Reyfred Lasquite",2],
  ["JPA048","Bride","Beatriz Almazar","Beatriz Almazar",1],
  ["JPA049","Bride","Liza Lasquite","Liza Lasquite",1],
  ["JPA050","Bride","Marites Lasquite","Marites Lasquite, Tito Abano",2],
  ["JPA051","Bride","Mara Villafranca","Mara Villafranca, Norma Villafranca, Rafael Villafranca",3],
  ["JPA052","Bride","Alan Herrera","Alan Herrera, Maricel Ramos",2],
  ["JPA053","Bride","Gretchen Buenavista","Gretchen Buenavista, Simon Buenavista",2],
  ["JPA054","Bride","Giselle Mariano","Giselle Mariano",1],
  ["JPA055","Bride","Yvette Gatus","Yvette Gatus",1],
  ["JPA056","Bride","Patrick Caisido","Patrick Caisido",1],
  ["JPA057","Bride","Paolo Pangilinan","Paolo Pangilinan",1],
  ["JPA058","Bride","Irish Zamora","Irish Zamora",1]
];

// Run ONCE from the editor (choose "rebuildGuestList", click Run) to (re)write the "Guest List" tab so every
// invitation code, name and seat count matches the website, with everyone set to Pending.
// WARNING: it replaces the whole tab, so run it before real RSVPs arrive.
function rebuildGuestList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GUEST_LIST_SHEET) || ss.insertSheet(GUEST_LIST_SHEET);
  sheet.clearContents();
  var out = [['Code', 'Side', 'Main Guest Name', 'Party Members', 'Allowed Seats', 'RSVP Status', 'Party Size Confirmed', 'Confirmation Number', 'Submitted At', 'Guest Email', 'Letter Emailed At']];
  GUEST_SEED.forEach(function (g) { out.push([g[0], g[1], g[2], g[3], g[4], 'Pending', '', '', '', '', '']); });
  sheet.getRange(1, 1, out.length, 11).setValues(out);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
  console.log('Guest List rebuilt: ' + GUEST_SEED.length + ' invitations.');
}

// Run ONCE from the editor (choose "resetAllRsvps", click Run) to wipe every RSVP: rebuilds the Guest List tab
// (everyone Pending, no emails/confirmations) AND deletes all rows in the RSVPs log tab.
// WARNING: this erases all responses. Use it only before the invitations go out.
function resetAllRsvps() {
  rebuildGuestList();
  var log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVP_LOG_SHEET);
  if (log && log.getLastRow() > 1) log.deleteRows(2, log.getLastRow() - 1);
  console.log('All RSVPs cleared.');
}
