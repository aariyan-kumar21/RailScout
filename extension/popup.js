/**
 * popup.js — RailScout Chrome Extension Popup Script
 *
 * Responsibility:
 * 1. Collect form inputs (trainNumber, boardingStation, destination, date, classCode).
 * 2. Send request to localhost:3000/api/find-confirmed.
 * 3. Render ranked candidate stations with color-coded availability badges.
 * 4. Provide a direct link to open IRCTC in a new tab for manual booking (per RULES.md §1).
 */

'use strict';

const BACKEND_URL = 'http://localhost:3000/api/find-confirmed';
const IRCTC_SEARCH_URL = 'https://www.irctc.co.in/nget/train-search';

// DOM Elements
const searchForm = document.getElementById('searchForm');
const trainNumberInput = document.getElementById('trainNumber');
const boardingStationInput = document.getElementById('boardingStation');
const destinationInput = document.getElementById('destination');
const dateInput = document.getElementById('date');
const classCodeSelect = document.getElementById('classCode');

const submitBtn = document.getElementById('submitBtn');
const btnText = submitBtn.querySelector('.btn-text');
const btnSpinner = submitBtn.querySelector('.btn-spinner');

const errorBanner = document.getElementById('errorBanner');
const errorMessage = document.getElementById('errorMessage');

const resultsSection = document.getElementById('resultsSection');
const trainSummary = document.getElementById('trainSummary');
const resultsCount = document.getElementById('resultsCount');
const resultsList = document.getElementById('resultsList');

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0];
  dateInput.min = today;
  if (!dateInput.value) {
    dateInput.value = today;
  }
});

// ---------------------------------------------------------------------------
// Form Submission
// ---------------------------------------------------------------------------

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const trainNumber = trainNumberInput.value.trim();
  const boardingStation = boardingStationInput.value.trim().toUpperCase();
  const destination = destinationInput.value.trim().toUpperCase();
  const date = dateInput.value;
  const classCode = classCodeSelect.value;

  if (!trainNumber || !boardingStation || !destination || !date || !classCode) {
    showError('Please fill in all required fields.');
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
    const response = await fetch(`${BACKEND_URL}?${params.toString()}`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      const message = data.error?.message || `Error: ${response.statusText || 'Unable to scan availability'}`;
      showError(message);
      return;
    }

    renderResults(data);
  } catch (err) {
    showError(
      'Could not connect to the RailScout backend at http://localhost:3000. Make sure `npm run dev` is running.'
    );
  } finally {
    setLoading(false);
  }
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render results list received from backend
 * @param {Object} data - find-confirmed API success response
 */
function renderResults(data) {
  const { trainNumber, trainName, results = [] } = data;

  trainSummary.textContent = `${trainNumber} — ${trainName}`;
  resultsCount.textContent = `${results.length} candidate stop${results.length === 1 ? '' : 's'}`;

  resultsList.innerHTML = '';

  if (results.length === 0) {
    const emptyNotice = document.createElement('div');
    emptyNotice.className = 'station-card';
    emptyNotice.textContent = 'No candidate stations found.';
    resultsList.appendChild(emptyNotice);
  } else {
    results.forEach((station) => {
      const card = createStationCard(station);
      resultsList.appendChild(card);
    });
  }

  resultsSection.classList.remove('hidden');
}

/**
 * Create a DOM card for a candidate station
 * @param {Object} station
 * @returns {HTMLElement}
 */
function createStationCard(station) {
  const card = document.createElement('div');
  card.className = `station-card ${station.isConfirmed ? 'is-confirmed' : ''}`;

  // Top section: Station info & status badge
  const topRow = document.createElement('div');
  topRow.className = 'station-card-top';

  const infoDiv = document.createElement('div');
  infoDiv.className = 'station-info';

  const codeNameDiv = document.createElement('div');
  codeNameDiv.className = 'station-code-name';

  const codeSpan = document.createElement('span');
  codeSpan.className = 'station-code';
  codeSpan.textContent = station.stationCode;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'station-name';
  nameSpan.textContent = station.stationName;

  codeNameDiv.appendChild(codeSpan);
  codeNameDiv.appendChild(nameSpan);

  const metaDiv = document.createElement('div');
  metaDiv.className = 'station-meta';
  const stopLabel = station.stopsBeforeBoarding === 0
    ? 'Boarding station'
    : `${station.stopsBeforeBoarding} stop${station.stopsBeforeBoarding > 1 ? 's' : ''} before boarding`;
  metaDiv.textContent = `${stopLabel} • ${station.distanceFromOrigin} km from origin`;

  infoDiv.appendChild(codeNameDiv);
  infoDiv.appendChild(metaDiv);

  // Status Badge
  const badge = document.createElement('span');
  badge.className = `status-badge ${getBadgeClass(station)}`;
  badge.textContent = station.availabilityStatus || 'UNKNOWN';

  topRow.appendChild(infoDiv);
  topRow.appendChild(badge);

  // Bottom section: IRCTC manual search link (RULES.md §1)
  const actionsRow = document.createElement('div');
  actionsRow.className = 'card-actions';

  const irctcBtn = document.createElement('button');
  irctcBtn.type = 'button';
  irctcBtn.className = 'irctc-btn';
  irctcBtn.textContent = 'Search on IRCTC ↗';
  irctcBtn.title = 'Open IRCTC in a new tab for manual booking';
  irctcBtn.addEventListener('click', openIrctcTab);

  actionsRow.appendChild(irctcBtn);

  card.appendChild(topRow);
  card.appendChild(actionsRow);

  return card;
}

/**
 * Determine badge CSS class based on availability properties
 * @param {Object} station
 * @returns {string}
 */
function getBadgeClass(station) {
  if (station.isConfirmed) {
    return 'badge-confirmed';
  }
  if (station.availabilityType === 'RAC') {
    return 'badge-rac';
  }
  if (station.availabilityType === 'WAITLIST' || (station.availabilityStatus && station.availabilityStatus.includes('WL'))) {
    return 'badge-waitlist';
  }
  return 'badge-unknown';
}

/**
 * Open IRCTC search page in a new browser tab (RULES.md §1 & §2)
 */
function openIrctcTab() {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url: IRCTC_SEARCH_URL });
  } else {
    window.open(IRCTC_SEARCH_URL, '_blank', 'noopener,noreferrer');
  }
}

// ---------------------------------------------------------------------------
// UI State Helpers
// ---------------------------------------------------------------------------

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  if (isLoading) {
    btnText.textContent = 'Scanning candidate stops...';
    btnSpinner.classList.remove('hidden');
  } else {
    btnText.textContent = 'Find Confirmed Station';
    btnSpinner.classList.add('hidden');
  }
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorBanner.classList.remove('hidden');
}

function hideError() {
  errorBanner.classList.add('hidden');
  errorMessage.textContent = '';
}

function hideResults() {
  resultsSection.classList.add('hidden');
  resultsList.innerHTML = '';
}
