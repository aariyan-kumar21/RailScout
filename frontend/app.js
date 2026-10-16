/**
 * app.js — RailScout Standalone Frontend Script
 *
 * Responsibilities:
 * 1. Collect form inputs (trainNumber, boardingStation, destination, date, classCode).
 * 2. Send request to the RailScout API (/api/find-confirmed).
 * 3. Render ranked candidate stations with color-coded availability badges.
 * 4. Surface top recommendations and "confirmedAlternatives" when exact date has no confirmed seats.
 * 5. Provide links to open IRCTC for manual booking in a new tab (RULES.md §1 & §2).
 */

'use strict';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BACKEND_URL = (window.location.origin && window.location.origin.startsWith('http') && !window.location.origin.includes('file'))
  ? `${window.location.origin}/api/find-confirmed`
  : 'http://localhost:3000/api/find-confirmed';

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
const statStopsCount = document.getElementById('statStopsCount');
const statConfirmedCount = document.getElementById('statConfirmedCount');

const topRecommendationBox = document.getElementById('topRecommendationBox');
const recDescription = document.getElementById('recDescription');
const recCopyBtn = document.getElementById('recCopyBtn');
const recIrctcBtn = document.getElementById('recIrctcBtn');

const rankedResultsHeading = document.getElementById('rankedResultsHeading');
const resultsList = document.getElementById('resultsList');
const countAllFilter = document.getElementById('countAllFilter');
const countConfirmedFilter = document.getElementById('countConfirmedFilter');
const filterPills = document.querySelectorAll('.filter-pill');

const alternativesSection = document.getElementById('alternativesSection');
const alternativesList = document.getElementById('alternativesList');

// Current search state cache
let currentResults = [];
let currentFilter = 'all';
let currentNearestConfirmed = null;
let currentSearchContext = {
  trainNumber: '',
  trainName: '',
  boardingStation: '',
  destination: '',
  destinationName: '',
  date: '',
  classCode: '',
};

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Set minimum date to today (ISO YYYY-MM-DD)
  const today = new Date().toISOString().split('T')[0];
  dateInput.min = today;
  if (!dateInput.value) {
    dateInput.value = '2026-10-15';
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

  // Filter pills event listeners
  filterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      filterPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter || 'all';
      renderResultsList(currentResults, currentFilter);
    });
  });

  // Top recommendation action buttons
  if (recIrctcBtn) {
    recIrctcBtn.addEventListener('click', openIrctcTab);
  }

  if (recCopyBtn) {
    recCopyBtn.addEventListener('click', () => {
      if (!currentNearestConfirmed) return;
      const text = buildCopyText({
        stationCode: currentNearestConfirmed.stationCode,
        stationName: currentNearestConfirmed.stationName,
        date: currentSearchContext.date,
        scheduledDeparture: currentNearestConfirmed.scheduledDeparture,
      });
      copyTextToClipboard(text, recCopyBtn);
    });
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
    showError("Boarding station and destination cannot be the same.");
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
      const msg = data.error?.message || `Error (${response.status}): Unable to scan train availability.`;
      showError(msg);
      return;
    }

    renderFullResults(data);
  } catch (err) {
    if (err.name === 'AbortError') {
      showError('The request timed out. The upstream train server took too long to reply.');
    } else {
      showError(
        "Cannot reach the RailScout backend. Make sure the server is running on http://localhost:3000 (run 'npm run dev' in /backend)."
      );
    }
  } finally {
    setLoading(false);
  }
});

// ---------------------------------------------------------------------------
// Results Rendering
// ---------------------------------------------------------------------------

/**
 * Render all results components (summary, recommendations, stations list, alternatives)
 * @param {Object} data - find-confirmed API success response
 */
function renderFullResults(data) {
  const {
    trainNumber,
    trainName,
    boardingStation,
    destination,
    date,
    classCode,
    results = [],
    confirmedAlternatives = [],
  } = data;

  currentResults = results;
  currentNearestConfirmed = nearestConfirmed;
  currentSearchContext = {
    trainNumber,
    trainName: trainName || `Train ${trainNumber}`,
    boardingStation,
    destination,
    destinationName: data.destinationName || '',
    date,
    classCode,
  };

  // 1. Train Summary Header
  summaryTrainBadge.textContent = `TRAIN ${trainNumber}`;
  summaryTrainName.textContent = trainName || `Train ${trainNumber}`;
  summaryRouteDesc.textContent = `Checking candidate stops for travel to ${destination} on ${formatDate(date)} (${classCode})`;

  const totalStops = results.length;
  const confirmedStops = results.filter((r) => r.isConfirmed).length;

  statStopsCount.textContent = totalStops;
  statConfirmedCount.textContent = confirmedStops;
  countAllFilter.textContent = totalStops;
  countConfirmedFilter.textContent = confirmedStops;

  // 2. Nearest Confirmed Recommendation Banner
  // Candidates are already sorted nearest-to-boarding first by the backend!
  const nearestConfirmed = results.find((r) => r.isConfirmed);

  if (nearestConfirmed) {
    topRecommendationBox.classList.remove('hidden');
    const stopText = nearestConfirmed.stopsBeforeBoarding === 0
      ? 'right at your chosen boarding station'
      : `${nearestConfirmed.stopsBeforeBoarding} stop${nearestConfirmed.stopsBeforeBoarding > 1 ? 's' : ''} before ${boardingStation}`;
    
    const seatsText = nearestConfirmed.availableSeats 
      ? `(${nearestConfirmed.availableSeats} confirmed seats available)`
      : `(${nearestConfirmed.availabilityStatus})`;

    recDescription.innerHTML = `<strong>${nearestConfirmed.stationName} (${nearestConfirmed.stationCode})</strong> — ${stopText} ${seatsText}. Book from ${nearestConfirmed.stationCode} and change your boarding point on IRCTC.`;
  } else {
    topRecommendationBox.classList.add('hidden');
  }

  // 3. Render Candidate Station List
  renderResultsList(results, currentFilter);

  // 4. Render Confirmed Alternatives if present
  renderAlternatives(confirmedAlternatives, nearestConfirmed);

  // Show the results section
  resultsSection.classList.remove('hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Render the station cards list according to the active filter
 * @param {Array} stations
 * @param {string} filter - 'all' or 'confirmed'
 */
function renderResultsList(stations, filter) {
  resultsList.innerHTML = '';

  const displayList = filter === 'confirmed'
    ? stations.filter((s) => s.isConfirmed)
    : stations;

  if (displayList.length === 0) {
    const emptyNotice = document.createElement('div');
    emptyNotice.className = 'station-card';
    emptyNotice.innerHTML = `
      <div style="text-align: center; padding: 24px 0; color: var(--text-secondary);">
        <p style="font-size: 16px; font-weight: 600; color: var(--text-main); margin-bottom: 6px;">
          ${filter === 'confirmed' ? 'No Confirmed Stops Found' : 'No Candidate Stops'}
        </p>
        <p style="font-size: 13.5px;">
          ${filter === 'confirmed' 
            ? 'All candidate stops for this date and class are currently waitlisted or RAC. Check the alternatives below.' 
            : 'No stations were returned for this route segment.'}
        </p>
      </div>
    `;
    resultsList.appendChild(emptyNotice);
    return;
  }

  displayList.forEach((station) => {
    const card = createStationCard(station);
    resultsList.appendChild(card);
  });
}

/**
 * Build a station card DOM element
 * @param {Object} station
 * @returns {HTMLElement}
 */
function createStationCard(station) {
  const card = document.createElement('div');
  const isBoarding = station.stopsBeforeBoarding === 0;
  
  card.className = `station-card ${station.isConfirmed ? 'is-confirmed' : ''} ${isBoarding ? 'is-boarding' : ''}`;

  // Card Content
  const topRow = document.createElement('div');
  topRow.className = 'station-card-top';

  // Left: Station info & meta
  const infoGroup = document.createElement('div');
  infoGroup.className = 'station-info-group';

  const headline = document.createElement('div');
  headline.className = 'station-headline';

  const codeBadge = document.createElement('span');
  codeBadge.className = 'station-code-badge';
  codeBadge.textContent = station.stationCode;

  const title = document.createElement('span');
  title.className = 'station-title';
  title.textContent = station.stationName;

  headline.appendChild(codeBadge);
  headline.appendChild(title);

  const metaTags = document.createElement('div');
  metaTags.className = 'station-meta-tags';

  const stopTag = document.createElement('span');
  if (isBoarding) {
    stopTag.className = 'stop-tag tag-boarding';
    stopTag.textContent = '📍 Your Boarding Station';
  } else {
    stopTag.className = 'stop-tag tag-prior';
    stopTag.textContent = `← ${station.stopsBeforeBoarding} stop${station.stopsBeforeBoarding > 1 ? 's' : ''} before your boarding point`;
  }

  const distTag = document.createElement('span');
  distTag.className = 'dist-tag';
  distTag.textContent = `• ${station.distanceFromOrigin} km from origin`;

  metaTags.appendChild(stopTag);
  metaTags.appendChild(distTag);

  infoGroup.appendChild(headline);
  infoGroup.appendChild(metaTags);

  // Right: Status Badge, Subtext, IRCTC Action
  const statusAction = document.createElement('div');
  statusAction.className = 'station-status-action';

  const statusBox = document.createElement('div');
  statusBox.className = 'status-box';

  const badge = document.createElement('span');
  badge.className = `status-badge ${getBadgeClass(station)}`;
  badge.textContent = getBadgeText(station);

  const subtext = document.createElement('span');
  subtext.className = `status-subtext ${getSubtextClass(station)}`;
  subtext.textContent = getAvailabilitySubtext(station);

  statusBox.appendChild(badge);
  statusBox.appendChild(subtext);

  const actionGroup = document.createElement('div');
  actionGroup.className = 'card-action-group';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'card-copy-btn';
  copyBtn.textContent = 'Copy details';
  copyBtn.title = `Copy journey details for ${station.stationCode} to clipboard`;
  copyBtn.addEventListener('click', () => {
    const text = buildCopyText({
      stationCode: station.stationCode,
      stationName: station.stationName,
      date: currentSearchContext.date,
      scheduledDeparture: station.scheduledDeparture,
    });
    copyTextToClipboard(text, copyBtn);
  });

  const irctcBtn = document.createElement('button');
  irctcBtn.type = 'button';
  irctcBtn.className = 'card-irctc-btn';
  irctcBtn.innerHTML = `<span>Book on IRCTC</span> <span>↗</span>`;
  irctcBtn.title = `Open IRCTC in a new tab to book from ${station.stationCode}`;
  irctcBtn.addEventListener('click', openIrctcTab);

  actionGroup.appendChild(copyBtn);
  actionGroup.appendChild(irctcBtn);

  statusAction.appendChild(statusBox);
  statusAction.appendChild(actionGroup);

  topRow.appendChild(infoGroup);
  topRow.appendChild(statusAction);

  card.appendChild(topRow);
  return card;
}

/**
 * Render "confirmedAlternatives" when exact date has limited seats
 * @param {Array} alternatives
 * @param {Object|null} nearestConfirmed
 */
function renderAlternatives(alternatives, nearestConfirmed) {
  alternativesList.innerHTML = '';

  if (Array.isArray(alternatives) && alternatives.length > 0) {
    alternativesSection.classList.remove('hidden');

    alternatives.forEach((alt) => {
      const altCard = document.createElement('div');
      altCard.className = 'alt-card';

      altCard.innerHTML = `
        <div class="alt-card-top">
          <span class="alt-date">📅 ${formatDate(alt.date || alt.journeyDate)}</span>
          <span class="status-badge badge-confirmed">AVAILABLE</span>
        </div>
        <div class="alt-card-station">
          <strong>${alt.stationName || alt.stationCode} (${alt.stationCode})</strong>
          <div style="font-size: 12.5px; color: var(--text-secondary); margin-top: 2px;">
            ${alt.availableSeats ? `${alt.availableSeats} seats confirmed` : alt.availabilityStatus || 'Confirmed Berth'}
          </div>
        </div>
      `;

      const actionGroup = document.createElement('div');
      actionGroup.className = 'card-action-group';
      actionGroup.style.marginTop = '6px';
      actionGroup.style.justifyContent = 'center';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'card-copy-btn';
      copyBtn.textContent = 'Copy details';
      copyBtn.title = 'Copy journey details to clipboard';
      copyBtn.addEventListener('click', () => {
        const text = buildCopyText({
          stationCode: alt.stationCode,
          stationName: alt.stationName || alt.stationCode,
          date: alt.date || alt.journeyDate,
          scheduledDeparture: alt.scheduledDeparture,
        });
        copyTextToClipboard(text, copyBtn);
      });

      const irctcBtn = document.createElement('button');
      irctcBtn.type = 'button';
      irctcBtn.className = 'card-irctc-btn';
      irctcBtn.innerHTML = `<span>Book on IRCTC</span> <span>↗</span>`;
      irctcBtn.title = 'Open IRCTC in a new tab to book for this date';
      irctcBtn.addEventListener('click', openIrctcTab);

      actionGroup.appendChild(copyBtn);
      actionGroup.appendChild(irctcBtn);
      altCard.appendChild(actionGroup);

      alternativesList.appendChild(altCard);
    });
  } else {
    // If no explicit alternatives returned by backend, hide the section
    alternativesSection.classList.add('hidden');
  }
}

// ---------------------------------------------------------------------------
// Availability Helper Functions (Kept consistent with SCHEMA.md & popup logic)
// ---------------------------------------------------------------------------

function getBadgeText(station) {
  if (station.isConfirmed) {
    return 'AVAILABLE';
  }
  if (station.availabilityType === 'RAC' || (station.availabilityStatus && station.availabilityStatus.includes('RAC'))) {
    return 'RAC';
  }
  if (station.availabilityType === 'WAITLIST' || (station.availabilityStatus && station.availabilityStatus.includes('WL'))) {
    return 'WAITLIST';
  }
  return station.availabilityType && station.availabilityType !== 'UNKNOWN' ? station.availabilityType : 'UNKNOWN';
}

function getBadgeClass(station) {
  if (station.isConfirmed) return 'badge-confirmed';
  if (station.availabilityType === 'RAC' || (station.availabilityStatus && station.availabilityStatus.includes('RAC'))) return 'badge-rac';
  if (station.availabilityType === 'WAITLIST' || (station.availabilityStatus && station.availabilityStatus.includes('WL'))) return 'badge-waitlist';
  return 'badge-unknown';
}

function getSubtextClass(station) {
  if (station.isConfirmed) return 'subtext-confirmed';
  if (station.availabilityType === 'RAC' || (station.availabilityStatus && station.availabilityStatus.includes('RAC'))) return 'subtext-rac';
  if (station.availabilityType === 'WAITLIST' || (station.availabilityStatus && station.availabilityStatus.includes('WL'))) return 'subtext-waitlist';
  return 'subtext-unknown';
}

function getAvailabilitySubtext(station) {
  if (station.isConfirmed) {
    if (typeof station.availableSeats === 'number') {
      return `${station.availableSeats} ${station.availableSeats === 1 ? 'seat' : 'seats'} available`;
    }
    return 'Seats available';
  }

  const isRac = station.availabilityType === 'RAC' || (station.availabilityStatus && station.availabilityStatus.includes('RAC'));
  if (isRac) {
    if (typeof station.waitlistNumber === 'number') {
      return `RAC #${station.waitlistNumber}`;
    }
    const racMatch = station.availabilityStatus?.match(/\d+/);
    if (racMatch) {
      return `RAC #${parseInt(racMatch[0], 10)}`;
    }
    return 'RAC available';
  }

  const isWaitlist = station.availabilityType === 'WAITLIST' || (station.availabilityStatus && station.availabilityStatus.includes('WL'));
  if (isWaitlist) {
    if (typeof station.waitlistNumber === 'number') {
      if (station.waitlistType) {
        return `Waitlist #${station.waitlistNumber} (${station.waitlistType})`;
      }
      return `Waitlist #${station.waitlistNumber}`;
    }
    return station.availabilityStatus || 'Waitlist';
  }

  return station.availabilityStatus || 'No forecast data';
}

/**
 * Open IRCTC search page in a new browser tab (RULES.md §1 & §2)
 */
function openIrctcTab() {
  window.open(IRCTC_URL, '_blank', 'noopener,noreferrer');
}

/**
 * Format YYYY-MM-DD into "DayOfWeek, D MMM YYYY", e.g. "Sat, 14 Oct 2026"
 */
function formatJourneyDateForCopy(dateStr) {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('-');
    const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const formattedDate = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${weekday}, ${formattedDate}`;
  } catch (_e) {
    return dateStr;
  }
}

/**
 * Build plain text journey details for easy copying to IRCTC
 * Matches:
 *   Train: 12952 (<train name>)
 *   From: BRC Vadodara Jn  To: MMCT Mumbai Central
 *   Date: Sat, 14 Oct 2026   Class: 3A
 *   Departs: 14:35
 */
function buildCopyText({ stationCode, stationName, date, scheduledDeparture }) {
  const trainNum = currentSearchContext.trainNumber || '';
  const trainNm = currentSearchContext.trainName ? ` (${currentSearchContext.trainName})` : '';
  const destCode = currentSearchContext.destination || '';
  const destName = currentSearchContext.destinationName ? ` ${currentSearchContext.destinationName}` : '';
  const dateFormatted = formatJourneyDateForCopy(date || currentSearchContext.date);
  const cls = currentSearchContext.classCode || '';

  const lines = [
    `Train: ${trainNum}${trainNm}`,
    `From: ${stationCode} ${stationName}  To: ${destCode}${destName}`,
    `Date: ${dateFormatted}   Class: ${cls}`,
  ];

  if (scheduledDeparture) {
    lines.push(`Departs: ${scheduledDeparture}`);
  }

  return lines.join('\n');
}

/**
 * Copy text to clipboard with navigator.clipboard and fallback,
 * updating the button label to "Copied ✓" for 2 seconds.
 */
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
      textArea.style.top = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      success = document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    success = false;
  }

  if (success) {
    const originalContent = buttonElement.innerHTML;
    buttonElement.textContent = 'Copied ✓';
    buttonElement.classList.add('copied');

    // Clear any previous timer if button was clicked repeatedly
    if (buttonElement.dataset.copyTimer) {
      clearTimeout(parseInt(buttonElement.dataset.copyTimer, 10));
    }

    const timerId = setTimeout(() => {
      buttonElement.innerHTML = originalContent;
      buttonElement.classList.remove('copied');
      delete buttonElement.dataset.copyTimer;
    }, 2000);

    buttonElement.dataset.copyTimer = timerId.toString();
  } else {
    alert('Unable to copy automatically to clipboard. Please copy details manually:\n\n' + text);
  }
}

/**
 * Format YYYY-MM-DD into readable date (e.g. Sep 05, 2026)
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (_e) {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// UI State Helpers
// ---------------------------------------------------------------------------

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
  resultsList.innerHTML = '';
}
