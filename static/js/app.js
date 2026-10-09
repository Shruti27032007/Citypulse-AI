/**
 * CityPulse AI — Universal Worldwide City Intelligence
 * "Explore Smarter. Travel Better. Stay Aware."
 */

// Global Application State
const state = {
  currentCity: 'Pune', // Default active dynamic city
  currentCityData: null,
  places: [],
  filteredPlaces: [],
  activeCategory: 'all',
  searchQuery: '',
  sortBy: 'rating',
  compareId1: '',
  compareId2: '',
  safetyReports: [],
  safetyFilter: 'all',
  leafletMap: null,
  mapMarkers: [],
  searchDebounceTimer: null
};

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initApp();

  // Close suggestions dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('city-suggestions-dropdown');
    const input = document.getElementById('global-city-search-input');
    if (dropdown && !dropdown.contains(e.target) && e.target !== input) {
      dropdown.style.display = 'none';
    }
  });
});

async function initApp() {
  // Load default city (Pune) with live open data
  await selectCity('Pune', false);
  await loadSafetyReports();
  await loadCityInsights();
  await loadStats();
}

// ==========================================================================
// UNIVERSAL CITY SEARCH & DYNAMIC CITY SELECTION
// ==========================================================================
async function selectCity(cityName, showLoading = true) {
  if (showLoading) showLoadingModal(cityName);

  try {
    let url = `/api/city/details?name=${encodeURIComponent(cityName)}`;
    if (cityName === 'default') {
      url = `/api/city/details?name=Pune`; // Fallback to Pune or default
    }

    const res = await fetch(url);
    const json = await res.json();

    if (json.success && json.data) {
      const city = json.data;
      state.currentCity = city.city_name;
      state.currentCityData = city;
      state.places = city.places || [];
      state.filteredPlaces = [...state.places];

      // Update City Overview Banner
      updateCityBanner(city);

      // Update Quick City Pills active state
      document.querySelectorAll('.quick-city-pill').forEach(pill => {
        const pCity = pill.dataset.city;
        pill.classList.toggle('active', pCity && (pCity.toLowerCase() === city.city_name.toLowerCase() || (cityName === 'default' && pCity === 'default')));
      });

      // Update Places Explorer
      renderPlacesGrid(state.filteredPlaces);
      updatePlacesCount(state.filteredPlaces.length);

      // Center Leaflet Map if loaded
      if (state.leafletMap && city.lat && city.lon) {
        state.leafletMap.flyTo([city.lat, city.lon], 13);
        updateMapMarkers(state.filteredPlaces);
      }

      // Update Compare dropdowns
      initCompareDropdowns();
      if (state.places.length >= 2) {
        state.compareId1 = state.places[0].id;
        state.compareId2 = state.places[1].id;
        runCompare(state.compareId1, state.compareId2);
      }

      // Trigger Smart Match for new city
      triggerSmartMatch();

      // Refresh Safety Reports & Emergency numbers
      loadSafetyReports();

      // Refresh Insights
      loadCityInsights();

      // Update Top Status Bar
      const annText = document.getElementById('top-announcement-text');
      if (annText && city.weather) {
        annText.textContent = `${city.city_name}, ${city.country}: ${city.weather.temperature} ${city.weather.condition} • Humidity ${city.weather.humidity} • Wind ${city.weather.wind} • Transit & Emergency Services Active`;
      }
    } else {
      alert(`City could not be resolved. Please try another destination or check spelling.`);
    }
  } catch (err) {
    console.error('Error selecting city:', err);
  } finally {
    hideLoadingModal();
  }
}

function updateCityBanner(city) {
  setText('active-city-title', city.city_name);
  setText('active-city-country-badge', `${city.country || 'Global Destination'}`);

  const bannerImg = document.getElementById('active-city-img');
  if (bannerImg) {
    if (city.overview && city.overview.image) {
      bannerImg.src = city.overview.image;
    } else if (city.places && city.places[0] && city.places[0].image) {
      bannerImg.src = city.places[0].image;
    } else {
      bannerImg.src = 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=800&q=80';
    }
  }

  // Weather pill
  const weatherPill = document.getElementById('active-city-weather-pill');
  if (weatherPill && city.weather) {
    weatherPill.textContent = `🌤️ ${city.weather.temperature} ${city.weather.condition}`;
  }

  // Emergency pill
  const emergPill = document.getElementById('active-city-emergency-pill');
  if (emergPill && city.emergency) {
    emergPill.textContent = `🚨 Emergency: ${city.emergency.unified || city.emergency.police || '112'}`;
  }

  // Description
  const descEl = document.getElementById('active-city-desc');
  if (descEl && city.overview) {
    descEl.textContent = city.overview.extract || city.overview.description || `Explore attractions, dining, and culture in ${city.city_name}.`;
  }

  // Footer meta
  if (city.lat && city.lon) {
    setText('active-city-coords', `📍 Coords: ${city.lat.toFixed(4)}° N, ${city.lon.toFixed(4)}° E`);
  }
  setText('active-city-places-count', `${city.places ? city.places.length : 0} Cataloged Destinations & Spots`);
  setText('active-city-last-updated', `Live Open Data Sync: ${city.weather ? city.weather.timestamp : 'Just Now'}`);
}

function handleCitySearchInput() {
  const input = document.getElementById('global-city-search-input');
  const dropdown = document.getElementById('city-suggestions-dropdown');
  if (!input || !dropdown) return;

  const query = input.value.trim();
  if (query.length < 2) {
    dropdown.style.display = 'none';
    return;
  }

  clearTimeout(state.searchDebounceTimer);
  state.searchDebounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/city/search?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (json.success && json.results && json.results.length > 0) {
        dropdown.innerHTML = json.results.map(r => `
          <div class="suggestion-item" onclick="onSelectSuggestion('${escapeHtml(r.name)}')">
            <div>
              <div class="suggestion-city-name">📍 ${escapeHtml(r.name)}</div>
              <div class="suggestion-city-sub">${escapeHtml(r.display_name)}</div>
            </div>
            <span class="suggestion-tag">${escapeHtml(r.country || 'Global')}</span>
          </div>
        `).join('');
        dropdown.style.display = 'block';
      } else {
        dropdown.innerHTML = `<div class="suggestion-item" style="cursor: default;"><span class="suggestion-city-sub">No exact city matches found. Press Enter to search anyway.</span></div>`;
        dropdown.style.display = 'block';
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
    }
  }, 250);
}

function handleCitySearchKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    executeCitySearchSubmit();
  }
}

function executeCitySearchSubmit() {
  const input = document.getElementById('global-city-search-input');
  const dropdown = document.getElementById('city-suggestions-dropdown');
  if (dropdown) dropdown.style.display = 'none';

  if (input && input.value.trim()) {
    selectCity(input.value.trim());
  }
}

function onSelectSuggestion(cityName) {
  const dropdown = document.getElementById('city-suggestions-dropdown');
  const input = document.getElementById('global-city-search-input');
  if (dropdown) dropdown.style.display = 'none';
  if (input) input.value = cityName;

  selectCity(cityName);
}

function showLoadingModal(cityName) {
  const modal = document.getElementById('global-loading-modal');
  const title = document.getElementById('loading-modal-title');
  const desc = document.getElementById('loading-modal-desc');

  if (title) title.textContent = `Exploring ${cityName}...`;
  if (desc) desc.textContent = `Synthesizing live geocoding from OpenStreetMap, real-time meteorological data from Open-Meteo, and cultural landmarks from Wikipedia...`;
  if (modal) modal.classList.add('active');
}

function hideLoadingModal() {
  const modal = document.getElementById('global-loading-modal');
  if (modal) modal.classList.remove('active');
}

// City History Modal
function openCityHistoryModal() {
  const city = state.currentCityData;
  if (!city || !city.overview) return;

  setText('history-modal-title', `${city.city_name} — Culture & Heritage`);
  setText('history-modal-subtitle', city.overview.description || `Historical overview and cultural context of ${city.city_name}.`);

  const bodyEl = document.getElementById('history-modal-body');
  if (bodyEl) {
    bodyEl.innerHTML = `
      <p style="margin-bottom: 14px;"><strong>Metropolitan Overview:</strong></p>
      <p style="margin-bottom: 16px;">${escapeHtml(city.overview.extract)}</p>
      <div style="background: var(--bg-page); padding: 14px; border-radius: var(--radius-md); font-size: 0.85rem;">
        <div><strong>Country:</strong> ${escapeHtml(city.country)}</div>
        <div><strong>Coordinates:</strong> ${city.lat}° N, ${city.lon}° E</div>
        <div><strong>Emergency Contact:</strong> Unified ${city.emergency?.unified || '112'} • Police ${city.emergency?.police || '100'}</div>
        <div><strong>Verified Source:</strong> ${escapeHtml(city.overview.data_source || 'Wikipedia')}</div>
      </div>
    `;
  }

  const linkEl = document.getElementById('history-modal-wiki-link');
  if (linkEl && city.overview.page_url) {
    linkEl.href = city.overview.page_url;
  }

  const overlay = document.getElementById('city-history-modal-overlay');
  if (overlay) overlay.classList.add('active');
}

function closeCityHistoryModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const overlay = document.getElementById('city-history-modal-overlay');
  if (overlay) overlay.classList.remove('active');
}

// ==========================================================================
// NAVIGATION & TAB SWITCHING
// ==========================================================================
function switchTab(tabId) {
  // Update nav links
  document.querySelectorAll('.nav-link').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.mobile-nav-link').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(tabId));
  });

  // Update panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${tabId}`);
  });

  // Handle specific tab requirements
  if (tabId === 'explorer' && state.leafletMap) {
    setTimeout(() => {
      state.leafletMap.invalidateSize();
    }, 200);
  }

  // Scroll smoothly to main panel area
  const mainEl = document.querySelector('.main-content');
  if (mainEl && window.scrollY > 400) {
    mainEl.scrollIntoView({ behavior: 'smooth' });
  }
}

function toggleMobileNav() {
  const mobileNav = document.getElementById('mobile-nav');
  if (mobileNav) {
    mobileNav.style.display = mobileNav.style.display === 'flex' ? 'none' : 'flex';
  }
}

// ==========================================================================
// FEATURE A: SMART CITY EXPLORER
// ==========================================================================
function renderPlacesGrid(places) {
  const container = document.getElementById('places-grid');
  const emptyState = document.getElementById('places-empty-state');

  if (!container) return;

  if (places.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  container.innerHTML = places.map(p => `
    <article class="place-card">
      <div class="place-card-image-wrap">
        <img class="place-card-img" src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1477959858617-67f30bc75b82?auto=format&fit=crop&w=800&q=80'">
        <span class="place-category-badge">${escapeHtml(p.category_label || p.category)}</span>
        <span class="place-price-tag">${escapeHtml(p.cost_estimate)}</span>
      </div>
      <div class="place-card-body">
        <div class="place-card-title-row">
          <h3 class="place-card-name">${escapeHtml(p.name)}</h3>
          <span class="place-card-rating">★ ${p.rating}</span>
        </div>
        <p class="place-card-tagline">${escapeHtml(p.tagline || p.description)}</p>

        <div class="place-card-badges-row">
          <span class="mini-badge distance">📍 ${p.distance_km || 1.2} km from center</span>
          <span class="mini-badge safety">🛡️ Safety: ${p.safety_score || 9.2}/10</span>
          <span class="mini-badge">♿ Acc: ${p.accessibility_score || 4}/5</span>
        </div>

        <div class="place-card-footer">
          <button class="btn btn-primary btn-sm" onclick="openPlaceModal('${p.id}')">
            View Details
          </button>
          <button class="btn btn-outline btn-sm" style="color: var(--navy-dark); border-color: var(--border-medium);" onclick="quickCompare('${p.id}')">
            Compare
          </button>
        </div>
      </div>
    </article>
  `).join('');

  // Update map markers if map exists
  updateMapMarkers(places);
}

function updatePlacesCount(count) {
  const el = document.getElementById('results-count-text');
  if (el) {
    el.textContent = `Showing ${count} destination${count === 1 ? '' : 's'} in ${state.currentCity}`;
  }
}

// Category filter
function setCategoryFilter(cat) {
  state.activeCategory = cat;
  document.querySelectorAll('.category-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.category === cat);
  });
  applyFiltersAndSort();
}

// Explorer search
function handleExplorerSearch() {
  const input = document.getElementById('explorer-search-input');
  const clearBtn = document.getElementById('explorer-clear-btn');
  state.searchQuery = input.value.trim().toLowerCase();

  if (clearBtn) {
    clearBtn.style.display = state.searchQuery ? 'block' : 'none';
  }

  applyFiltersAndSort();
}

function clearExplorerSearch() {
  const input = document.getElementById('explorer-search-input');
  if (input) input.value = '';
  state.searchQuery = '';
  const clearBtn = document.getElementById('explorer-clear-btn');
  if (clearBtn) clearBtn.style.display = 'none';
  applyFiltersAndSort();
}

// Sort handler
function handleSortChange() {
  const select = document.getElementById('sort-select');
  if (select) {
    state.sortBy = select.value;
  }
  applyFiltersAndSort();
}

// Reset filters
function resetAllFilters() {
  state.activeCategory = 'all';
  state.searchQuery = '';
  state.sortBy = 'rating';

  const catPill = document.querySelector('.category-pill[data-category="all"]');
  if (catPill) {
    document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
    catPill.classList.add('active');
  }

  const searchInput = document.getElementById('explorer-search-input');
  if (searchInput) searchInput.value = '';

  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) sortSelect.value = 'rating';

  applyFiltersAndSort();
}

function applyFiltersAndSort() {
  let list = [...state.places];

  // 1. Category
  if (state.activeCategory && state.activeCategory !== 'all') {
    list = list.filter(p => p.category.toLowerCase() === state.activeCategory.toLowerCase());
  }

  // 2. Search
  if (state.searchQuery) {
    list = list.filter(p => {
      const text = [
        p.name, p.tagline, p.description, p.location,
        p.category_label, ...(p.interests || []), ...(p.highlights || [])
      ].join(' ').toLowerCase();
      return text.includes(state.searchQuery);
    });
  }

  // 3. Sort
  if (state.sortBy === 'rating') {
    list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (state.sortBy === 'price_asc') {
    list.sort((a, b) => (a.budget_numeric || 1) - (b.budget_numeric || 1));
  } else if (state.sortBy === 'price_desc') {
    list.sort((a, b) => (b.budget_numeric || 1) - (a.budget_numeric || 1));
  } else if (state.sortBy === 'safety') {
    list.sort((a, b) => (b.safety_score || 0) - (a.safety_score || 0));
  } else if (state.sortBy === 'distance') {
    list.sort((a, b) => (a.distance_km || 99) - (b.distance_km || 99));
  } else if (state.sortBy === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  state.filteredPlaces = list;
  renderPlacesGrid(list);
  updatePlacesCount(list.length);
}

// View toggle (Cards vs Map)
function toggleExplorerView(mode) {
  const cardsBtn = document.getElementById('view-cards-btn');
  const mapBtn = document.getElementById('view-map-btn');
  const cardsGrid = document.getElementById('places-grid');
  const mapContainer = document.getElementById('explorer-map-container');

  if (mode === 'map') {
    cardsBtn?.classList.remove('active');
    mapBtn?.classList.add('active');
    if (cardsGrid) cardsGrid.style.display = 'none';
    if (mapContainer) mapContainer.style.display = 'block';

    initLeafletMap();
  } else {
    cardsBtn?.classList.add('active');
    mapBtn?.classList.remove('active');
    if (cardsGrid) cardsGrid.style.display = 'grid';
    if (mapContainer) mapContainer.style.display = 'none';
  }
}

// Leaflet Map Init
function initLeafletMap() {
  const mapDiv = document.getElementById('city-leaflet-map');
  if (!mapDiv || typeof L === 'undefined') return;

  const lat = state.currentCityData?.lat || 18.5204;
  const lon = state.currentCityData?.lon || 73.8567;

  if (state.leafletMap) {
    state.leafletMap.invalidateSize();
    state.leafletMap.setView([lat, lon], 13);
    updateMapMarkers(state.filteredPlaces);
    return;
  }

  state.leafletMap = L.map('city-leaflet-map').setView([lat, lon], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.leafletMap);

  updateMapMarkers(state.filteredPlaces);
}

function updateMapMarkers(places) {
  if (!state.leafletMap || typeof L === 'undefined') return;

  // Clear existing markers
  state.mapMarkers.forEach(m => state.leafletMap.removeLayer(m));
  state.mapMarkers = [];

  places.forEach(p => {
    if (p.coordinates && p.coordinates.length === 2) {
      const marker = L.marker([p.coordinates[0], p.coordinates[1]])
        .addTo(state.leafletMap)
        .bindPopup(`
          <div style="font-family: var(--font-main); min-width: 180px;">
            <strong style="color: #0B192C; font-size: 0.95rem;">${escapeHtml(p.name)}</strong>
            <p style="margin: 4px 0; font-size: 0.8rem; color: #475569;">${escapeHtml(p.category_label)} • ${escapeHtml(p.cost_estimate)}</p>
            <div style="margin-top: 6px;">
              <button onclick="openPlaceModal('${p.id}')" style="background: #00A896; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">View Details</button>
            </div>
          </div>
        `);
      state.mapMarkers.push(marker);
    }
  });
}

// ==========================================================================
// FEATURE B: SMART MATCH ALGORITHM
// ==========================================================================
async function triggerSmartMatch() {
  const interestCheckboxes = document.querySelectorAll('#interests-selector input[type="checkbox"]');
  const interests = [];
  interestCheckboxes.forEach(cb => {
    cb.closest('.interest-tag')?.classList.toggle('active', cb.checked);
    if (cb.checked) {
      interests.push(cb.value);
    }
  });

  const budgetRadio = document.querySelector('input[name="match-budget"]:checked');
  const budget = budgetRadio ? budgetRadio.value : 'free_budget';

  const categorySelect = document.getElementById('match-category-select');
  const category = categorySelect ? categorySelect.value : 'all';

  const distanceSelect = document.getElementById('match-distance-select');
  const maxDistance = distanceSelect ? parseFloat(distanceSelect.value) : 999;

  const accessCheck = document.getElementById('match-accessibility-check');
  const accessibilityPriority = accessCheck ? accessCheck.checked : false;

  const payload = {
    city: state.currentCity,
    interests,
    budget,
    category,
    max_distance: maxDistance,
    accessibility_priority: accessibilityPriority
  };

  try {
    const res = await fetch('/api/smart-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.success) {
      renderSmartMatchResults(json.recommendations, json.city);
    }
  } catch (err) {
    console.error('Error running Smart Match:', err);
  }
}

function renderSmartMatchResults(recommendations, city) {
  const container = document.getElementById('smart-match-cards-list');
  const summaryEl = document.getElementById('match-results-summary');

  if (summaryEl) {
    summaryEl.textContent = `Personalized recommendations dynamically calibrated for ${city || state.currentCity}.`;
  }

  if (!container) return;

  if (!recommendations || recommendations.length === 0) {
    container.innerHTML = `<div class="empty-state-card"><p>No recommendations match this strict profile in ${state.currentCity}. Try selecting more interests.</p></div>`;
    return;
  }

  container.innerHTML = recommendations.map(item => {
    const p = item.place;
    return `
      <div class="match-result-card">
        <div class="match-score-badge-col">
          <div class="match-percentage">${item.match_score}%</div>
          <div class="match-tier-label" style="color: ${item.match_score >= 90 ? 'var(--emerald-success)' : 'var(--teal-primary)'};">${item.match_badge}</div>
        </div>
        <div class="match-result-card-content">
          <div class="match-card-top">
            <div>
              <h4 class="match-card-title">${escapeHtml(p.name)}</h4>
              <span class="badge badge-teal" style="font-size: 0.72rem;">${escapeHtml(p.category_label)} • ${escapeHtml(p.cost_estimate)}</span>
            </div>
            <span class="place-card-rating">★ ${p.rating}</span>
          </div>

          <div class="match-reasons-box">
            <div class="match-reasons-title">Why this matches your profile in ${escapeHtml(state.currentCity)}:</div>
            <ul class="match-reasons-list">
              ${item.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
            </ul>
          </div>

          <div class="place-card-footer" style="padding-top: 10px; margin-top: 6px;">
            <span style="font-size: 0.8rem; color: var(--text-muted);">📍 ${escapeHtml(p.location)} (${p.distance_km || 1.2} km)</span>
            <div style="margin-left: auto; display: flex; gap: 8px;">
              <button class="btn btn-outline btn-sm" style="color: var(--navy-dark); border-color: var(--border-medium);" onclick="quickCompare('${p.id}')">Compare</button>
              <button class="btn btn-primary btn-sm" onclick="openPlaceModal('${p.id}')">View Details</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================================================
// FEATURE C: COMPARE PLACES
// ==========================================================================
function initCompareDropdowns() {
  const s1 = document.getElementById('compare-select-1');
  const s2 = document.getElementById('compare-select-2');
  if (!s1 || !s2) return;

  const placesToUse = state.places && state.places.length >= 2 ? state.places : [];

  const optionsHtml = placesToUse.map(p => `
    <option value="${p.id}">${escapeHtml(p.name)} (${p.category_label || p.category} • ${escapeHtml(p.cost_estimate)})</option>
  `).join('');

  s1.innerHTML = optionsHtml;
  s2.innerHTML = optionsHtml;

  if (placesToUse.length >= 2) {
    s1.value = placesToUse[0].id;
    s2.value = placesToUse[1].id;
    state.compareId1 = s1.value;
    state.compareId2 = s2.value;
  }
}

function handleCompareChange() {
  const s1 = document.getElementById('compare-select-1');
  const s2 = document.getElementById('compare-select-2');
  if (s1 && s2) {
    if (s1.value === s2.value) {
      alert('Please choose two different places to compare.');
      return;
    }
    state.compareId1 = s1.value;
    state.compareId2 = s2.value;
    runCompare(s1.value, s2.value);
  }
}

function setComparePreset(id1, id2) {
  const s1 = document.getElementById('compare-select-1');
  const s2 = document.getElementById('compare-select-2');
  if (s1 && s2) {
    s1.value = id1;
    s2.value = id2;
    state.compareId1 = id1;
    state.compareId2 = id2;
    runCompare(id1, id2);
  }
}

function quickCompare(placeId) {
  state.compareId1 = placeId;
  const alt = state.places.find(p => p.id !== placeId);
  if (alt) state.compareId2 = alt.id;

  const s1 = document.getElementById('compare-select-1');
  const s2 = document.getElementById('compare-select-2');
  if (s1 && s2) {
    s1.value = state.compareId1;
    s2.value = state.compareId2;
  }

  switchTab('compare');
  runCompare(state.compareId1, state.compareId2);
}

async function runCompare(id1, id2) {
  if (!id1 || !id2) return;
  try {
    const res = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ place_id_1: id1, place_id_2: id2, city: state.currentCity })
    });
    const json = await res.json();
    if (json.success) {
      renderCompareResults(json.data);
    }
  } catch (err) {
    console.error('Error comparing places:', err);
  }
}

function renderCompareResults(data) {
  const container = document.getElementById('compare-results-wrapper');
  if (!container) return;

  const p1 = data.place_1;
  const p2 = data.place_2;

  container.innerHTML = `
    <div class="compare-hero-cards-row">
      <div class="compare-mini-card">
        <img class="compare-mini-img" src="${p1.image}" alt="${p1.name}" onerror="this.src='https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=800&q=80'">
        <div class="compare-mini-info">
          <span class="badge badge-teal" style="font-size: 0.72rem; margin-bottom: 6px;">${escapeHtml(p1.category_label || p1.category)}</span>
          <h3 class="compare-mini-title">${escapeHtml(p1.name)}</h3>
          <p class="compare-mini-sub">${escapeHtml(p1.location)} • ${escapeHtml(p1.cost_estimate)}</p>
        </div>
      </div>

      <div class="compare-mini-card">
        <img class="compare-mini-img" src="${p2.image}" alt="${p2.name}" onerror="this.src='https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80'">
        <div class="compare-mini-info">
          <span class="badge badge-teal" style="font-size: 0.72rem; margin-bottom: 6px;">${escapeHtml(p2.category_label || p2.category)}</span>
          <h3 class="compare-mini-title">${escapeHtml(p2.name)}</h3>
          <p class="compare-mini-sub">${escapeHtml(p2.location)} • ${escapeHtml(p2.cost_estimate)}</p>
        </div>
      </div>
    </div>

    <div class="comparison-matrix-card">
      <table class="matrix-table">
        <thead>
          <tr>
            <th>Evaluated Metric</th>
            <th>${escapeHtml(p1.name)}</th>
            <th>${escapeHtml(p2.name)}</th>
          </tr>
        </thead>
        <tbody>
          ${data.metrics.map(m => `
            <tr>
              <td class="matrix-metric-label">
                ${escapeHtml(m.label)}
                <span class="matrix-metric-sub">${escapeHtml(m.note)}</span>
              </td>
              <td class="matrix-value-cell">
                <strong>${escapeHtml(String(m.val1))}</strong>
                ${m.winner === 'place_1' ? '<span class="winner-pill">✓ Advantage</span>' : ''}
              </td>
              <td class="matrix-value-cell">
                <strong>${escapeHtml(String(m.val2))}</strong>
                ${m.winner === 'place_2' ? '<span class="winner-pill">✓ Advantage</span>' : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ==========================================================================
// FEATURE D & F: SAFETY INTELLIGENCE & CITIZEN REPORTING
// ==========================================================================
async function loadSafetyReports() {
  try {
    const res = await fetch(`/api/safety-reports?city=${encodeURIComponent(state.currentCity)}`);
    const json = await res.json();
    if (json.success) {
      state.safetyReports = json.data;
      renderSafetyReports(state.safetyReports);
      updateSafetyCounts(state.safetyReports);

      // Update emergency contacts display if available
      if (json.emergency) {
        const emerg = json.emergency;
        const eText = `Unified ${emerg.unified || '112'} • Police ${emerg.police || '100'} • Ambulance ${emerg.ambulance || '108'}`;
        const subEl = document.querySelector('.safety-disclaimer-banner em');
        if (subEl) {
          subEl.textContent = `Official Emergency Hotline for ${state.currentCity}: ${eText}. Sample reports are clearly labelled.`;
        }
      }
    }
  } catch (err) {
    console.error('Error fetching safety reports:', err);
  }
}

function renderSafetyReports(reports) {
  const container = document.getElementById('safety-reports-list');
  if (!container) return;

  if (reports.length === 0) {
    container.innerHTML = `<div class="empty-state-card"><p>No citizen reports currently filed for ${state.currentCity}. Use the button above to file a ground note!</p></div>`;
    return;
  }

  container.innerHTML = reports.map(r => `
    <article class="safety-report-card">
      <div class="report-card-header">
        <div class="report-category-group">
          <span class="badge ${r.severity === 'Urgent' || r.severity === 'High' ? 'badge-coral' : 'badge-amber'}">
            ${escapeHtml(r.category)}
          </span>
          <span class="report-title-bold">${escapeHtml(r.category_label || r.category)}</span>
        </div>
        <div class="report-status-badge ${r.is_verified ? 'status-verified' : (r.is_sample ? 'status-unverified' : 'status-live')}">
          ${r.is_verified ? '✓ ' + escapeHtml(r.status) : '⏳ ' + escapeHtml(r.status)}
        </div>
      </div>

      <p class="report-desc-text">${escapeHtml(r.description)}</p>

      <div class="report-footer-meta">
        <div class="report-location-pin">
          <span>📍</span>
          <span>${escapeHtml(r.location)} (${escapeHtml(r.city || state.currentCity)})</span>
          <span style="color: var(--text-muted); font-weight: 400; margin-left: 8px;">• ${r.timestamp}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${r.is_sample ? '<span class="demo-tag" style="font-size: 0.68rem;">Sample Seed Data</span>' : '<span class="badge badge-emerald" style="font-size: 0.68rem;">Live Citizen Entry</span>'}
          <button class="btn-upvote" onclick="upvoteReport('${r.id}')" title="Confirm report validity">
            ▲ Confirm (${r.upvotes})
          </button>
        </div>
      </div>
    </article>
  `).join('');
}

function updateSafetyCounts(reports) {
  const verified = reports.filter(r => r.is_verified).length;
  const community = reports.filter(r => !r.is_verified).length;

  const vEl = document.getElementById('verified-count');
  const cEl = document.getElementById('community-count');

  if (vEl) vEl.textContent = `${verified} Verified`;
  if (cEl) cEl.textContent = `${community} Community`;
}

function filterSafetyReports(type) {
  document.querySelectorAll('.safety-pill').forEach(pill => {
    pill.classList.toggle('active', pill.textContent.includes(type) || (type === 'all' && pill.textContent.includes('All')));
  });

  let list = [...state.safetyReports];
  if (type === 'verified') {
    list = list.filter(r => r.is_verified);
  } else if (type === 'unverified') {
    list = list.filter(r => !r.is_verified);
  } else if (type !== 'all') {
    list = list.filter(r => r.category.toLowerCase().includes(type.toLowerCase()));
  }

  renderSafetyReports(list);
}

async function upvoteReport(reportId) {
  try {
    const res = await fetch(`/api/safety-reports/${reportId}/upvote`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      const report = state.safetyReports.find(r => r.id === reportId);
      if (report) {
        report.upvotes = json.upvotes;
        report.status = json.status;
      }
      renderSafetyReports(state.safetyReports);
    }
  } catch (err) {
    console.error('Error upvoting report:', err);
  }
}

// Modal handling
function openReportModal() {
  const overlay = document.getElementById('report-modal-overlay');
  const alertBox = document.getElementById('report-alert-box');
  if (alertBox) alertBox.style.display = 'none';
  if (overlay) overlay.classList.add('active');
}

function closeReportModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const overlay = document.getElementById('report-modal-overlay');
  if (overlay) overlay.classList.remove('active');
}

async function handleReportSubmit(e) {
  e.preventDefault();

  const category = document.getElementById('report-category').value;
  const location = document.getElementById('report-location').value;
  const description = document.getElementById('report-desc').value;
  const severityRadio = document.querySelector('input[name="report-severity"]:checked');
  const severity = severityRadio ? severityRadio.value : 'Moderate';
  const photoUrl = document.getElementById('report-photo').value;

  const alertBox = document.getElementById('report-alert-box');
  const submitBtn = document.getElementById('report-submit-btn');

  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch('/api/safety-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: state.currentCity,
        category,
        location,
        description,
        severity,
        photo_url: photoUrl
      })
    });

    const json = await res.json();

    if (json.success) {
      if (alertBox) {
        alertBox.innerHTML = `
          <div style="background: var(--emerald-light); color: #065F46; padding: 12px; border-radius: 8px; margin-bottom: 12px; font-size: 0.88rem; font-weight: 600;">
            ✓ ${json.message}
          </div>
        `;
        alertBox.style.display = 'block';
      }

      state.safetyReports.unshift(json.data);
      renderSafetyReports(state.safetyReports);
      updateSafetyCounts(state.safetyReports);

      document.getElementById('citizen-report-form').reset();

      setTimeout(() => {
        closeReportModal(null);
        switchTab('safety');
      }, 1200);

    } else {
      if (alertBox) {
        alertBox.innerHTML = `
          <div style="background: var(--coral-light); color: #991B1B; padding: 12px; border-radius: 8px; margin-bottom: 12px; font-size: 0.88rem;">
            ${json.errors ? json.errors.join('<br>') : (json.error || 'Submission failed')}
          </div>
        `;
        alertBox.style.display = 'block';
      }
    }
  } catch (err) {
    console.error('Error submitting report:', err);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ==========================================================================
// FEATURE E: SMART CITY INSIGHTS
// ==========================================================================
async function loadCityInsights() {
  try {
    const res = await fetch(`/api/city-insights?city=${encodeURIComponent(state.currentCity)}`);
    const json = await res.json();
    if (json.success) {
      const data = json.data;
      const w = data.weather;
      if (w) {
        setText('weather-temp', w.temperature);
        setText('weather-cond', w.condition);
        setText('weather-humidity', w.humidity);
        setText('weather-wind', w.wind);
        setText('weather-uv', w.uv_index || 'Moderate (3)');
        setText('weather-alert', w.alert || 'Optimal conditions for exploring.');
      }

      const t = data.traffic_summary;
      if (t) {
        setText('traffic-status-badge', t.overall_status || 'Normal Flow');
        const zonesList = document.getElementById('zone-traffic-list');
        if (zonesList && t.zones) {
          zonesList.innerHTML = t.zones.map(z => `
            <div class="zone-row">
              <span class="zone-name">${escapeHtml(z.name)}</span>
              <span class="zone-badge ${z.color}">${escapeHtml(z.status)} ${z.delay_min > 0 ? `(+${z.delay_min}m)` : ''}</span>
            </div>
          `).join('');
        }
      }

      const syncEl = document.getElementById('telemetry-sync-time');
      if (syncEl && data.live_summary) {
        syncEl.textContent = `Telemetry Synced: ${data.live_summary.last_telemetry_sync}`;
      }
    }
  } catch (err) {
    console.error('Error loading insights:', err);
  }
}

// ==========================================================================
// STATS / HERO
// ==========================================================================
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const json = await res.json();
    if (json.success) {
      setText('stat-places', `${json.destinations_count}+`);
      setText('stat-reports', `${json.reports_count} Reports`);
    }
  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

// ==========================================================================
// PLACE DETAILS MODAL
// ==========================================================================
async function openPlaceModal(placeId) {
  try {
    const res = await fetch(`/api/places/${placeId}`);
    const json = await res.json();
    if (!json.success) return;

    const p = json.data;
    const content = document.getElementById('place-modal-content');
    if (!content) return;

    content.innerHTML = `
      <img class="place-modal-hero-img" src="${p.image}" alt="${p.name}" onerror="this.src='https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=800&q=80'">
      <div class="place-modal-body">
        <span class="badge badge-teal" style="margin-bottom: 8px;">${escapeHtml(p.category_label || p.category)}</span>
        <h2 class="modal-place-title">${escapeHtml(p.name)}</h2>
        <p class="modal-place-tagline">${escapeHtml(p.tagline || p.description)}</p>

        <div class="modal-stats-strip">
          <div class="modal-stat-box">
            <span class="modal-stat-label">Rating & Reviews</span>
            <span class="modal-stat-value">★ ${p.rating} (${p.reviews_count ? p.reviews_count.toLocaleString() : '1,200'})</span>
          </div>
          <div class="modal-stat-box">
            <span class="modal-stat-label">Estimated Cost</span>
            <span class="modal-stat-value">${escapeHtml(p.cost_estimate)}</span>
          </div>
          <div class="modal-stat-box">
            <span class="modal-stat-label">Safety Score</span>
            <span class="modal-stat-value text-emerald">🛡️ ${p.safety_score || 9.2} / 10</span>
          </div>
        </div>

        <div class="modal-section-block">
          <h4 class="modal-section-title">About this Destination</h4>
          <p style="font-size: 0.9rem; line-height: 1.6; color: var(--text-secondary);">${escapeHtml(p.description)}</p>
        </div>

        <div class="modal-section-block">
          <h4 class="modal-section-title">Highlights & Key Amenities</h4>
          <div class="modal-highlights-pills">
            ${(p.highlights || ['Scenic Views', 'Cultural Heritage', 'Walking Tours']).map(h => `<span class="modal-pill">✓ ${escapeHtml(h)}</span>`).join('')}
          </div>
        </div>

        <div class="modal-section-block" style="background: var(--bg-page); padding: 14px; border-radius: var(--radius-md);">
          <div style="font-size: 0.85rem; margin-bottom: 6px;">
            <strong>Opening Hours:</strong> ${escapeHtml(p.opening_hours || 'Standard Visitor Hours')}
          </div>
          <div style="font-size: 0.85rem; margin-bottom: 6px;">
            <strong>Best Time to Visit:</strong> ${escapeHtml(p.best_time_to_visit || 'Morning or Golden Hour')}
          </div>
          <div style="font-size: 0.85rem; margin-bottom: 6px;">
            <strong>Transit / Metro Access:</strong> 🚇 ${escapeHtml(p.metro_station || 'Nearby city transit')}
          </div>
          <div style="font-size: 0.85rem; margin-bottom: 6px;">
            <strong>Accessibility Specifications:</strong> ♿ ${escapeHtml(p.accessibility || 'Ground level entrance')}
          </div>
          <div style="font-size: 0.85rem;">
            <strong>Safety & Foot Patrol Advisory:</strong> 🛡️ ${escapeHtml(p.safety_advisory || 'Monitored pedestrian area')}
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button class="btn btn-outline" style="color: var(--navy-dark); border-color: var(--border-medium);" onclick="closePlaceModal(null)">Close</button>
          <button class="btn btn-primary" onclick="quickCompare('${p.id}'); closePlaceModal(null);">Compare this Place</button>
        </div>
      </div>
    `;

    const overlay = document.getElementById('place-modal-overlay');
    if (overlay) overlay.classList.add('active');
  } catch (err) {
    console.error('Error opening place details:', err);
  }
}

function closePlaceModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const overlay = document.getElementById('place-modal-overlay');
  if (overlay) overlay.classList.remove('active');
}

// ==========================================================================
// UTILITIES
// ==========================================================================
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
