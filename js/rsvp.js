/* =========================================================================
   Juan Paolo & Arlene — rsvp.js
   Strict RSVP portal: guest name lookup, seat limits, accept/decline,
   deadline enforcement, duplicate-submission prevention, QR confirmation,
   and a live submission log to a Google Sheet (downloadable as Excel).

   Notes on data model (static-site constraints):
   - The guest list lives in assets/data/guests.json (fetched at runtime,
     with an inline fallback below for when the site is opened without a
     server, e.g. double-clicking index.html). Each guest's `code` is an
     internal ID only — guests never see or type it; they identify
     themselves by typing their full name.
   - Because this is a purely static site with no backend, "preventing
     duplicate RSVPs" is enforced per-browser via localStorage. A guest
     cannot resubmit from the same device, but this JSON file is never
     rewritten by the client.
   - For a real, centralized seating/attendance record (the thing you'd
     actually hand to a caterer), every submission is also sent to a
     Google Sheet — see SHEETS_ENDPOINT below and google-apps-script.gs
     for the one-time setup. Open the Sheet any time and use
     File → Download → Microsoft Excel (.xlsx) to get the seating
     arrangement and the attending/declined lists.
   ========================================================================= */
(function () {
  'use strict';

  /* ----------------------- Configuration ----------------------- */
  var RSVP_DEADLINE_ISO = '2026-12-01T23:59:59+08:00';
  var GUEST_DATA_URL = 'assets/data/guests.json';
  var STORAGE_PREFIX = 'jpa_wedding_rsvp_';

  // Paste your deployed Google Apps Script Web App URL here to have every
  // RSVP (accept or decline) logged live to a Google Sheet. Leave blank to
  // disable — the site still works fully without it. See google-apps-script.gs.
  var SHEETS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxqytHaLuJbQhbra7NJaupJA9k217Ji1AJQw20JYL2bOJiS4tsG1TJVWUb35zEGVh3G/exec';

  // Fallback copy — keep in sync with assets/data/guests.json.
  // Generated from the "Guest List" tab of "Guest List - Master.xlsx".
  var FALLBACK_GUESTS = [
    { code: 'JPA001', name: 'Ma. Theresa Angeles', allowedSeats: 3, members: ['Ma. Theresa Angeles', 'Alan Jay Angeles', 'Patrick Paolo Angeles'], rsvpSubmitted: false },
    { code: 'JPA002', name: 'Teresita Lopez', allowedSeats: 1, members: ['Teresita Lopez'], rsvpSubmitted: false },
    { code: 'JPA003', name: 'Alliyah Shantelle Angeles', allowedSeats: 1, members: ['Alliyah Shantelle Angeles'], rsvpSubmitted: false },
    { code: 'JPA004', name: 'Katrina Paola Ramirez', allowedSeats: 3, members: ['Katrina Paola Ramirez', 'Michael Angelo Ramirez', 'Alexis Katherine Ramirez'], rsvpSubmitted: false },
    { code: 'JPA005', name: 'Noah Angeles', allowedSeats: 1, members: ['Noah Angeles'], rsvpSubmitted: false },
    { code: 'JPA006', name: 'Shelby Angeles', allowedSeats: 1, members: ['Shelby Angeles'], rsvpSubmitted: false },
    { code: 'JPA007', name: 'Edna Lopez', allowedSeats: 4, members: ['Edna Lopez', 'Gab Lopez', 'JJ Lopez', 'Jeffrey Lopez'], rsvpSubmitted: false },
    { code: 'JPA008', name: 'Reymart Landingin', allowedSeats: 2, members: ['Reymart Landingin', 'Derrick Garcia'], rsvpSubmitted: false },
    { code: 'JPA009', name: 'Josh De Dios', allowedSeats: 2, members: ['Josh De Dios', 'Amharry Quibal'], rsvpSubmitted: false },
    { code: 'JPA010', name: 'Kristine Joy Escoto', allowedSeats: 2, members: ['Kristine Joy Escoto', 'Chester Escoto'], rsvpSubmitted: false },
    { code: 'JPA011', name: 'Jayson Abamo', allowedSeats: 1, members: ['Jayson Abamo'], rsvpSubmitted: false },
    { code: 'JPA012', name: 'Shiela Miclat', allowedSeats: 1, members: ['Shiela Miclat'], rsvpSubmitted: false },
    { code: 'JPA013', name: 'Winvic Gonzales', allowedSeats: 1, members: ['Winvic Gonzales'], rsvpSubmitted: false },
    { code: 'JPA014', name: 'Marlou Roxas', allowedSeats: 1, members: ['Marlou Roxas'], rsvpSubmitted: false },
    { code: 'JPA015', name: 'Sandra David', allowedSeats: 1, members: ['Sandra David'], rsvpSubmitted: false },
    { code: 'JPA016', name: 'Ron Macatuno', allowedSeats: 1, members: ['Ron Macatuno'], rsvpSubmitted: false },
    { code: 'JPA017', name: 'Ton Malonzo', allowedSeats: 1, members: ['Ton Malonzo'], rsvpSubmitted: false },
    { code: 'JPA018', name: 'Rayniel Reynaldo', allowedSeats: 2, members: ['Rayniel Reynaldo', 'Kayeneth Reynaldo'], rsvpSubmitted: false },
    { code: 'JPA019', name: 'Marx Castro', allowedSeats: 2, members: ['Marx Castro', 'Kaye Medina'], rsvpSubmitted: false },
    { code: 'JPA020', name: 'Arlene Joy Lazaro', allowedSeats: 3, members: ['Arlene Joy Lazaro', 'Angelo Lazaro', 'Aaron Lazaro'], rsvpSubmitted: false },
    { code: 'JPA021', name: 'Marcelina Malonzo', allowedSeats: 2, members: ['Marcelina Malonzo', 'Jopet Malonzo'], rsvpSubmitted: false },
    { code: 'JPA022', name: 'Lilia Esquivel', allowedSeats: 2, members: ['Lilia Esquivel', 'Ron Esquivel'], rsvpSubmitted: false },
    { code: 'JPA023', name: 'Marion Pablo', allowedSeats: 2, members: ['Marion Pablo', 'Maria Angela Leonardo'], rsvpSubmitted: false },
    { code: 'JPA024', name: 'Precious Cabarloc', allowedSeats: 2, members: ['Precious Cabarloc', 'JC Cabarloc'], rsvpSubmitted: false },
    { code: 'JPA025', name: 'Kyla Gonzales', allowedSeats: 1, members: ['Kyla Gonzales'], rsvpSubmitted: false },
    { code: 'JPA026', name: 'Alena Deles', allowedSeats: 4, members: ['Alena Deles', 'Allen John Deles', 'Antonette Deles', 'Angie Deles'], rsvpSubmitted: false },
    { code: 'JPA027', name: 'Edgar Salvador', allowedSeats: 1, members: ['Edgar Salvador'], rsvpSubmitted: false },
    { code: 'JPA028', name: 'Rosemarie Roxas', allowedSeats: 2, members: ['Rosemarie Roxas', 'Abit Dumalaog'], rsvpSubmitted: false },
    { code: 'JPA029', name: 'Rowena Caro', allowedSeats: 2, members: ['Rowena Caro', 'Jonathan Caro'], rsvpSubmitted: false },
    { code: 'JPA030', name: 'Ma. Lourdes Salvador', allowedSeats: 2, members: ['Ma. Lourdes Salvador', 'Joel Salvador'], rsvpSubmitted: false },
    { code: 'JPA031', name: 'Rowie Miranda', allowedSeats: 1, members: ['Rowie Miranda'], rsvpSubmitted: false },
    { code: 'JPA032', name: 'Reynaldo Munoz', allowedSeats: 1, members: ['Reynaldo Munoz'], rsvpSubmitted: false },
    { code: 'JPA033', name: 'Emelyn Lasquite', allowedSeats: 1, members: ['Emelyn Lasquite'], rsvpSubmitted: false },
    { code: 'JPA034', name: 'Arnulfo Lasquite', allowedSeats: 1, members: ['Arnulfo Lasquite'], rsvpSubmitted: false },
    { code: 'JPA035', name: 'Athalia Jaileen Cimara', allowedSeats: 1, members: ['Athalia Jaileen Cimara'], rsvpSubmitted: false },
    { code: 'JPA036', name: 'Angela Lasquite', allowedSeats: 1, members: ['Angela Lasquite'], rsvpSubmitted: false },
    { code: 'JPA037', name: 'Mary Grace Lasquite', allowedSeats: 3, members: ['Mary Grace Lasquite', 'Michalin Lajara', 'Matthew Lajara'], rsvpSubmitted: false },
    { code: 'JPA038', name: 'Mary Ann Lasquite', allowedSeats: 1, members: ['Mary Ann Lasquite'], rsvpSubmitted: false },
    { code: 'JPA039', name: 'Arnulfo Junior Lasquite', allowedSeats: 1, members: ['Arnulfo Junior Lasquite'], rsvpSubmitted: false },
    { code: 'JPA040', name: 'Jhun Alfredo Lasquite', allowedSeats: 4, members: ['Jhun Alfredo Lasquite', 'Anaya Riego', 'Lady Virtudazo', 'Tyler Lasquite'], rsvpSubmitted: false },
    { code: 'JPA041', name: 'Rose Cairme', allowedSeats: 3, members: ['Rose Cairme', 'Riva Lasquite', 'John Gabriel Lasquite'], rsvpSubmitted: false },
    { code: 'JPA042', name: 'Joandrea Lasquite', allowedSeats: 3, members: ['Joandrea Lasquite', 'Arthur Lasquite', 'Ezion Lasquite'], rsvpSubmitted: false },
    { code: 'JPA043', name: 'Lyra Jomillo', allowedSeats: 1, members: ['Lyra Jomillo'], rsvpSubmitted: false },
    { code: 'JPA044', name: 'Lareza Jomillo', allowedSeats: 1, members: ['Lareza Jomillo'], rsvpSubmitted: false },
    { code: 'JPA045', name: 'Jackie Saquibal', allowedSeats: 1, members: ['Jackie Saquibal'], rsvpSubmitted: false },
    { code: 'JPA046', name: 'Jay Ralp Lasquite', allowedSeats: 3, members: ['Jay Ralp Lasquite', 'Teofreda Lasquite', 'Reynante Lasquite'], rsvpSubmitted: false },
    { code: 'JPA047', name: 'Janine Lasquite', allowedSeats: 2, members: ['Janine Lasquite', 'John Reyfred Lasquite'], rsvpSubmitted: false },
    { code: 'JPA048', name: 'Beatriz Almazar', allowedSeats: 1, members: ['Beatriz Almazar'], rsvpSubmitted: false },
    { code: 'JPA049', name: 'Liza Lasquite', allowedSeats: 1, members: ['Liza Lasquite'], rsvpSubmitted: false },
    { code: 'JPA050', name: 'Marites Lasquite', allowedSeats: 2, members: ['Marites Lasquite', 'Tito Abano'], rsvpSubmitted: false },
    { code: 'JPA051', name: 'Mara Villafranca', allowedSeats: 3, members: ['Mara Villafranca', 'Norma Villafranca', 'Rafael Villafranca'], rsvpSubmitted: false },
    { code: 'JPA052', name: 'Alan Herrera', allowedSeats: 2, members: ['Alan Herrera', 'Maricel Ramos'], rsvpSubmitted: false },
    { code: 'JPA053', name: 'Gretchen Buenavista', allowedSeats: 2, members: ['Gretchen Buenavista', 'Simon Buenavista'], rsvpSubmitted: false },
    { code: 'JPA054', name: 'Giselle Mariano', allowedSeats: 1, members: ['Giselle Mariano'], rsvpSubmitted: false },
    { code: 'JPA055', name: 'Yvette Gatus', allowedSeats: 1, members: ['Yvette Gatus'], rsvpSubmitted: false },
    { code: 'JPA056', name: 'Patrick Caisido', allowedSeats: 1, members: ['Patrick Caisido'], rsvpSubmitted: false },
    { code: 'JPA057', name: 'Paolo Pangilinan', allowedSeats: 1, members: ['Paolo Pangilinan'], rsvpSubmitted: false },
    { code: 'JPA058', name: 'Irish Zamora', allowedSeats: 1, members: ['Irish Zamora'], rsvpSubmitted: false },
    { code: 'JPA059', name: 'Patricia Roxas', allowedSeats: 2, members: ['Patricia Roxas', 'Roderick Roxas'], rsvpSubmitted: false },
    { code: 'JPA060', name: 'Raquel Mirano', allowedSeats: 2, members: ['Raquel Mirano', 'Jaime Mirano'], rsvpSubmitted: false },
    { code: 'JPA061', name: 'Ramon Cruz', allowedSeats: 2, members: ['Ramon Cruz', 'Anne Cruz'], rsvpSubmitted: false },
    { code: 'JPA062', name: 'Marina Cruz', allowedSeats: 1, members: ['Marina Cruz'], rsvpSubmitted: false },
    { code: 'JPA063', name: 'Leonora Mapalad', allowedSeats: 1, members: ['Leonora Mapalad'], rsvpSubmitted: false },
    { code: 'JPA064', name: 'Jing Takeda', allowedSeats: 1, members: ['Jing Takeda'], rsvpSubmitted: false }
  ];

  var guestList = FALLBACK_GUESTS;
  var currentGuest = null;
  var lastPayload = null; // the RSVP just submitted — feeds the confirmation letter

  /* ----------------------- DOM refs ----------------------- */
  var els = {};

  function cacheEls() {
    els.codeForm = document.getElementById('codeForm');
    els.guestNameInput = document.getElementById('guestNameInput');
    els.nameSuggestions = document.getElementById('nameSuggestions');
    els.codeError = document.getElementById('codeError');
    els.codeSubmitBtn = document.getElementById('codeSubmitBtn');

    els.rsvpForm = document.getElementById('rsvpForm');
    els.guestName = document.getElementById('guestName');
    els.guestSeats = document.getElementById('guestSeats');
    els.changeCodeBtn = document.getElementById('changeCodeBtn');

    els.partyMembers = document.getElementById('partyMembers');
    els.message = document.getElementById('message');
    els.rsvpError = document.getElementById('rsvpError');

    els.alreadyStep = document.getElementById('alreadyStep');
    els.alreadyConfNumber = document.getElementById('alreadyConfNumber');
    els.alreadyChangeBtn = document.getElementById('alreadyChangeBtn');

    els.closedStep = document.getElementById('closedStep');
    els.rsvpDeadlineText = document.getElementById('rsvpDeadlineText');

    els.confirmModal = document.getElementById('confirmModal');
    els.confirmBackdrop = document.getElementById('confirmBackdrop');
    els.confirmClose = document.getElementById('confirmClose');
    els.confirmDoneBtn = document.getElementById('confirmDoneBtn');
    els.confirmTitle = document.getElementById('confirmTitle');
    els.confirmBody = document.getElementById('confirmBody');
    els.confNumber = document.getElementById('confNumber');
    els.qrWrap = document.getElementById('qrWrap');
    els.qrCode = document.getElementById('qrCode');

    els.guestEmail = document.getElementById('guestEmail');
    els.emailNote = document.getElementById('emailNote');
    els.modalPanel = document.querySelector('#confirmModal .modal__panel');
    els.confirmView = document.getElementById('confirmView');
    els.viewLetterBtn = document.getElementById('viewLetterBtn');
    els.letterView = document.getElementById('letterView');
    els.letterGuest = document.getElementById('letterGuest');
    els.letterEyebrow = document.getElementById('letterEyebrow');
    els.letterIntro = document.getElementById('letterIntro');
    els.letterMembers = document.getElementById('letterMembers');
    els.letterDetails = document.getElementById('letterDetails');
    els.letterConf = document.getElementById('letterConf');
    els.letterQr = document.getElementById('letterQr');
    els.letterPrintBtn = document.getElementById('letterPrintBtn');
    els.letterBackBtn = document.getElementById('letterBackBtn');
  }

  /* ----------------------- Helpers ----------------------- */
  function isPastDeadline() {
    return Date.now() > new Date(RSVP_DEADLINE_ISO).getTime();
  }

  function formatDeadline() {
    var d = new Date(RSVP_DEADLINE_ISO);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Lowercase and strip accents/punctuation so "Ma. Theresa" matches "ma theresa"
  function searchKey(str) {
    return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function storageKey(code) { return STORAGE_PREFIX + code.toUpperCase(); }

  function getStoredRsvp(code) {
    try {
      var raw = localStorage.getItem(storageKey(code));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveRsvp(code, data) {
    try {
      localStorage.setItem(storageKey(code), JSON.stringify(data));
    } catch (e) {
      console.warn('Unable to persist RSVP to localStorage:', e);
    }
  }

  function generateConfirmationNumber(code) {
    var ts = Date.now().toString(36).toUpperCase();
    var rand = Math.floor(Math.random() * 46656).toString(36).toUpperCase(); // 0-ZZZ
    return 'JPA-' + code.toUpperCase() + '-' + ts.slice(-4) + rand;
  }

  // True when every typed word starts some word of `key` (any order).
  function matchesAll(tokens, key) {
    var words = key.split(' ');
    return tokens.every(function (t) {
      return words.some(function (w) { return w.indexOf(t) === 0; });
    });
  }

  // Easy partial search — guests don't need the full name. Every typed word
  // must begin a word in the invitation's main guest name or in one of its
  // named party members. Best matches first. The internal `code` is never used.
  function searchGuests(query) {
    var qKey = searchKey(query);
    if (qKey.length < 2) return [];
    var tokens = qKey.split(' ');
    var results = [];
    guestList.forEach(function (g) {
      var mainKey = searchKey(g.name);
      var rank = -1;
      var via = '';
      if (mainKey === qKey) rank = 0;
      else if (mainKey.indexOf(qKey) === 0) rank = 1;
      else if (matchesAll(tokens, mainKey)) rank = 2;
      else {
        var names = membersOf(g);
        for (var i = 0; i < names.length; i++) {
          var k = searchKey(names[i]);
          if (k !== mainKey && matchesAll(tokens, k)) { rank = 3; via = names[i]; break; }
        }
      }
      if (rank >= 0) results.push({ guest: g, rank: rank, via: via });
    });
    results.sort(function (a, b) { return a.rank - b.rank || a.guest.name.localeCompare(b.guest.name); });
    return results;
  }

  function showStep(stepName) {
    ['codeForm', 'rsvpForm', 'alreadyStep', 'closedStep'].forEach(function (key) {
      var el = els[key];
      if (!el) return;
      var name = el.getAttribute('data-step');
      el.classList.toggle('rsvp__step--hidden', name !== stepName);
    });
  }

  /* ----------------------- Load guest data ----------------------- */
  function loadGuestList(callback) {
    if (typeof fetch !== 'function') { callback(); return; }
    fetch(GUEST_DATA_URL, { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error('bad response'); return res.json(); })
      .then(function (data) {
        if (Array.isArray(data) && data.length) guestList = data;
        callback();
      })
      .catch(function () {
        // Offline / opened via file:// — fall back to inline copy
        callback();
      });
  }

  /* ----------------------- Step 1: name lookup ----------------------- */
  function handleCodeSubmit(e) {
    e.preventDefault();
    els.codeError.textContent = '';
    els.codeError.classList.remove('shake');

    if (isPastDeadline()) {
      showStep('closed');
      return;
    }

    hideSuggestions();

    var typedName = els.guestNameInput.value.trim();
    if (!typedName) return;

    if (searchKey(typedName).length < 2) {
      showLookupError('Please type at least two letters of your name.');
      return;
    }

    var results = searchGuests(typedName);
    if (!results.length) {
      showLookupError('We couldn’t find a guest by that name. Try just your first or last name, or contact the couple directly.');
      return;
    }

    // One clear match (or one exact match) opens the invitation; otherwise let them pick.
    if (results.length === 1 || (results[0].rank === 0 && results[1].rank !== 0)) {
      openInvitation(results[0].guest);
      return;
    }
    renderSuggestions();
    els.codeError.textContent = 'A few guests match — please tap your name in the list.';
  }

  function showLookupError(message) {
    els.codeError.textContent = message;
    requestAnimationFrame(function () { els.codeError.classList.add('shake'); });
  }

  /* ----------------------- Name suggestions (autocomplete) ----------------------- */
  var suggestions = [];
  var activeIndex = -1;

  function hideSuggestions() {
    els.nameSuggestions.hidden = true;
    els.guestNameInput.setAttribute('aria-expanded', 'false');
    els.guestNameInput.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function renderSuggestions() {
    suggestions = searchGuests(els.guestNameInput.value).slice(0, 6);
    els.nameSuggestions.innerHTML = '';
    activeIndex = -1;
    if (!suggestions.length) { hideSuggestions(); return; }

    suggestions.forEach(function (r, i) {
      var li = document.createElement('li');
      li.className = 'name-suggestions__item';
      li.id = 'nameSuggestion-' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');

      var main = document.createElement('span');
      main.className = 'name-suggestions__name';
      main.textContent = r.guest.name;
      li.appendChild(main);

      if (r.via) {
        var sub = document.createElement('span');
        sub.className = 'name-suggestions__via';
        sub.textContent = 'includes ' + r.via;
        li.appendChild(sub);
      }

      // mousedown (not click) so the input keeps focus and doesn't blur-hide the list first
      li.addEventListener('mousedown', function (ev) { ev.preventDefault(); chooseGuest(r.guest); });
      els.nameSuggestions.appendChild(li);
    });

    els.nameSuggestions.hidden = false;
    els.guestNameInput.setAttribute('aria-expanded', 'true');
  }

  function setActiveSuggestion(i) {
    Array.prototype.forEach.call(els.nameSuggestions.children, function (el, idx) {
      el.classList.toggle('is-active', idx === i);
      el.setAttribute('aria-selected', idx === i ? 'true' : 'false');
    });
    activeIndex = i;
    els.guestNameInput.setAttribute('aria-activedescendant', 'nameSuggestion-' + i);
  }

  function handleNameKeydown(e) {
    if (els.nameSuggestions.hidden) return;
    var n = suggestions.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion(activeIndex + 1 >= n ? 0 : activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion(activeIndex <= 0 ? n - 1 : activeIndex - 1);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      chooseGuest(suggestions[activeIndex].guest);
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  }

  function chooseGuest(guest) {
    els.guestNameInput.value = guest.name;
    els.codeError.textContent = '';
    hideSuggestions();
    openInvitation(guest);
  }

  /* ----------------------- Open the matched invitation ----------------------- */
  function openInvitation(guest) {
    if (isPastDeadline()) { showStep('closed'); return; }

    var stored = getStoredRsvp(guest.code);
    if (guest.rsvpSubmitted || stored) {
      currentGuest = guest;
      els.alreadyConfNumber.textContent = (stored && stored.confirmationNumber) || 'On file';
      showStep('already');
      return;
    }

    currentGuest = guest;
    populateGuestBanner(guest);
    showStep('rsvp');
  }

  // The exact, named people this invitation covers — strictly this list,
  // nobody else. Older cached guest records without a `members` array just
  // cover the one named guest.
  function membersOf(guest) {
    return (Array.isArray(guest.members) && guest.members.length) ? guest.members : [guest.name];
  }

  function populateGuestBanner(guest) {
    els.guestName.textContent = guest.name;
    els.guestSeats.textContent = guest.allowedSeats;

    els.partyMembers.innerHTML = '';
    membersOf(guest).forEach(function (memberName, i) {
      var row = document.createElement('div');
      row.className = 'party-member';

      var nameEl = document.createElement('span');
      nameEl.className = 'party-member__name';
      nameEl.textContent = memberName;

      var status = document.createElement('span');
      status.className = 'party-member__status';
      status.textContent = 'Joyfully Accepts';

      var toggle = document.createElement('label');
      toggle.className = 'toggle-switch';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'member-' + i;
      input.checked = true; // defaults to attending; toggle off to decline for this person
      var track = document.createElement('span');
      track.className = 'toggle-switch__track';
      var thumb = document.createElement('span');
      thumb.className = 'toggle-switch__thumb';
      track.appendChild(thumb);
      toggle.appendChild(input);
      toggle.appendChild(track);

      input.addEventListener('change', function () {
        var attending = input.checked;
        nameEl.classList.toggle('party-member__name--declined', !attending);
        status.textContent = attending ? 'Joyfully Accepts' : 'Regretfully Declines';
        status.classList.toggle('party-member__status--declined', !attending);
      });

      var toggleWrap = document.createElement('div');
      toggleWrap.className = 'party-member__toggle-wrap';
      toggleWrap.appendChild(status);
      toggleWrap.appendChild(toggle);

      row.appendChild(nameEl);
      row.appendChild(toggleWrap);
      els.partyMembers.appendChild(row);
    });
  }

  /* ----------------------- Step 2: RSVP submit ----------------------- */
  function handleRsvpSubmit(e) {
    e.preventDefault();
    els.rsvpError.textContent = '';

    if (isPastDeadline()) { showStep('closed'); return; }
    if (!currentGuest) return;

    var names = membersOf(currentGuest);
    var decisions = names.map(function (name, i) {
      var input = els.rsvpForm.querySelector('input[name="member-' + i + '"]');
      return { name: name, attending: !!(input && input.checked) };
    });

    var email = els.guestEmail.value.trim();
    if (email && !/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(email)) {
      els.rsvpError.textContent = 'That email address doesn’t look right — please check it, or leave it blank.';
      els.guestEmail.focus();
      return;
    }

    var attendingCount = decisions.filter(function (d) { return d.attending; }).length;
    var attending = attendingCount > 0;

    var payload = {
      code: currentGuest.code,
      name: currentGuest.name,
      allowedSeats: currentGuest.allowedSeats,
      attending: attending,
      partySize: attendingCount,
      members: decisions,
      message: els.message.value.trim(),
      submittedAt: new Date().toISOString()
    };

    var confirmationNumber = generateConfirmationNumber(currentGuest.code);
    payload.confirmationNumber = confirmationNumber;

    // Prevent duplicate submissions on this browser (the email address is not kept in the browser)
    saveRsvp(currentGuest.code, payload);
    currentGuest.rsvpSubmitted = true;

    // Send to the back office: updates the guest list, emails the couple, and emails the guest their letter
    payload.email = email;
    submitToSheet(payload);

    showConfirmation(payload);
    els.rsvpForm.reset();
  }

  /* ----------------------- Google Sheet logging ----------------------- */
  function submitToSheet(payload) {
    if (!SHEETS_ENDPOINT || typeof fetch !== 'function') return;
    fetch(SHEETS_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors', // Apps Script web apps don't return readable CORS responses; fire-and-forget
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        code: payload.code,
        name: payload.name,
        attending: payload.attending ? 'Yes' : 'No',
        partySize: payload.partySize,
        email: payload.email || '',
        members: payload.members || [],
        attendeeBreakdown: (payload.members || []).map(function (m) {
          return m.name + ': ' + (m.attending ? 'Joyfully Accepts' : 'Regretfully Declines');
        }).join('; '),
        message: payload.message || '',
        confirmationNumber: payload.confirmationNumber,
        submittedAt: payload.submittedAt
      })
    }).catch(function (err) {
      console.warn('Could not reach the RSVP sheet endpoint (the RSVP itself still succeeded):', err);
    });
  }

  // Turns [{name, attending}] into a friendly sentence, e.g.
  // "Kat and Lexi are joining you. Alo has sent regrets."
  function summarizeDecisions(members) {
    var accepted = members.filter(function (m) { return m.attending; }).map(function (m) { return m.name; });
    var declined = members.filter(function (m) { return !m.attending; }).map(function (m) { return m.name; });
    function joinNames(list) {
      if (list.length <= 1) return list.join('');
      return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
    }
    var parts = [];
    if (accepted.length) parts.push(joinNames(accepted) + (accepted.length > 1 ? ' are' : ' is') + ' joining you');
    if (declined.length) parts.push(joinNames(declined) + (declined.length > 1 ? ' have' : ' has') + ' sent regrets');
    return parts.join('. ') + '.';
  }

  /* ----------------------- Confirmation modal + QR ----------------------- */
  function showConfirmation(payload) {
    els.confirmTitle.textContent = payload.attending ? 'Thank You!' : 'We’ll Miss You';
    els.confirmBody.textContent = payload.members.length > 1
      ? summarizeDecisions(payload.members)
      : (payload.attending
        ? 'Your RSVP has been received. We can’t wait to celebrate with you!'
        : 'Thank you for letting us know. You will be missed on our special day.');
    els.confNumber.textContent = payload.confirmationNumber;
    lastPayload = payload;

    // only promise an email when one can actually be sent
    if (payload.email && SHEETS_ENDPOINT) {
      els.emailNote.textContent = 'A confirmation letter is on its way to ' + payload.email + '.';
      els.emailNote.hidden = false;
    } else {
      els.emailNote.hidden = true;
    }

    renderQr(els.qrCode, payload);
    els.qrWrap.hidden = !(payload.attending && window.QRCode);

    showConfirmView();
    els.confirmModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function renderQr(target, payload) {
    target.innerHTML = '';
    if (!payload.attending || !window.QRCode) return;
    /* eslint-disable no-new */
    new QRCode(target, {
      text: 'JPA-Wedding | ' + payload.name + ' | ' + payload.confirmationNumber,
      width: 140,
      height: 140,
      colorDark: '#33283A',
      colorLight: '#ffffff'
    });
  }

  /* ----------------------- Confirmation letter (on screen, printable) ----------------------- */
  function showConfirmView() {
    els.letterView.hidden = true;
    els.confirmView.hidden = false;
    els.modalPanel.classList.remove('modal__panel--letter');
  }

  function showLetter() {
    var p = lastPayload;
    if (!p) return;
    var accepted = p.members.filter(function (m) { return m.attending; });

    els.letterGuest.textContent = p.name;
    els.letterConf.textContent = p.confirmationNumber;
    els.letterEyebrow.textContent = p.attending ? 'Confirmation of Attendance' : 'Thank You';
    els.letterIntro.textContent = p.attending
      ? 'Thank you for your response. With joyful hearts, we have reserved ' + accepted.length +
        (accepted.length === 1 ? ' seat' : ' seats') + ' for you at our celebration:'
      : 'Thank you for letting us know. We are sorry you will not be able to celebrate with us, and you will be missed on our special day. Our love goes with you.';

    els.letterMembers.innerHTML = '';
    if (p.attending || p.members.length > 1) {
      p.members.forEach(function (m) {
        var li = document.createElement('li');
        if (!m.attending) li.className = 'is-declined';
        var mark = document.createElement('span'); mark.className = 'mark'; mark.textContent = m.attending ? '✓' : '✕';
        var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = m.name;
        var st = document.createElement('span'); st.className = 'state'; st.textContent = m.attending ? 'joyfully accepts' : 'regretfully declines';
        li.appendChild(mark); li.appendChild(nm); li.appendChild(st);
        els.letterMembers.appendChild(li);
      });
    }
    els.letterDetails.hidden = !p.attending;
    renderQr(els.letterQr, p);

    els.confirmView.hidden = true;
    els.letterView.hidden = false;
    els.modalPanel.classList.add('modal__panel--letter');
    els.letterView.scrollIntoView({ block: 'start' });
  }

  function printLetter() {
    document.body.classList.add('print-letter');
    var cleanup = function () { document.body.classList.remove('print-letter'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print(); // the class only affects @media print, so leaving it on if afterprint never fires is harmless
  }

  function closeConfirmation() {
    els.confirmModal.hidden = true;
    document.body.style.overflow = '';
    showConfirmView();
    showStep('already');
    if (currentGuest) {
      var stored = getStoredRsvp(currentGuest.code);
      els.alreadyConfNumber.textContent = (stored && stored.confirmationNumber) || 'On file';
    }
  }

  /* ----------------------- Reset / change name ----------------------- */
  function resetToLookup() {
    currentGuest = null;
    els.guestNameInput.value = '';
    els.codeError.textContent = '';
    hideSuggestions();
    showStep('lookup');
    els.guestNameInput.focus();
  }

  /* ----------------------- Init ----------------------- */
  function init() {
    cacheEls();
    if (!els.codeForm) return;

    els.rsvpDeadlineText.textContent = formatDeadline();

    if (isPastDeadline()) {
      showStep('closed');
    }

    loadGuestList(function () { /* guestList is now populated (or fallback retained) */ });

    els.codeForm.addEventListener('submit', handleCodeSubmit);
    els.guestNameInput.addEventListener('input', function () {
      els.codeError.textContent = '';
      renderSuggestions();
    });
    els.guestNameInput.addEventListener('focus', renderSuggestions);
    els.guestNameInput.addEventListener('blur', hideSuggestions);
    els.guestNameInput.addEventListener('keydown', handleNameKeydown);
    els.changeCodeBtn.addEventListener('click', resetToLookup);
    els.alreadyChangeBtn.addEventListener('click', resetToLookup);
    els.rsvpForm.addEventListener('submit', handleRsvpSubmit);

    els.confirmClose.addEventListener('click', closeConfirmation);
    els.confirmBackdrop.addEventListener('click', closeConfirmation);
    els.confirmDoneBtn.addEventListener('click', closeConfirmation);
    els.viewLetterBtn.addEventListener('click', showLetter);
    els.letterBackBtn.addEventListener('click', showConfirmView);
    els.letterPrintBtn.addEventListener('click', printLetter);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.confirmModal.hidden) closeConfirmation();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
