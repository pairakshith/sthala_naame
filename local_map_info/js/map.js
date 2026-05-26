// CONFIGURATION TARGET LINKS
const MASTER_DATA_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSz1ORCSTudVSqiGX5WQ5pBJTEtsH_jNXR7hCqDVrPCXTRilObPiDJxZoe0bFmG5kUj06UjjATTVT7b/pub?gid=957411319&single=true&output=csv";
const SUBMISSIONS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSz1ORCSTudVSqiGX5WQ5pBJTEtsH_jNXR7hCqDVrPCXTRilObPiDJxZoe0bFmG5kUj06UjjATTVT7b/pub?gid=1781653464&single=true&output=csv";
const GOOGLE_FORM_URL = "https://forms.gle/syRfc1LMquVyBD7c8";


// =========================================================================
// CORE APP INITIALIZATION
// =========================================================================
const styles = {
    road: {
        "version": 8,
        "sources": {
            "osm-tiles": { "type": "raster", "tiles": ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"], "tileSize": 256, "attribution": "© OSM" }
        },
        "layers": [{ "id": "osm-layer", "type": "raster", "source": "osm-tiles" }]
    },
    satellite: {
        "version": 8,
        "sources": {
            "satellite-tiles": { "type": "raster", "tiles": ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], "tileSize": 256, "attribution": "© Esri" }
        },
        "layers": [{ "id": "satellite-layer", "type": "raster", "source": "satellite-tiles" }]
    }
};

// Start MapLibre Engine (Remember: MapLibre uses [Longitude, Latitude])
const map = new maplibregl.Map({
    container: 'map',
    style: styles.road,
    center: [75.3300, 13.2140], // Centered around Kalasa region [Lng, Lat]
    zoom: 11
});

map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

const listContainer = document.getElementById('list-container');
let markersArray = []; 
let activeItem = null;
let activePopup = null;
let currentView = 'live';

// =========================================================================
// EVENT LISTENERS (CLEAN IDE SEPARATION)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('openFormBtn').addEventListener('click', () => {
        window.open(GOOGLE_FORM_URL, '_blank');
    });

    document.getElementById('style-road').addEventListener('click', () => changeMapStyle('road'));
    document.getElementById('style-sat').addEventListener('click', () => changeMapStyle('satellite'));

    document.getElementById('btn-live').addEventListener('click', () => switchView('live'));
    document.getElementById('btn-pending').addEventListener('click', () => switchView('pending'));
    
    checkAdminAccess();
});

// =========================================================================
// ENGINE CONTROLLERS
// =========================================================================
function changeMapStyle(styleKey) {
    document.getElementById('style-road').classList.toggle('active', styleKey === 'road');
    document.getElementById('style-sat').classList.toggle('active', styleKey === 'satellite');
    map.setStyle(styles[styleKey]);
    
    map.once('style.load', () => {
        const targetUrl = (currentView === 'live') ? MASTER_DATA_URL : SUBMISSIONS_URL;
        loadMapData(targetUrl, currentView === 'pending');
    });
}

function checkAdminAccess() {
    const urlParams = new URLSearchParams(window.location.search);
    const adminToken = urlParams.get('admin');
    const SECRET_PASSWORD = 'kalasa75'; // Your private passcode
    const toggleContainer = document.querySelector('.view-toggle-container');

    if (toggleContainer) {
        if (adminToken === SECRET_PASSWORD) {
            toggleContainer.style.display = 'flex';
        } else {
            toggleContainer.style.display = 'none';
        }
    }
}

// Wait for map canvas to prepare before streaming data rows
map.on('load', () => {
    loadMapData(MASTER_DATA_URL, false);
});

function switchView(viewTarget) {
    if (currentView === viewTarget) return;
    currentView = viewTarget;
    
    listContainer.innerHTML = "";
    activeItem = null;
    if (activePopup) { activePopup.remove(); activePopup = null; }

    const headerBg = document.getElementById('header-bg');
    const headerTitle = document.getElementById('header-title');
    
    document.getElementById('btn-live').classList.toggle('active', viewTarget === 'live');
    document.getElementById('btn-pending').classList.toggle('active', viewTarget === 'pending');

    if (viewTarget === 'live') {
        headerBg.style.backgroundColor = "var(--primary-color)";
        headerTitle.innerText = "ಸ್ಥಳಗಳ ವಿವರ: ಪ್ರಕಟಿತ ನಕ್ಷೆ";
        loadMapData(MASTER_DATA_URL, false);
    } else {
        headerBg.style.backgroundColor = "var(--pending-color)";
        headerTitle.innerText = "ಪರಿಶೀಲನೆಯಲ್ಲಿರುವ ಸ್ಥಳಗಳು";
        loadMapData(SUBMISSIONS_URL, true);
    }
}

// =========================================================================
// DATA PARSER ENGINE
// =========================================================================
function loadMapData(targetUrl, isPendingView) {
    // Clear out old markers safely
    markersArray.forEach(marker => marker.remove());
    markersArray = [];

    Papa.parse(targetUrl, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            let hasData = false;
            
            results.data.forEach((row) => {
                const normalizedRow = {};
                Object.keys(row).forEach(key => { normalizedRow[key.toLowerCase().trim()] = row[key]; });

                const rawName = normalizedRow['raw'] || '';
                const filteredName = normalizedRow['filtered'] || '';
                const locationType = normalizedRow['type'] || '';
                const coordinateString = normalizedRow['location'] || '';
                const status = normalizedRow['status'] || 'Pending';

                if (isPendingView && status === "Approved") return;

                const displayName = filteredName || rawName || 'ಹೆಸರಿಲ್ಲದ ಸ್ಥಳ';
                let lat = NaN, lng = NaN;

                if (coordinateString && coordinateString.toString().includes(',')) {
                    const parts = coordinateString.toString().split(',');
                    lat = parseFloat(parts[0].trim());
                    lng = parseFloat(parts[1].trim());
                }

                // Verify structural validity before rendering
                if (!isNaN(lat) && !isNaN(lng)) {
                    hasData = true;

                    let popupContent = `
                        <div class="popup-card">
                            <h3>${displayName} ${isPendingView ? '(⏳ Pending)' : ''}</h3>
                            <table class="popup-table">
                                <tr><td class="label">ಮೂಲ ಹೆಸರು:</td><td>${rawName}</td></tr>
                                <tr><td class="label">ಪ್ರಕಾರ:</td><td>${locationType}</td></tr>
                            </table>
                        </div>`;

                    // Create popup box but don't add to map yet
                    const popup = new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(popupContent);
                    
                    // Create visual pin marker (Note the strict [lng, lat] requirement here)
                    const marker = new maplibregl.Marker({ color: isPendingView ? '#e67e22' : '#1b4332' })
                        .setLngLat([lng, lat])
                        .setPopup(popup)
                        .addTo(map);

                    markersArray.push(marker);

                    // Create UI list item sidebar card
                    const item = document.createElement('div');
                    item.className = 'sidebar-item';
                    
                    let badgeHTML = '';
                    if (isPendingView) {
                        const isDup = status.toLowerCase().includes('duplicate');
                        badgeHTML = `<span class="status-badge ${isDup ? 'badge-duplicate' : 'badge-pending'}">${isDup ? '⚠️ Duplicate' : '⏳ Pending Approval'}</span>`;
                    }

                    item.innerHTML = `
                        <div class="location-title">${displayName}</div>
                        <div class="location-details">
                            ${locationType ? `<div><strong>ಪ್ರಕಾರ:</strong> ${locationType}</div>` : ''}
                            <div class="coordinate-pill">📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
                            ${badgeHTML}
                        </div>`;

                    // Interaction 1: Hover over card to show popup on map
                    item.addEventListener('mouseenter', () => {
                        if (activePopup !== popup) {
                            map.panTo([lng, lat]);
                            popup.setLngLat([lng, lat]).addTo(map);
                        }
                    });
                    
                    // Interaction 2: Move mouse away to hide preview popup
                    item.addEventListener('mouseleave', () => {
                        if (activePopup !== popup) popup.remove();
                    });

                    // Interaction 3: Click card to lock view and fly in smoothly
                    item.addEventListener('click', () => {
                        if (activeItem) activeItem.classList.remove('active');
                        item.classList.add('active'); 
                        activeItem = item; 
                        activePopup = popup;

                        map.flyTo({ center: [lng, lat], zoom: 14, speed: 1.2, essential: true });
                        popup.setLngLat([lng, lat]).addTo(map);

                        if (window.innerWidth <= 768) {
                            document.getElementById('map').scrollIntoView({ behavior: 'smooth' });
                        }
                    });

                    listContainer.appendChild(item);
                }
            });

            if(!hasData) {
                listContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.95em;">ಯಾವುದೇ ಸ್ಥಳಗಳು ಪಟ್ಟಿಯಲ್ಲಿಲ್ಲ.</div>`;
            }
        }
    });
}