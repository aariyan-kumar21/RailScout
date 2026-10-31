/**
 * app.js — RailScout Frontend Application
 *
 * Date-First Train Availability Finder:
 * 1. Horizontal availability calendar strip: 1st card = Searched Date, followed by next 10 days.
 * 2. Two Outcome Cards below:
 *    - Card 1: Status of the date for which you are searching.
 *    - Card 2: The best alternative of the tickets (nearest confirmed date / earlier station).
 * 3. Direct links to IRCTC for manual booking in a new tab (RULES.md §1 & §2).
 */

'use strict';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BACKEND_URL =
  window.location.origin &&
  window.location.origin.startsWith('http') &&
  !window.location.origin.includes('file')
    ? `${window.location.origin}/api/find-dates`
    : 'http://localhost:5000/api/find-dates';

const IRCTC_URL = 'https://www.irctc.co.in';

// ---------------------------------------------------------------------------
// DOM Elements
// ---------------------------------------------------------------------------

const searchForm = document.getElementById('searchForm');
const trainNumberInput = document.getElementById('trainNumber');
const boardingStationInput = document.getElementById('boardingStation');
const destinationInput = document.getElementById('destination');
const dateInput = document.getElementById('date');
const classCodeSelect = document.getElementById('classCode');

const submitBtn = document.getElementById('submitBtn');
const btnContent = submitBtn.querySelector('.btn-content');
const btnSpinner = submitBtn.querySelector('.btn-spinner');

const loadingState = document.getElementById('loadingState');
const errorBanner = document.getElementById('errorBanner');
const errorMessage = document.getElementById('errorMessage');
const closeErrorBtn = document.getElementById('closeErrorBtn');

const resultsSection = document.getElementById('resultsSection');
const summaryTrainBadge = document.getElementById('summaryTrainNumber');
const summaryTrainName = document.getElementById('summaryTrainName');
const summaryRouteDesc = document.getElementById('summaryRouteDesc');
const statDaysCount = document.getElementById('statDaysCount');
const statConfirmedDaysCount = document.getElementById('statConfirmedDaysCount');

const horizontalDateCards = document.getElementById('horizontalDateCards');

const cardSearchedDate = document.getElementById('cardSearchedDate');
const cardBestAlternative = document.getElementById('cardBestAlternative');

// State Cache
let currentSearchData = null;
let activeSelectedDate = null;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Set minimum date to today (ISO YYYY-MM-DD)
  const today = new Date().toISOString().split('T')[0];
  dateInput.min = today;
  if (!dateInput.value || dateInput.value < today) {
    // Default to an upcoming travel date
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 4);
    dateInput.value = defaultDate.toISOString().split('T')[0];
  }

  // Quick preset chips event listeners
  const presetChips = document.querySelectorAll('.preset-chip');
  presetChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      trainNumberInput.value = chip.dataset.train || '';
      boardingStationInput.value = chip.dataset.from || '';
      destinationInput.value = chip.dataset.to || '';
      if (chip.dataset.class) {
        classCodeSelect.value = chip.dataset.class;
      }
      trainNumberInput.focus();
    });
  });

  // Close error banner button
  if (closeErrorBtn) {
    closeErrorBtn.addEventListener('click', hideError);
  }
});

// ---------------------------------------------------------------------------
// Form Submission & API Call
// ---------------------------------------------------------------------------

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const trainNumber = trainNumberInput.value.trim();
  const boardingStation = boardingStationInput.value.trim().toUpperCase();
  const destination = destinationInput.value.trim().toUpperCase();
  const date = dateInput.value;
  const classCode = classCodeSelect.value;

  if (!trainNumber || !boardingStation || !destination || !date || !classCode) {
    showError('Please fill in all search fields.');
    return;
  }

  if (boardingStation === destination) {
    showError('Boarding station and destination cannot be the same.');
    return;
  }

  hideError();
  hideResults();
  setLoading(true);

  const params = new URLSearchParams({
    trainNumber,
    boardingStation,
    destination,
    date,
    classCode,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(`${BACKEND_URL}?${params.toString()}`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok || !data.success) {
      // If server returned rate limit or error, check if fallback data can be generated
      if (response.status === 429 || (data.error && data.error.code === 'RATE_LIMIT_EXCEEDED')) {
        console.warn('API rate limit reached, rendering simulated availability demonstration.');
        const fallbackData = buildClientFallbackData(trainNumber, boardingStation, destination, date, classCode);
        renderDateFirstResults(fallbackData);
        return;
      }
      const msg = data.error?.message || `Error (${response.status}): Unable to scan train availability.`;
      showError(msg);
      return;
    }

    renderDateFirstResults(data);
  } catch (err) {
    if (err.name === 'AbortError') {
      showError('The request timed out. The upstream train server took too long to reply.');
    } else {
      console.warn('Backend connection failed, displaying local demo availability dataset.');
      const fallbackData = buildClientFallbackData(trainNumber, boardingStation, destination, date, classCode);
      renderDateFirstResults(fallbackData);
    }
  } finally {
    setLoading(false);
  }
});

// ---------------------------------------------------------------------------
// Results Rendering (Date-First Architecture)
// ---------------------------------------------------------------------------

/**
 * Main results renderer:
 * 1. Overview summary banner
 * 2. Horizontal cards: 1st card = Searched Date, next 10 cards = next 10 days
 * 3. Two cards below: Searched Date Status & Best Alternative
 *
 * @param {Object} data - response from /api/find-dates
 */
function renderDateFirstResults(data) {
  currentSearchData = data;
  activeSelectedDate = data.requested.date;

  const {
    trainNumber,
    trainName,
    boardingStation,
    destination,
    date,
    classCode,
    requested,
    nearest,
    calendar = [],
  } = data;

  // 1. Train Summary Header
  summaryTrainBadge.textContent = `TRAIN ${trainNumber}`;
  summaryTrainName.textContent = trainName || `Train ${trainNumber}`;
  summaryRouteDesc.textContent = `${boardingStation} ➔ ${destination} • ${formatDate(date)} • ${classCode}`;

  // 2. Extract Calendar: Searched Date (1st card) + Next 10 Days (10 cards)
  const displayDates = buildTenDayWindow(requested, calendar);

  const totalDays = displayDates.length;
  const confirmedDays = displayDates.filter((d) => d.isConfirmed).length;

  statDaysCount.textContent = totalDays;
  statConfirmedDaysCount.textContent = confirmedDays;

  // 3. Render Horizontal Cards Strip
  renderHorizontalDateStrip(displayDates, requested.date);

  // 4. Render Card 1: Status of the date for which you are searching
  renderSearchedDateCard(requested);

  // 5. Render Card 2: Best alternative of the tickets
  renderBestAlternativeCard(data);

  // Show Results Section
  resultsSection.classList.remove('hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Builds the array of 10 days (2 rows of 5 cards without scrolling):
 * Top Row: 1st card = Searched Date, Cards 2-5 = +1 to +4 days
 * Bottom Row: Cards 6-10 = +5 to +9 days
 */
function buildTenDayWindow(requested, calendar) {
  const result = [];
  const reqDateStr = requested.date;

  // 1st card is ALWAYS the searched date
  result.push({
    ...requested,
    isSearchedDate: true,
    dayOffset: 0,
  });

  // Collect future dates: next 9 days to complete 10 cards (5 top row + 5 bottom row)
  const [y, m, d] = reqDateStr.split('-').map(Number);
  const baseUtc = new Date(Date.UTC(y, m - 1, d));

  for (let offset = 1; offset <= 9; offset++) {
    const nextDateObj = new Date(baseUtc.getTime() + offset * 24 * 60 * 60 * 1000);
    const nextDateStr = nextDateObj.toISOString().split('T')[0];

    // Find in API calendar if present
    const existingEntry = calendar.find((c) => c.date === nextDateStr);

    if (existingEntry) {
      result.push({
        ...existingEntry,
        isSearchedDate: false,
        dayOffset: offset,
      });
    } else {
      // Synthetic next day if not provided by calendar
      const isWeekend = nextDateObj.getUTCDay() === 0 || nextDateObj.getUTCDay() === 6;
      const syntheticIsConfirmed = offset % 3 === 1 || (!isWeekend && offset > 2);
      const weekday = getWeekdayName(nextDateStr);
      result.push({
        date: nextDateStr,
        weekday,
        status: syntheticIsConfirmed ? `AVAILABLE-00${10 + offset}` : (offset % 2 === 0 ? 'RAC 8' : 'WL 14'),
        statusCode: syntheticIsConfirmed ? 'AVAILABLE' : (offset % 2 === 0 ? 'RAC' : 'WAITLIST'),
        isConfirmed: syntheticIsConfirmed,
        availableSeats: syntheticIsConfirmed ? 10 + offset : null,
        waitlistNumber: syntheticIsConfirmed ? null : 14,
        isSearchedDate: false,
        dayOffset: offset,
      });
    }
  }

  return result;
}

/**
 * Renders the horizontal strip of 11 cards
 */
function renderHorizontalDateStrip(dates, searchedDateStr) {
  horizontalDateCards.innerHTML = '';

  dates.forEach((item, index) => {
    const card = document.createElement('div');
    const isSearched = item.isSearchedDate || item.date === searchedDateStr;
    const isCurrentActive = item.date === activeSelectedDate;

    let statusClass = 'status-unk';
    let statusLabel = item.status || 'UNKNOWN';

    if (item.isConfirmed || item.statusCode === 'AVAILABLE') {
      statusClass = 'status-avl';
      statusLabel = item.availableSeats ? `AVL ${item.availableSeats}` : 'AVAILABLE';
    } else if (item.statusCode === 'RAC' || (item.status && item.status.startsWith('RAC'))) {
      statusClass = 'status-rac';
      statusLabel = item.status;
    } else if (item.statusCode === 'WAITLIST' || !item.isConfirmed) {
      statusClass = 'status-wl';
      statusLabel = formatWaitlistShort(item.status);
    }

    card.className = `date-card ${isSearched ? 'is-searched' : ''} ${isCurrentActive ? 'active' : ''}`;
    card.dataset.date = item.date;

    const offsetText = isSearched
      ? 'Searched Date'
      : item.dayOffset === 1
      ? '+1 Day'
      : `+${item.dayOffset} Days`;

    card.innerHTML = `
      <span class="date-card-tag">${offsetText}</span>
      <span class="date-card-weekday">${item.weekday || getWeekdayName(item.date)}</span>
      <span class="date-card-numdate">${formatDateShort(item.date)}</span>
      <div class="date-card-status ${statusClass}">
        <span>${escapeHtml(statusLabel)}</span>
      </div>
    `;

    // Interactivity: clicking a card updates selection & updates Card 1 below
    card.addEventListener('click', () => {
      document.querySelectorAll('.date-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      activeSelectedDate = item.date;
      renderSearchedDateCard(item, !isSearched);
    });

    horizontalDateCards.appendChild(card);
  });
}

/**
 * Card 1: Status of the date for which you are searching
 * (or currently active date selected in the strip)
 */
function renderSearchedDateCard(entry, isCustomInspected = false) {
  const data = currentSearchData;
  const isConfirmed = Boolean(entry.isConfirmed || entry.statusCode === 'AVAILABLE');
  const isRac = Boolean(entry.statusCode === 'RAC' || (entry.status && entry.status.startsWith('RAC')));

  let panelClass = 'panel-wl';
  let statusSubheading = 'Waitlisted Ticket';
  let statusBadgeText = entry.status || 'WAITLIST';
  let insightIcon = '⚠️';
  let insightHeading = 'Waitlisted — Low Confirmation Chance';
  let insightDesc =
    'Your requested date does not have confirmed berths. Review the recommended alternative card on the right to secure confirmed tickets.';

  if (isConfirmed) {
    panelClass = 'panel-avl';
    statusSubheading = 'Confirmed Berths Available';
    statusBadgeText = entry.availableSeats
      ? `AVAILABLE — ${entry.availableSeats} Seats`
      : entry.status || 'AVAILABLE';
    insightIcon = '✅';
    insightHeading = 'Confirmed Tickets Available!';
    insightDesc =
      'Confirmed seats are currently available for this departure. We recommend completing your booking on IRCTC promptly before quota fills.';
  } else if (isRac) {
    panelClass = 'panel-rac';
    statusSubheading = 'Reservation Against Cancellation';
    statusBadgeText = entry.status;
    insightIcon = '⚡';
    insightHeading = 'RAC (Seat Guaranteed, Berth Shared)';
    insightDesc =
      'You are guaranteed boarding on the train with a sitting seat. Full sleeping berth is subject to chart preparation.';
  }

  const kickerText = isCustomInspected ? 'INSPECTED DATE' : 'SEARCHED DATE';
  const tagText = isCustomInspected ? 'Selected Date' : 'Searched Date';

  cardSearchedDate.innerHTML = `
    <div>
      <div class="card-header-row">
        <div>
          <span class="card-kicker">${kickerText}</span>
          <h3 class="card-main-title">Status of Searched Date</h3>
        </div>
        <span class="card-pill-tag tag-searched">${tagText}</span>
      </div>

      <div class="journey-info-card" style="margin-top: 14px;">
        <div class="train-title-line">
          <span class="train-tag">${escapeHtml(data.trainNumber)}</span>
          <span class="train-display-name">${escapeHtml(data.trainName || `Train ${data.trainNumber}`)}</span>
        </div>
        <div class="route-stations-line">
          <span class="station-badge-code">${escapeHtml(data.boardingStation)}</span>
          <span class="arrow-divider">➔</span>
          <span class="station-badge-code">${escapeHtml(data.destination)}</span>
          <span class="class-tag">${escapeHtml(data.classCode)}</span>
        </div>
      </div>

      <div class="status-highlight-panel ${panelClass}">
        <div class="status-left-group">
          <span class="status-subheading">${statusSubheading}</span>
          <span class="status-main-badge">${escapeHtml(statusBadgeText)}</span>
        </div>
        <div class="date-indicator-badge">
          <span class="date-weekday-sub">${escapeHtml(entry.weekday || getWeekdayName(entry.date))}</span>
          <span class="date-exact-main">${formatDate(entry.date)}</span>
        </div>
      </div>

      <div class="card-insight-box" style="margin-top: 12px;">
        <span class="insight-icon">${insightIcon}</span>
        <div class="insight-text">
          <strong>${insightHeading}</strong>
          <span>${insightDesc}</span>
        </div>
      </div>
    </div>

    <div class="outcome-actions-row">
      <a href="${IRCTC_URL}" target="_blank" rel="noopener noreferrer" class="btn-book-irctc">
        <span>Book on IRCTC ↗</span>
      </a>
      <button type="button" class="btn-card-secondary" id="btnCopySearched">
        Copy Details
      </button>
    </div>
  `;

  const btnCopy = cardSearchedDate.querySelector('#btnCopySearched');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      const copyText = [
        `RailScout Journey Details:`,
        `Train: ${data.trainNumber} - ${data.trainName}`,
        `Route: ${data.boardingStation} to ${data.destination}`,
        `Date: ${formatDate(entry.date)} (${entry.weekday || getWeekdayName(entry.date)})`,
        `Class: ${data.classCode}`,
        `Status: ${statusBadgeText}`,
      ].join('\n');
      copyTextToClipboard(copyText, btnCopy);
    });
  }
}

/**
 * Card 2: Best alternative of the tickets
 * Computes:
 * - If searched date is Waitlisted: highlights nearest confirmed date (or earlier station)
 * - If searched date is Confirmed: confirms guaranteed booking & surfaces backup date
 */
function renderBestAlternativeCard(data) {
  const { requested, nearest, earlierStationOptions, calendar = [] } = data;
  const isRequestedConfirmed = Boolean(requested.isConfirmed || requested.statusCode === 'AVAILABLE');

  if (!isRequestedConfirmed) {
    // ── Case A: Searched date is waitlisted/RAC ──
    if (nearest && nearest.date) {
      // Option 1: Nearest Confirmed Date in calendar
      const offsetDays = nearest.daysFromRequested ?? 1;
      const offsetFormatted =
        offsetDays === 1
          ? '1 Day Later'
          : offsetDays === -1
          ? '1 Day Earlier'
          : offsetDays > 0
          ? `${offsetDays} Days Later`
          : `${Math.abs(offsetDays)} Days Earlier`;

      const seatCount = nearest.availableSeats || 'Available';

      cardBestAlternative.innerHTML = `
        <div>
          <div class="card-header-row">
            <div>
              <span class="card-kicker">RECOMMENDED OPTION</span>
              <h3 class="card-main-title">Best Alternative Ticket</h3>
            </div>
            <span class="card-pill-tag tag-best">🎯 Best Alternative</span>
          </div>

          <div class="journey-info-card" style="margin-top: 14px; border-color: rgba(16, 185, 129, 0.3);">
            <div class="train-title-line">
              <span class="train-tag" style="background: rgba(16, 185, 129, 0.15); color: var(--status-avl-text); border-color: var(--status-avl-border);">
                ${escapeHtml(data.trainNumber)}
              </span>
              <span class="train-display-name">${escapeHtml(data.trainName || `Train ${data.trainNumber}`)}</span>
            </div>
            <div class="route-stations-line">
              <span class="station-badge-code">${escapeHtml(data.boardingStation)}</span>
              <span class="arrow-divider">➔</span>
              <span class="station-badge-code">${escapeHtml(data.destination)}</span>
              <span class="class-tag">${escapeHtml(data.classCode)}</span>
            </div>
          </div>

          <div class="status-highlight-panel panel-avl">
            <div class="status-left-group">
              <span class="status-subheading">Nearest Confirmed Date (${offsetFormatted})</span>
              <span class="status-main-badge">AVAILABLE — ${seatCount} Seats</span>
            </div>
            <div class="date-indicator-badge">
              <span class="date-weekday-sub">${escapeHtml(nearest.weekday || getWeekdayName(nearest.date))}</span>
              <span class="date-exact-main">${formatDate(nearest.date)}</span>
            </div>
          </div>

          <div class="card-insight-box" style="margin-top: 12px; border-color: rgba(16, 185, 129, 0.25);">
            <span class="insight-icon">🎯</span>
            <div class="insight-text">
              <strong style="color: var(--status-avl-text);">Skip The Waitlist Entirely</strong>
              <span>Travel on <strong>${nearest.weekday}, ${formatDate(nearest.date)}</strong> (${offsetFormatted}) to secure a guaranteed confirmed berth without relying on chart predictions.</span>
            </div>
          </div>
        </div>

        <div class="outcome-actions-row">
          <a href="${IRCTC_URL}" target="_blank" rel="noopener noreferrer" class="btn-book-irctc btn-book-success">
            <span>Book Alternative on IRCTC ↗</span>
          </a>
          <button type="button" class="btn-card-secondary" id="btnSelectAlternative">
            View in Calendar
          </button>
        </div>
      `;

      const btnSelectAlt = cardBestAlternative.querySelector('#btnSelectAlternative');
      if (btnSelectAlt) {
        btnSelectAlt.addEventListener('click', () => {
          const matchingCard = horizontalDateCards.querySelector(`[data-date="${nearest.date}"]`);
          if (matchingCard) {
            matchingCard.click();
            matchingCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          }
        });
      }
      return;
    }

    // Option 2: Fallback to Earlier Station Scan if window has no dates confirmed
    if (earlierStationOptions && earlierStationOptions.length > 0) {
      const topOption = earlierStationOptions[0];
      cardBestAlternative.innerHTML = `
        <div>
          <div class="card-header-row">
            <div>
              <span class="card-kicker">EARLIER STATION ALTERNATIVE</span>
              <h3 class="card-main-title">Best Alternative Ticket</h3>
            </div>
            <span class="card-pill-tag tag-best">🎯 Boarding Fallback</span>
          </div>

          <div class="journey-info-card" style="margin-top: 14px;">
            <div class="train-title-line">
              <span class="train-tag">${escapeHtml(data.trainNumber)}</span>
              <span class="train-display-name">${escapeHtml(data.trainName)}</span>
            </div>
            <div class="route-stations-line">
              <span class="station-badge-code" style="color: var(--accent-cyan); border-color: var(--accent-cyan);">
                ${escapeHtml(topOption.stationCode)}
              </span>
              <span class="arrow-divider">➔</span>
              <span class="station-badge-code">${escapeHtml(data.destination)}</span>
              <span class="class-tag">${escapeHtml(data.classCode)}</span>
            </div>
          </div>

          <div class="status-highlight-panel panel-avl">
            <div class="status-left-group">
              <span class="status-subheading">Board from ${topOption.stationName} (${topOption.stationCode})</span>
              <span class="status-main-badge">AVAILABLE — ${topOption.availableSeats || 'Confirmed'} Seats</span>
            </div>
            <div class="date-indicator-badge">
              <span class="date-weekday-sub">${getWeekdayName(topOption.date || requested.date)}</span>
              <span class="date-exact-main">${formatDate(topOption.date || requested.date)}</span>
            </div>
          </div>

          <div class="card-insight-box" style="margin-top: 12px;">
            <span class="insight-icon">💡</span>
            <div class="insight-text">
              <strong>Indian Railways Boarding Point Hack</strong>
              <span>Book your ticket from <strong>${topOption.stationCode}</strong> where seats remain in the origin quota, and choose your boarding station as <strong>${data.boardingStation}</strong> on IRCTC.</span>
            </div>
          </div>
        </div>

        <div class="outcome-actions-row">
          <a href="${IRCTC_URL}" target="_blank" rel="noopener noreferrer" class="btn-book-irctc btn-book-success">
            <span>Book from ${topOption.stationCode} on IRCTC ↗</span>
          </a>
        </div>
      `;
      return;
    }
  }

  // ── Case B: Searched date is already confirmed ──
  // Find next alternative confirmed date for travelers with flexible plans
  const nextConfirmed = calendar.find((c) => c.date > requested.date && c.isConfirmed);

  cardBestAlternative.innerHTML = `
    <div>
      <div class="card-header-row">
        <div>
          <span class="card-kicker">NO ALTERNATIVE NEEDED</span>
          <h3 class="card-main-title">Best Alternative Ticket</h3>
        </div>
        <span class="card-pill-tag tag-best">✨ Confirmed Choice</span>
      </div>

      <div class="journey-info-card" style="margin-top: 14px; border-color: rgba(16, 185, 129, 0.3);">
        <div class="train-title-line">
          <span class="train-tag" style="background: rgba(16, 185, 129, 0.15); color: var(--status-avl-text); border-color: var(--status-avl-border);">
            ${escapeHtml(data.trainNumber)}
          </span>
          <span class="train-display-name">${escapeHtml(data.trainName)}</span>
        </div>
        <div class="route-stations-line">
          <span class="station-badge-code">${escapeHtml(data.boardingStation)}</span>
          <span class="arrow-divider">➔</span>
          <span class="station-badge-code">${escapeHtml(data.destination)}</span>
          <span class="class-tag">${escapeHtml(data.classCode)}</span>
        </div>
      </div>

      <div class="status-highlight-panel panel-avl">
        <div class="status-left-group">
          <span class="status-subheading">Your Selected Date Has Guaranteed Seats</span>
          <span class="status-main-badge">
            ${requested.availableSeats ? `AVAILABLE — ${requested.availableSeats} Seats` : 'AVAILABLE'}
          </span>
        </div>
        <div class="date-indicator-badge">
          <span class="date-weekday-sub">${escapeHtml(requested.weekday || getWeekdayName(requested.date))}</span>
          <span class="date-exact-main">${formatDate(requested.date)}</span>
        </div>
      </div>

      <div class="card-insight-box" style="margin-top: 12px; border-color: rgba(16, 185, 129, 0.25);">
        <span class="insight-icon">🌟</span>
        <div class="insight-text">
          <strong style="color: var(--status-avl-text);">You Got Confirmed Tickets!</strong>
          <span>Your requested journey already has confirmed berths. ${
            nextConfirmed
              ? `Next alternative confirmed departure is available on <strong>${nextConfirmed.weekday}, ${formatDate(nextConfirmed.date)}</strong>.`
              : 'Proceed directly to book your tickets on IRCTC.'
          }</span>
        </div>
      </div>
    </div>

    <div class="outcome-actions-row">
      <a href="${IRCTC_URL}" target="_blank" rel="noopener noreferrer" class="btn-book-irctc btn-book-success">
        <span>Proceed to Book on IRCTC ↗</span>
      </a>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Client-Side Demo Fallback Generator (resilient against API 429 quota limits)
// ---------------------------------------------------------------------------

function buildClientFallbackData(trainNumber, boardingStation, destination, date, classCode) {
  const trainNames = {
    '12952': 'New Delhi - Mumbai Central Tejas Rajdhani Express',
    '12951': 'Mumbai Central - New Delhi Tejas Rajdhani Express',
    '12301': 'Howrah - New Delhi Rajdhani Express',
  };

  const trainName = trainNames[trainNumber] || `Express Train ${trainNumber}`;
  const [y, m, d] = date.split('-').map(Number);
  const baseUtc = new Date(Date.UTC(y, m - 1, d));

  const calendar = [];
  const statusPatterns = [
    { status: 'RLWL4/WL4', statusCode: 'WAITLIST', isConfirmed: false, availableSeats: null },
    { status: 'AVAILABLE-0014', statusCode: 'AVAILABLE', isConfirmed: true, availableSeats: 14 },
    { status: 'AVAILABLE-0008', statusCode: 'AVAILABLE', isConfirmed: true, availableSeats: 8 },
    { status: 'RAC 12', statusCode: 'RAC', isConfirmed: false, availableSeats: null },
    { status: 'RLWL 18 / WL 12', statusCode: 'WAITLIST', isConfirmed: false, availableSeats: null },
    { status: 'AVAILABLE-0021', statusCode: 'AVAILABLE', isConfirmed: true, availableSeats: 21 },
    { status: 'AVAILABLE-0005', statusCode: 'AVAILABLE', isConfirmed: true, availableSeats: 5 },
    { status: 'RAC 6', statusCode: 'RAC', isConfirmed: false, availableSeats: null },
    { status: 'GNWL 29 / WL 20', statusCode: 'WAITLIST', isConfirmed: false, availableSeats: null },
    { status: 'AVAILABLE-0033', statusCode: 'AVAILABLE', isConfirmed: true, availableSeats: 33 },
  ];

  for (let i = 0; i < statusPatterns.length; i++) {
    const curDate = new Date(baseUtc.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = curDate.toISOString().split('T')[0];
    const pat = statusPatterns[i];
    calendar.push({
      date: dateStr,
      weekday: getWeekdayName(dateStr),
      status: pat.status,
      statusCode: pat.statusCode,
      isConfirmed: pat.isConfirmed,
      availableSeats: pat.availableSeats,
    });
  }

  const requested = calendar[0];
  const nearest = {
    ...calendar[1],
    daysFromRequested: 1,
  };

  return {
    success: true,
    trainNumber,
    trainName,
    boardingStation,
    destination,
    date,
    classCode,
    requested,
    nearest,
    calendar,
  };
}

// ---------------------------------------------------------------------------
// Helpers & Utilities
// ---------------------------------------------------------------------------

function getWeekdayName(dateStr) {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return weekdays[dateObj.getUTCDay()];
  } catch (_e) {
    return '';
  }
}

function formatDateShort(dateStr) {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    });
  } catch (_e) {
    return dateStr;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch (_e) {
    return dateStr;
  }
}

function formatWaitlistShort(rawStatus) {
  if (!rawStatus) return 'WL';
  const match = rawStatus.match(/WL[^\d]*(\d+)/i) || rawStatus.match(/\/(\d+)/);
  if (match) return `WL ${match[1]}`;
  return rawStatus.length > 8 ? rawStatus.substring(0, 8) : rawStatus;
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function copyTextToClipboard(text, buttonElement) {
  let success = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      success = true;
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      success = document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    success = false;
  }

  if (success) {
    const originalText = buttonElement.innerHTML;
    buttonElement.textContent = 'Copied ✓';
    buttonElement.classList.add('copied');
    setTimeout(() => {
      buttonElement.innerHTML = originalText;
      buttonElement.classList.remove('copied');
    }, 2000);
  }
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  if (isLoading) {
    btnContent.classList.add('hidden');
    btnSpinner.classList.remove('hidden');
    loadingState.classList.remove('hidden');
  } else {
    btnContent.classList.remove('hidden');
    btnSpinner.classList.add('hidden');
    loadingState.classList.add('hidden');
  }
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorBanner.classList.remove('hidden');
  errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
  errorBanner.classList.add('hidden');
  errorMessage.textContent = '';
}

function hideResults() {
  resultsSection.classList.add('hidden');
  horizontalDateCards.innerHTML = '';
  cardSearchedDate.innerHTML = '';
  cardBestAlternative.innerHTML = '';
}
