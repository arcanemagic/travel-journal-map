// Initialize map and variables
let map;
let selectedLocations = [];
let path = null;
let markers = [];
let currentTrip = null;
let editMode = false;
let labelsLayer; // Declare labelsLayer variable
let terrainLayer; // Declare terrainLayer variable
let currentLocationIndex = 0; // Declare currentLocationIndex variable

// Track if map is currently animating and any pending view changes
let isMapAnimating = false;
let pendingViewTimeout = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing application...');
    
    // Initialize map
    initializeMap();
    
    // Set up search functionality
    await setupSearchInput();
    
    // Load existing trips
    await loadTrips();
    
    // Set up event listeners
    setupEventListeners();
    
    // Hide new trip form initially
    const newTripForm = document.getElementById('newTripForm');
    if (newTripForm) {
        newTripForm.style.display = 'none';
    }
    
    // Setup drag and drop
    setupDragAndDrop();
    
    // Add back button handler for location view
    const backButton = document.getElementById('backToTrip');
    if (backButton) {
        backButton.addEventListener('click', handleBackToTrip);
    }
});

function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Trip edit form buttons
    const editForm = document.getElementById('tripEditMode');
    if (editForm) {
        const cancelButton = editForm.querySelector('.btn-outline-secondary');
        if (cancelButton) cancelButton.addEventListener('click', cancelEdit);
    }
    
    // Hide new trip form initially
    const showNewTripBtn = document.getElementById('showNewTripForm');
    if (showNewTripBtn) showNewTripBtn.addEventListener('click', showNewTripForm);
    const editTripBtn = document.getElementById('editTrip');
    if (editTripBtn) editTripBtn.addEventListener('click', startEditTrip);
    const updateTripBtn = document.getElementById('updateTrip');
    if (updateTripBtn) updateTripBtn.addEventListener('click', updateTrip);
    const cancelEditBtn = document.getElementById('cancelEdit');
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEdit);
    const closeTripBtn = document.getElementById('closeTrip');
    if (closeTripBtn) closeTripBtn.addEventListener('click', closeTrip);
    console.log('App initialization complete');
}

function initializeMap() {
    console.log('Initializing map...');
    map = L.map('map', {
        zoomControl: false,
        attributionControl: true,
        minZoom: 2,
        maxZoom: 19,
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true,
        transform3DLimit: 10
    }).setView([30, -50], 3);

    // Add clean base layer without labels
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(map);

    // Add terrain visualization using CARTO's hillshade
    terrainLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        opacity: 0.3  // Subtle terrain and features
    }).addTo(map);

    // Add crisp labels on top
    labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors | &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a> | <a href="https://nominatim.org/" target="_blank">Nominatim</a> | <a href="https://fontawesome.com/license" target="_blank">Font Awesome</a> | Created by <a href="https://dhruv.tech" target="_blank">Dhruv Jain</a> with Cascade'
    }).addTo(map);

    // Add zoom control to bottom right
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);
}

function createPulsingMarker(latlng, isHighlighted = false) {
    const pulsingIcon = L.divIcon({
        className: `custom-marker ${isHighlighted ? 'highlighted' : ''}`,
        html: `
            <div class="marker-pin">
                <div class="pin-head"></div>
            </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 30]
    });

    return L.marker(latlng, { icon: pulsingIcon });
}

function highlightMarker(marker) {
    const icon = marker.getIcon();
    const newIcon = L.divIcon({
        ...icon.options,
        className: 'custom-marker highlighted'
    });
    marker.setIcon(newIcon);
}

function unhighlightMarker(marker) {
    const icon = marker.getIcon();
    const newIcon = L.divIcon({
        ...icon.options,
        className: 'custom-marker'
    });
    marker.setIcon(newIcon);
}

function clearMap() {
    // Clear existing markers
    markers.forEach(marker => {
        if (marker) {
            if (marker.remove) {
                marker.remove();  // Regular marker
            } else if (marker.original && marker.highlighted) {
                // Handle highlighted markers
                marker.original.remove();
                marker.highlighted.remove();
            }
        }
    });
    markers = [];

    // Clear existing path
    if (path) {
        if (path.remove) {
            path.remove();  // Single path
        } else if (path.getLayers) {
            path.getLayers().forEach(layer => {
                if (layer && layer.remove) {
                    layer.remove();
                }
            });  // Feature group
        }
        path = null;
    }
}

function displayLocationsOnMap(locations) {
    clearMap();
    selectedLocations = locations.map(loc => {
        // Handle both lat/lon and latitude/longitude formats
        const lat = parseFloat(loc.lat || loc.latitude);
        const lon = parseFloat(loc.lon || loc.longitude);
        
        // Skip invalid coordinates
        if (isNaN(lat) || isNaN(lon)) {
            console.warn('Invalid coordinates for location:', loc);
            return null;
        }
        
        return {
            name: loc.name,
            display_name: loc.display_name,
            latitude: lat,
            longitude: lon
        };
    }).filter(loc => loc !== null); // Filter out invalid locations
    
    updateMap();
}

function updateMap() {
    console.log('Updating map...');
    // Clear existing markers and path
    clearMap();

    if (selectedLocations.length > 0) {
        // Add markers for each location
        selectedLocations.forEach((location, index) => {
            const lat = parseFloat(location.latitude);
            const lon = parseFloat(location.longitude);
            
            if (isNaN(lat) || isNaN(lon)) {
                console.warn('Invalid coordinates for location:', location);
                return;
            }

            const latlng = [lat, lon];
            const marker = createPulsingMarker(latlng).addTo(map);
            markers.push(marker);

            // Update marker tooltip options
            const tooltipOptions = {
                permanent: false,
                direction: 'top',
                className: 'leaflet-tooltip',
                offset: [0, -8],
                opacity: 0.95
            };

            // Add tooltip that shows on hover
            if (location.name) {
                marker.bindTooltip(location.name, tooltipOptions);
            }
        });

        // Create an animated path between the markers if there are at least 2 locations
        if (selectedLocations.length >= 2) {
            const pathCoordinates = selectedLocations.map(loc => [
                parseFloat(loc.latitude),
                parseFloat(loc.longitude)
            ]).filter(coords => !isNaN(coords[0]) && !isNaN(coords[1]));

            if (pathCoordinates.length >= 2) {
                path = animatePathWithPulses(pathCoordinates);
                if (path) path.addTo(map);
            }
        }

        // Fit the map bounds to show all markers with padding for the text pane
        if (markers.length > 0) {
            const group = new L.featureGroup(markers);
            const bounds = group.getBounds();
            
            // Add padding to the left for the panel and some padding all around
            map.fitBounds(bounds, {
                paddingTopLeft: [400, 24],
                paddingBottomRight: [24, 24],
                maxZoom: 12, // Limit maximum zoom for better visibility
                animate: true,
                duration: 1.0
            });
        }
    }
}

function addLocation(location) {
    console.log('Adding location with display_name:', location.display_name);
    try {
        // Validate coordinates
        const lat = parseFloat(location.lat || location.latitude);
        const lon = parseFloat(location.lon || location.longitude);
        
        if (isNaN(lat) || isNaN(lon)) {
            throw new Error('Invalid coordinates provided');
        }
        
        // Add to selected locations with consistent property names
        selectedLocations.push({
            name: location.name,
            display_name: location.display_name,
            latitude: lat,
            longitude: lon
        });
        console.log('Location added to selectedLocations:', selectedLocations[selectedLocations.length - 1]);
        
        // Update both lists and map
        updateLocationsList();
        updateNewTripLocations();
        updateMap();
    } catch (error) {
        console.error('Error adding location:', error);
        alert('Failed to add location: ' + error.message);
    }
}

function updateLocationsList() {
    const editLocations = document.getElementById('editLocations');
    const newLocations = document.getElementById('newLocations');
    const activeList = editLocations || newLocations;

    if (!activeList) return;

    activeList.innerHTML = '';
    selectedLocations.forEach((location, index) => {
        const li = document.createElement('li');
        li.className = 'location-item';
        li.innerHTML = `
            <div class="drag-handle" role="button" aria-label="Drag to reorder"></div>
            <div class="location-info">
                <div class="location-name">${location.name}</div>
                <div class="location-address">${location.display_name || ''}</div>
            </div>
            <button class="btn-icon delete-btn" onclick="removeLocation(${index})" aria-label="Remove location">
                <i class="delete-icon"></i>
            </button>
        `;
        activeList.appendChild(li);
    });

    // Update map with current locations
    updateMap();
}

function removeLocation(index) {
    // Allow removal in both edit mode and new trip mode
    selectedLocations.splice(index, 1);
    if (document.getElementById('newTripForm').style.display === 'block') {
        updateNewTripLocations();
    } else {
        updateLocationsList();
    }
    updateMap();
}

function setupSortableLocations() {
    const newTripLocations = document.getElementById('selectedLocations');
    const editLocations = document.getElementById('editLocations');
    
    if (newTripLocations) {
        new Sortable(newTripLocations, {
            animation: 150,
            disabled: !!currentTrip && !editMode,
            onEnd: function() {
                updateLocationsOrder('selectedLocations');
            }
        });
    }
    
    if (editLocations) {
        new Sortable(editLocations, {
            animation: 150,
            onEnd: function() {
                updateLocationsOrder('editLocations');
            }
        });
    }
}

function setupDragAndDrop() {
    const lists = ['newLocations', 'editLocations'];
    
    lists.forEach(listId => {
        const list = document.getElementById(listId);
        if (!list) return;
        
        // Remove any existing sortable instance
        const oldInstance = Sortable.get(list);
        if (oldInstance) {
            oldInstance.destroy();
        }
        
        new Sortable(list, {
            animation: 150,
            handle: '.drag-handle',
            draggable: '.location-item',
            onEnd: function(evt) {
                // Update the selectedLocations array to match the new order
                const items = evt.to.getElementsByClassName('location-item');
                const newOrder = [];
                
                Array.from(items).forEach(item => {
                    const locationName = item.querySelector('.location-name').textContent;
                    const location = selectedLocations.find(loc => loc.name === locationName);
                    if (location) newOrder.push(location);
                });
                
                selectedLocations = newOrder;
                updateMap();
            }
        });
    });
}

function updateLocationsOrder(listId) {
    const items = document.querySelectorAll(`#${listId} .location-item`);
    const newLocations = [];
    items.forEach(item => {
        const locationName = item.querySelector('span').textContent;
        const location = selectedLocations.find(loc => loc.name === locationName);
        if (location) {
            newLocations.push(location);
        }
    });
    selectedLocations = newLocations;
    updateMap();
}

function setupTripForm() {
    const saveButton = document.getElementById('saveTrip');
    saveButton.addEventListener('click', async function() {
        const title = document.getElementById('tripTitle').value;
        const description = document.getElementById('tripDescription').value;

        if (!title) {
            alert('Please enter a trip title');
            return;
        }

        if (selectedLocations.length === 0) {
            alert('Please add at least one location to your trip');
            return;
        }

        const tripData = {
            title,
            description,
            locations: selectedLocations.map((loc, index) => ({
                name: loc.name,
                latitude: loc.latitude,
                longitude: loc.longitude
            }))
        };

        try {
            const response = await fetch('/api/trips', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(tripData)
            });

            if (response.ok) {
                alert('Trip saved successfully!');
                document.getElementById('tripTitle').value = '';
                document.getElementById('tripDescription').value = '';
                selectedLocations = [];
                updateLocationsList();
                updateMap();
                loadTrips();
            } else {
                alert('Error saving trip');
            }
        } catch (error) {
            console.error('Error saving trip:', error);
            alert('Error saving trip');
        }
    });
}

async function setupSearchInput() {
    console.log('Setting up search inputs...');
    
    // Setup search for both edit and new trip forms
    const searchConfigs = [
        { inputId: 'newSearchInput', resultsId: 'newSearchResults' },
        { inputId: 'editSearchInput', resultsId: 'editSearchResults' }
    ];

    for (const config of searchConfigs) {
        console.log('Setting up search for config:', config);
        
        const searchInput = document.getElementById(config.inputId);
        const searchResults = document.getElementById(config.resultsId);
        
        if (!searchInput || !searchResults) {
            console.warn(`Search elements not found for config:`, config);
            continue;
        }

        console.log(`Found search elements for ${config.inputId}`);

        let debounceTimer;
        searchInput.addEventListener('input', async (e) => {
            console.log(`Search input event for ${config.inputId}:`, e.target.value);
            
            clearTimeout(debounceTimer);
            const query = e.target.value.trim();
            
            // Clear results if query is empty
            if (!query) {
                searchResults.innerHTML = '';
                searchResults.style.display = 'none';
                return;
            }
            
            // Debounce search
            debounceTimer = setTimeout(async () => {
                try {
                    console.log(`Searching for: ${query}`);
                    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
                    
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Search failed');
                    }
                    
                    const data = await response.json();
                    console.log('Search results:', data);
                    
                    // Clear previous results
                    searchResults.innerHTML = '';
                    
                    if (!data.locations || data.locations.length === 0) {
                        searchResults.innerHTML = '<div class="search-result-item">No locations found</div>';
                        searchResults.style.display = 'block';
                        return;
                    }
                    
                    // Display results
                    searchResults.style.display = 'block';
                    data.locations.forEach(location => {
                        const div = document.createElement('div');
                        div.className = 'search-result-item';
                        
                        // Create a more detailed display with primary and secondary text
                        const primaryText = document.createElement('div');
                        primaryText.className = 'search-result-primary';
                        primaryText.textContent = location.name;
                        
                        const secondaryText = document.createElement('div');
                        secondaryText.className = 'search-result-secondary';
                        // Parse the display_name to show city, state, country
                        const addressParts = location.display_name.split(', ');
                        const relevantParts = addressParts.slice(1).filter(part => part !== location.name);
                        secondaryText.textContent = relevantParts.join(', ');
                        
                        div.appendChild(primaryText);
                        div.appendChild(secondaryText);
                        
                        div.addEventListener('click', () => {
                            console.log('Selected location:', location);
                            addLocation({
                                name: location.name,
                                display_name: location.display_name,
                                latitude: location.latitude,
                                longitude: location.longitude
                            });
                            searchInput.value = '';
                            searchResults.innerHTML = '';
                            searchResults.style.display = 'none';
                        });
                        searchResults.appendChild(div);
                    });
                } catch (error) {
                    console.error('Search error:', error);
                    console.error('Error details:', error.stack);
                    searchResults.innerHTML = '<div class="search-error search-result-item">Search failed. Please try again.</div>';
                }
            }, 300);
        });
    }
}

async function loadTrips() {
    console.log('Loading trips...');
    try {
        const response = await fetch('/api/trips');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Got trips data:', data);
        
        const tripsList = document.getElementById('tripsList');
        tripsList.innerHTML = '';
        
        // Show trips list, hide other panels
        tripsList.style.display = 'block';
        document.getElementById('newTripForm').style.display = 'none';
        document.getElementById('tripViewMode').style.display = 'none';
        document.getElementById('tripEditMode').style.display = 'none';
        
        if (data.trips && data.trips.length > 0) {
            data.trips.forEach(trip => {
                const tripItem = document.createElement('div');
                tripItem.className = 'list-group-item';
                
                // Format dates using our consistent date formatter
                const startDate = formatDateForDisplay(trip.start_date);
                const endDate = formatDateForDisplay(trip.end_date);
                
                tripItem.innerHTML = `
                    <h5>${trip.title}</h5>
                    <p>${trip.description || ''}</p>
                    <small>From ${startDate} to ${endDate}</small>
                `;
                tripItem.addEventListener('click', () => showTripDetails(trip));
                tripsList.appendChild(tripItem);
            });
            console.log('Trips loaded successfully');
        } else {
            console.log('No trips found');
            const noTripsMessage = document.createElement('div');
            noTripsMessage.className = 'no-trips-message';
            noTripsMessage.innerHTML = `
                <p>No trips found</p>
                <p>Click "New Trip" to create your first trip!</p>
            `;
            tripsList.appendChild(noTripsMessage);
        }
    } catch (error) {
        console.error('Error loading trips:', error);
        const tripsList = document.getElementById('tripsList');
        tripsList.innerHTML = `
            <div class="error-message">
                <p>Error loading trips</p>
                <p>Please try refreshing the page</p>
            </div>
        `;
    }
}

async function updateTrip() {
    try {
        if (!currentTrip || !currentTrip.id) {
            throw new Error('No trip ID found');
        }

        const title = document.getElementById('editTripTitle').value.trim();
        const description = document.getElementById('editTripDescription').value.trim();
        const startDateInput = document.getElementById('editTripStartDate');
        const endDateInput = document.getElementById('editTripEndDate');

        if (!title) {
            alert('Please enter a trip title');
            return;
        }

        if (selectedLocations.length === 0) {
            alert('Please add at least one location to your trip');
            return;
        }

        // Get the date values and validate them
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (startDate && endDate) {
            const startUTC = new Date(Date.UTC(
                ...startDate.split('-').map(Number)
            ));
            const endUTC = new Date(Date.UTC(
                ...endDate.split('-').map(Number)
            ));
            
            if (startUTC > endUTC) {
                alert('End date must be after start date');
                return;
            }
        }

        console.log('Updating trip with locations:', selectedLocations);
        const tripData = {
            title,
            description,
            start_date: startDate || null,
            end_date: endDate || null,
            locations: selectedLocations.map((loc, index) => {
                console.log('Sending location data:', loc);
                return {
                    name: loc.name,
                    display_name: loc.display_name,
                    latitude: loc.latitude,
                    longitude: loc.longitude
                };
            })
        };

        try {
            const response = await fetch(`/api/trips/${currentTrip.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(tripData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const { trip: updatedTrip } = await response.json();
            if (!updatedTrip) {
                throw new Error('No trip data received from server');
            }

            // Update currentTrip with the fresh data
            currentTrip = updatedTrip;
            
            // Clear selected locations and update with fresh data
            selectedLocations = updatedTrip.locations.map(loc => ({
                name: loc.name,
                display_name: loc.display_name,
                latitude: loc.latitude,
                longitude: loc.longitude
            }));

            // Explicitly manage path visibility
            if (path) {
                path.remove();
            }
            const pathCoordinates = currentTrip.locations.map(loc => [loc.latitude, loc.longitude]);
            path = animatePathWithPulses(pathCoordinates);
            if (path) path.addTo(map);

            // Directly set layer opacity to ensure visibility
            labelsLayer.setOpacity(1);
            terrainLayer.setOpacity(0.3);

            console.log('Path and labels should now be visible.');

            // Switch back to trip view mode
            document.getElementById('tripViewMode').style.display = 'block';
            document.getElementById('tripEditMode').style.display = 'none';
            document.getElementById('locationViewMode').style.display = 'none';
            document.getElementById('tripListMode').style.display = 'none';
            document.getElementById('newTripForm').style.display = 'none';

            // Update UI with the fresh trip data
            showTripDetails(updatedTrip, true);
        } catch (error) {
            console.error('Error updating trip:', error);
            alert('Failed to update trip. Please try again.');
        }
    } catch (error) {
        console.error('Error updating trip:', error);
        alert('Failed to update trip. Please try again.');
    }
}

function handlePathVisibility() {
    if (currentTrip && currentTrip.locations.length > 1) {
        const pathCoordinates = currentTrip.locations.map(loc => [loc.latitude, loc.longitude]);

        if (document.getElementById('tripViewMode').style.display === 'block' ||
            document.getElementById('tripEditMode').style.display === 'block') {
            if (!path) {
                path = animatePathWithPulses(pathCoordinates);
                if (path) path.addTo(map);
            }
        } else {
            if (path) {
                path.remove();
                path = null;
            }
        }
    }
}

function showLocationDetails(location, tripTitle, locationIndex, totalLocations, trip) {
    if (isMapAnimating) {
        // Stop any current animation
        map.stop();
    }
    
    currentLocationIndex = locationIndex;
    isMapAnimating = true;
    
    // Store trip information for when we go back
    if (trip) {
        currentTrip = trip;
    }
    
    // Only clear the path, keep markers
    if (path) {
        path.remove();
        path = null;
    }
    
    // Update location details in the view
    document.querySelector('#locationViewMode h3').textContent = location.name;
    document.getElementById('locationStop').textContent = `Location ${locationIndex + 1} of ${totalLocations}`;
    document.getElementById('locationAddress').textContent = location.display_name || '';
    
    // Show location view mode
    document.getElementById('locationViewMode').style.display = 'block';
    document.getElementById('tripViewMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';

    // Update map view with animation
    if (location.latitude && location.longitude) {
        fadeOutLayers();
        map.flyTo([location.latitude, location.longitude], 14, {
            duration: 2.0,
            easeLinearity: 0.25
        });

        map.once('moveend', () => {
            isMapAnimating = false;
            fadeInLayers();
            
            // Highlight the current location's marker
            markers.forEach(marker => {
                const markerLatLng = marker.getLatLng();
                if (markerLatLng.lat === location.latitude && markerLatLng.lng === location.longitude) {
                    highlightMarker(marker);
                } else {
                    unhighlightMarker(marker);
                }
            });
        });
    }
}

function showNextLocation() {
    if (isMapAnimating || !currentTrip || !currentTrip.locations.length) return;
    
    currentLocationIndex = (currentLocationIndex + 1) % currentTrip.locations.length;
    const nextLocation = currentTrip.locations[currentLocationIndex];
    showLocationDetails(nextLocation, currentTrip.title, currentLocationIndex, currentTrip.locations.length, currentTrip);
}

function showPreviousLocation() {
    if (isMapAnimating || !currentTrip || !currentTrip.locations.length) return;
    
    currentLocationIndex = (currentLocationIndex - 1 + currentTrip.locations.length) % currentTrip.locations.length;
    const prevLocation = currentTrip.locations[currentLocationIndex];
    showLocationDetails(prevLocation, currentTrip.title, currentLocationIndex, currentTrip.locations.length, currentTrip);
}

function showTripDetails(trip, isFromEditMode = false) {
    console.log('Showing trip details:', trip);
    currentTrip = trip;
    
    if (trip.locations.length > 0) {
        const bounds = L.latLngBounds(trip.locations.map(loc => [loc.latitude, loc.longitude]));
        
        // Clear existing markers and path
        clearMap();
        
        // Add markers immediately
        trip.locations.forEach(loc => {
            const marker = createPulsingMarker([loc.latitude, loc.longitude]);
            marker.addTo(map);
            markers.push(marker);
        });

        // Skip animation if coming from edit mode
        if (!isFromEditMode) {
            // Fade out labels layers during animation
            fadeOutLayers();
            
            // Start the zoom animation
            isMapAnimating = true;
            map.flyToBounds(bounds, {
                duration: 2.0,
                easeLinearity: 0.25,
                paddingTopLeft: [400, 24],
                paddingBottomRight: [24, 24],
                maxZoom: 12
            });
            
            // Reset animation flag when complete
            map.once('moveend', () => {
                isMapAnimating = false;

                // Fade in labels layers
                fadeInLayers();

                // Handle path visibility
                handlePathVisibility();
            });
        } else {
            // Ensure labels are visible if coming from edit mode
            labelsLayer.setOpacity(1);
        }

        // Add path after zoom animation completes
        if (isFromEditMode) {
            // Create path immediately if coming from edit mode
            if (document.getElementById('locationViewMode').style.display !== 'block' && 
                document.getElementById('tripListMode').style.display !== 'block') {
                handlePathVisibility();
            }
        }
    }
    
    // Show trip view mode and hide others
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
    
    // Update trip details
    document.getElementById('viewTripTitle').textContent = trip.title;
    document.getElementById('viewTripDescription').textContent = trip.description || '';
    document.getElementById('tripViewDates').textContent = formatDateRange(trip.start_date, trip.end_date);
    
    // Update locations list
    const locationsList = document.getElementById('viewLocations');
    if (locationsList) {
        locationsList.innerHTML = trip.locations.map((location, index) => {
            // Prepare the location data for onclick
            const locationData = {
                name: location.name || 'Unnamed Location',
                display_name: location.display_name || '',
                latitude: location.latitude,
                longitude: location.longitude
            };
            
            // Escape any special characters in strings
            const escapedLocation = JSON.stringify(locationData).replace(/"/g, '&quot;');
            const escapedTitle = trip.title.replace(/"/g, '&quot;');
            const escapedTrip = JSON.stringify(trip).replace(/"/g, '&quot;');
            
            return `
                <li class="location-item" 
                    data-location-index="${index}"
                    data-lat="${location.latitude}"
                    data-lng="${location.longitude}"
                    onclick='showLocationDetails(${escapedLocation}, "${escapedTitle}", ${index}, ${trip.locations.length}, ${escapedTrip})'>
                    <div class="location-info">
                        <div class="location-name">${locationData.name}</div>
                        <div class="location-address">${locationData.display_name}</div>
                    </div>
                    <i class="fas fa-chevron-right"></i>
                </li>
            `;
        }).join('');
        
        // Add click handlers for locations
        locationsList.querySelectorAll('.location-item').forEach(item => {
            const index = parseInt(item.dataset.locationIndex);
            const location = trip.locations[index];
            
            // Click handler
            item.addEventListener('click', () => {
                showLocationDetails(location, trip.title, index, trip.locations.length, trip);
            });

            // Hover handlers
            item.addEventListener('mouseover', () => {
                const lat = parseFloat(item.dataset.lat);
                const lng = parseFloat(item.dataset.lng);
                highlightLocationOnMap(lat, lng, index);
            });

            item.addEventListener('mouseout', () => {
                resetLocationHighlight(index);
            });
        });
    }
}

function enterEditMode() {
    editMode = true;
    selectedLocations = [...currentTrip.locations];  // Copy current trip locations
    
    // Update form fields
    const titleInput = document.getElementById('editTripTitle');
    const descriptionInput = document.getElementById('editTripDescription');
    const startDateInput = document.getElementById('editTripStartDate');
    const endDateInput = document.getElementById('editTripEndDate');
    
    if (titleInput) titleInput.value = currentTrip.title;
    if (descriptionInput) descriptionInput.value = currentTrip.description || '';
    
    // Format dates for input fields (YYYY-MM-DD)
    if (startDateInput && currentTrip.start_date) {
        startDateInput.value = formatDateForInput(currentTrip.start_date);
    }
    if (endDateInput && currentTrip.end_date) {
        endDateInput.value = formatDateForInput(currentTrip.end_date);
    }
    
    // Show edit form and hide others
    document.getElementById('tripViewMode').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'block';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
    
    // Update locations list
    updateLocationsList();
    
    // Update map
    displayLocationsOnMap(selectedLocations);
    
    // Ensure path visibility
    handlePathVisibility();
    
    // Maintain label visibility
    maintainLabelVisibility();
}

function startEditTrip(event) {
    if (event) event.preventDefault();
    console.log('Starting edit trip...');

    if (!currentTrip) {
        console.log('No current trip to edit');
        return;
    }

    if (isMapAnimating) {
        console.log('Map is still animating, stopping animation...');
        map.stop();
        isMapAnimating = false;
    }

    console.log('Setting up edit mode...');
    // Copy trip data for editing
    selectedLocations = [...currentTrip.locations];

    // Update form fields
    const titleInput = document.getElementById('editTripTitle');
    const descriptionInput = document.getElementById('editTripDescription');
    const startDateInput = document.getElementById('editTripStartDate');
    const endDateInput = document.getElementById('editTripEndDate');
    
    console.log('Updating form fields...');
    if (titleInput) titleInput.value = currentTrip.title;
    if (descriptionInput) descriptionInput.value = currentTrip.description || '';
    if (startDateInput && currentTrip.start_date) {
        startDateInput.value = formatDateForInput(currentTrip.start_date);
    }
    if (endDateInput && currentTrip.end_date) {
        endDateInput.value = formatDateForInput(currentTrip.end_date);
    }

    console.log('Switching to edit mode display...');
    // Show edit mode and hide others
    document.getElementById('tripViewMode').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'block';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';

    // Update map and UI
    console.log('Updating map and UI...');
    editMode = true;
    displayLocationsOnMap(selectedLocations);
    updateLocationsList();
    handlePathVisibility();
    fadeInLayers();

    console.log('Edit mode setup complete');
}

function saveEditChanges() {
    // Save the changes made during edit mode
    // This is a placeholder function to represent saving logic
    
    // Ensure no animations are triggered that hide paths or labels
    if (isMapAnimating) {
        map.stop();
        isMapAnimating = false;
    }
    
    // Explicitly manage path visibility
    if (path) {
        path.remove();
    }
    const pathCoordinates = currentTrip.locations.map(loc => [loc.latitude, loc.longitude]);
    path = animatePathWithPulses(pathCoordinates);
    if (path) path.addTo(map);

    // Directly set layer opacity to ensure visibility
    labelsLayer.setOpacity(1);
    terrainLayer.setOpacity(0.3);

    // Switch back to trip view mode without altering zoom or labels
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
}

function cancelEdit() {
    console.log('Cancelling edit mode...');
    if (!currentTrip) {
        console.error('No current trip found when cancelling edit');
        // Just switch back to trip list view
        document.getElementById('tripViewMode').style.display = 'none';
        document.getElementById('tripEditMode').style.display = 'none';
        document.getElementById('locationViewMode').style.display = 'none';
        document.getElementById('tripListMode').style.display = 'block';
        document.getElementById('newTripForm').style.display = 'none';
        return;
    }
    
    editMode = false;
    
    // Reset locations to original trip locations
    selectedLocations = [...currentTrip.locations];
    
    // Clear existing markers and path
    clearMap();

    // Only proceed with map updates if we have locations
    if (currentTrip.locations && currentTrip.locations.length > 0) {
        // Redisplay original trip markers
        currentTrip.locations.forEach(loc => {
            const marker = createPulsingMarker([loc.latitude, loc.longitude]);
            marker.addTo(map);
            markers.push(marker);
        });
        
        // Calculate bounds for all locations
        const bounds = L.latLngBounds(currentTrip.locations.map(loc => [loc.latitude, loc.longitude]));
        
        // Ensure we're at the right zoom level
        map.fitBounds(bounds, {
            paddingTopLeft: [400, 24],
            paddingBottomRight: [24, 24],
            maxZoom: 12
        });
        
        // Restore original path
        handlePathVisibility();
    }
    
    // Ensure labels are visible
    fadeInLayers();
    
    // Switch back to trip view mode
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
    
    // Clear any search results
    const searchResults = document.getElementById('editSearchResults');
    if (searchResults) {
        searchResults.innerHTML = '';
    }
    
    // Reset search input
    const searchInput = document.getElementById('editSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
}

function maintainLabelVisibility() {
    fadeInLayers();
}

function handleBackToTrip() {
    // Store trip data locally to prevent race conditions
    const trip = currentTrip;
    if (!trip || !trip.locations) {
        console.error('No valid trip data available');
        showTripsList();
        return;
    }

    // Show trip view mode and hide others immediately
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';

    // Reset locations to original trip state
    selectedLocations = [...trip.locations];
    
    // Clear existing markers and path
    clearMap();
    
    // Add markers for each location
    trip.locations.forEach(loc => {
        const marker = createPulsingMarker([loc.latitude, loc.longitude]);
        marker.addTo(map);
        markers.push(marker);
    });
    
    const bounds = L.latLngBounds(trip.locations.map(loc => [loc.latitude, loc.longitude]));
    
    // Fade out labels layers during animation
    fadeOutLayers();
    
    isMapAnimating = true;
    // First zoom out to show all trip locations
    map.flyToBounds(bounds, { 
        paddingTopLeft: [400, 24],
        paddingBottomRight: [24, 24],
        maxZoom: 12,
        duration: 2.0,
        easeLinearity: 0.1
    });
    
    map.once('moveend', () => {
        // Verify trip state is still valid
        if (!currentTrip) {
            console.error('Trip state lost during animation');
            showTripsList();
            return;
        }

        isMapAnimating = false;
        fadeInLayers();
        
        // Update trip details UI
        document.getElementById('viewTripTitle').textContent = trip.title;
        document.getElementById('viewTripDescription').textContent = trip.description || '';
        document.getElementById('tripViewDates').textContent = formatDateRange(trip.start_date, trip.end_date);
        
        // Update locations list
        updateViewLocations();
    });
}

function showNextLocation() {
    if (currentTrip && currentTrip.locations.length > 0) {
        currentLocationIndex = (currentLocationIndex + 1) % currentTrip.locations.length;
        const nextLocation = currentTrip.locations[currentLocationIndex];
        showLocationDetails(nextLocation, currentTrip.title, currentLocationIndex, currentTrip.locations.length, currentTrip);
    }
}

function showPreviousLocation() {
    if (currentTrip && currentTrip.locations.length > 0) {
        currentLocationIndex = (currentLocationIndex - 1 + currentTrip.locations.length) % currentTrip.locations.length;
        const prevLocation = currentTrip.locations[currentLocationIndex];
        showLocationDetails(prevLocation, currentTrip.title, currentLocationIndex, currentTrip.locations.length, currentTrip);
    }
}

function saveEditChanges() {
    // Save the changes made during edit mode
    // This is a placeholder function to represent saving logic

    // Ensure no animations are triggered that hide paths or labels
    if (isMapAnimating) {
        map.stop();
        isMapAnimating = false;
    }

    // Explicitly manage path visibility
    if (path) {
        path.remove();
    }
    const pathCoordinates = currentTrip.locations.map(loc => [loc.latitude, loc.longitude]);
    path = animatePathWithPulses(pathCoordinates);
    if (path) path.addTo(map);

    // Directly set layer opacity to ensure visibility
    labelsLayer.setOpacity(1);
    terrainLayer.setOpacity(0.3);

    // Switch back to trip view mode without altering zoom or labels
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
}

function startEditTrip() {
    if (!currentTrip) return;

    // Stop any ongoing animations immediately
    if (isMapAnimating) {
        map.stop();
        isMapAnimating = false;
    }

    // Remove any existing path
    if (path) {
        path.remove();
        path = null;
    }

    // Reset all markers to default state
    markers.forEach(marker => {
        if (marker.original && marker.highlighted) {
            marker.highlighted.remove();
            marker.original.addTo(map);
        } else if (marker.getLatLng) {
            unhighlightMarker(marker);
        }
    });

    // Only proceed with map updates if we have locations
    if (currentTrip.locations && currentTrip.locations.length > 0) {
        // Calculate bounds for all locations
        const bounds = L.latLngBounds(currentTrip.locations.map(loc => [loc.latitude, loc.longitude]));
        
        // First ensure we're at the right zoom level
        map.fitBounds(bounds, {
            paddingTopLeft: [400, 24],
            paddingBottomRight: [24, 24],
            maxZoom: 12
        });
    }

    // Ensure labels and terrain are visible
    fadeInLayers();
    
    // Then enter edit mode
    enterEditMode();
    
    // Finally, ensure path is visible
    handlePathVisibility();
}

function enterEditMode() {
    console.log('Entering edit mode...');
    editMode = true;
    selectedLocations = [...currentTrip.locations];  // Copy current trip locations
    
    // Update form fields
    const titleInput = document.getElementById('editTripTitle');
    const descriptionInput = document.getElementById('editTripDescription');
    const startDateInput = document.getElementById('editTripStartDate');
    const endDateInput = document.getElementById('editTripEndDate');
    
    if (titleInput) titleInput.value = currentTrip.title;
    if (descriptionInput) descriptionInput.value = currentTrip.description || '';
    if (startDateInput && currentTrip.start_date) {
        startDateInput.value = formatDateForInput(currentTrip.start_date);
    }
    if (endDateInput && currentTrip.end_date) {
        endDateInput.value = formatDateForInput(currentTrip.end_date);
    }
    
    // Show edit form and hide others
    document.getElementById('tripViewMode').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'block';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
    
    // Update locations list
    updateLocationsList();
}

function cancelEdit() {
    console.log('Cancelling edit mode...');
    if (!currentTrip) {
        console.error('No current trip found when cancelling edit');
        // Just switch back to trip list view
        document.getElementById('tripViewMode').style.display = 'none';
        document.getElementById('tripEditMode').style.display = 'none';
        document.getElementById('locationViewMode').style.display = 'none';
        document.getElementById('tripListMode').style.display = 'block';
        document.getElementById('newTripForm').style.display = 'none';
        return;
    }
    
    editMode = false;
    
    // Reset locations to original trip locations
    selectedLocations = [...currentTrip.locations];
    
    // Clear existing markers and path
    clearMap();
    
    // Only proceed with map updates if we have locations
    if (currentTrip.locations && currentTrip.locations.length > 0) {
        // Redisplay original trip markers
        currentTrip.locations.forEach(loc => {
            const marker = createPulsingMarker([loc.latitude, loc.longitude]);
            marker.addTo(map);
            markers.push(marker);
        });
        
        // Calculate bounds for all locations
        const bounds = L.latLngBounds(currentTrip.locations.map(loc => [loc.latitude, loc.longitude]));
        
        // Ensure we're at the right zoom level
        map.fitBounds(bounds, {
            paddingTopLeft: [400, 24],
            paddingBottomRight: [24, 24],
            maxZoom: 12
        });
        
        // Restore original path
        handlePathVisibility();
    }
    
    // Ensure labels are visible
    fadeInLayers();
    
    // Switch back to trip view mode
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
    
    // Clear any search results
    const searchResults = document.getElementById('editSearchResults');
    if (searchResults) {
        searchResults.innerHTML = '';
    }
    
    // Reset search input
    const searchInput = document.getElementById('editSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
}

function maintainLabelVisibility() {
    fadeInLayers();
}

function handleBackToTrip() {
    // Store trip data locally to prevent race conditions
    const trip = currentTrip;
    if (!trip || !trip.locations) {
        console.error('No valid trip data available');
        showTripsList();
        return;
    }

    // Show trip view mode and hide others immediately
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';

    // Reset locations to original trip state
    selectedLocations = [...trip.locations];
    
    // Clear existing markers and path
    clearMap();
    
    // Add markers for each location
    trip.locations.forEach(loc => {
        const marker = createPulsingMarker([loc.latitude, loc.longitude]);
        marker.addTo(map);
        markers.push(marker);
    });
    
    const bounds = L.latLngBounds(trip.locations.map(loc => [loc.latitude, loc.longitude]));
    
    // Fade out labels layers during animation
    fadeOutLayers();
    
    isMapAnimating = true;
    // First zoom out to show all trip locations
    map.flyToBounds(bounds, { 
        paddingTopLeft: [400, 24],
        paddingBottomRight: [24, 24],
        maxZoom: 12,
        duration: 2.0,
        easeLinearity: 0.1
    });
    
    map.once('moveend', () => {
        // Verify trip state is still valid
        if (!currentTrip) {
            console.error('Trip state lost during animation');
            showTripsList();
            return;
        }

        isMapAnimating = false;
        fadeInLayers();
        
        // Update trip details UI
        document.getElementById('viewTripTitle').textContent = trip.title;
        document.getElementById('viewTripDescription').textContent = trip.description || '';
        document.getElementById('tripViewDates').textContent = formatDateRange(trip.start_date, trip.end_date);
        
        // Update locations list
        updateViewLocations();
    });
}

function highlightLocationOnMap(lat, lng, index) {
    const marker = markers[index];
    if (!marker) return;

    if (marker.original && marker.highlighted) {
        // If it's already a marker object with both states
        marker.highlighted.remove();
        marker.original.addTo(map);
    } else if (marker.getLatLng) {
        // If it's a regular marker
        highlightMarker(marker);
    }
}

function resetLocationHighlight(index) {
    const marker = markers[index];
    if (!marker) return;

    if (marker.original && marker.highlighted) {
        // If it's a marker object with both states
        marker.highlighted.remove();
        marker.original.addTo(map);
    } else if (marker.getLatLng) {
        // If it's a regular marker
        unhighlightMarker(marker);
    }
}

function showNextLocation() {
    if (currentTrip && currentTrip.locations.length > 0) {
        currentLocationIndex = (currentLocationIndex + 1) % currentTrip.locations.length;
        const nextLocation = currentTrip.locations[currentLocationIndex];
        showLocationDetails(nextLocation, currentTrip.title, currentLocationIndex, currentTrip.locations.length, currentTrip);
    }
}

function showPreviousLocation() {
    if (currentTrip && currentTrip.locations.length > 0) {
        currentLocationIndex = (currentLocationIndex - 1 + currentTrip.locations.length) % currentTrip.locations.length;
        const prevLocation = currentTrip.locations[currentLocationIndex];
        showLocationDetails(prevLocation, currentTrip.title, currentLocationIndex, currentTrip.locations.length, currentTrip);
    }
}

function saveEditChanges() {
    // Save the changes made during edit mode
    // This is a placeholder function to represent saving logic

    // Ensure no animations are triggered that hide paths or labels
    if (isMapAnimating) {
        map.stop();
        isMapAnimating = false;
    }

    // Explicitly manage path visibility
    if (path) {
        path.remove();
    }
    const pathCoordinates = currentTrip.locations.map(loc => [loc.latitude, loc.longitude]);
    path = animatePathWithPulses(pathCoordinates);
    if (path) path.addTo(map);

    // Directly set layer opacity to ensure visibility
    labelsLayer.setOpacity(1);
    terrainLayer.setOpacity(0.3);

    // Switch back to trip view mode without altering zoom or labels
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
}

function startEditTrip() {
    if (!currentTrip) return;

    // Stop any ongoing animations immediately
    if (isMapAnimating) {
        map.stop();
        isMapAnimating = false;
    }

    // Remove any existing path
    if (path) {
        path.remove();
        path = null;
    }

    // Reset all markers to default state
    markers.forEach(marker => {
        if (marker.original && marker.highlighted) {
            marker.highlighted.remove();
            marker.original.addTo(map);
        } else if (marker.getLatLng) {
            unhighlightMarker(marker);
        }
    });

    // Only proceed with map updates if we have locations
    if (currentTrip.locations && currentTrip.locations.length > 0) {
        // Calculate bounds for all locations
        const bounds = L.latLngBounds(currentTrip.locations.map(loc => [loc.latitude, loc.longitude]));
        
        // First ensure we're at the right zoom level
        map.fitBounds(bounds, {
            paddingTopLeft: [400, 24],
            paddingBottomRight: [24, 24],
            maxZoom: 12
        });
    }

    // Ensure labels and terrain are visible
    fadeInLayers();
    
    // Then enter edit mode
    enterEditMode();
    
    // Finally, ensure path is visible
    handlePathVisibility();
}

function enterEditMode() {
    console.log('Entering edit mode...');
    editMode = true;
    selectedLocations = [...currentTrip.locations];  // Copy current trip locations
    
    // Update form fields
    const titleInput = document.getElementById('editTripTitle');
    const descriptionInput = document.getElementById('editTripDescription');
    const startDateInput = document.getElementById('editTripStartDate');
    const endDateInput = document.getElementById('editTripEndDate');
    
    if (titleInput) titleInput.value = currentTrip.title;
    if (descriptionInput) descriptionInput.value = currentTrip.description || '';
    if (startDateInput && currentTrip.start_date) {
        startDateInput.value = formatDateForInput(currentTrip.start_date);
    }
    if (endDateInput && currentTrip.end_date) {
        endDateInput.value = formatDateForInput(currentTrip.end_date);
    }
    
    // Show edit form and hide others
    document.getElementById('tripViewMode').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'block';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
    
    // Update locations list
    updateLocationsList();
}

function cancelEdit() {
    console.log('Cancelling edit mode...');
    if (!currentTrip) {
        console.error('No current trip found when cancelling edit');
        // Just switch back to trip list view
        document.getElementById('tripViewMode').style.display = 'none';
        document.getElementById('tripEditMode').style.display = 'none';
        document.getElementById('locationViewMode').style.display = 'none';
        document.getElementById('tripListMode').style.display = 'block';
        document.getElementById('newTripForm').style.display = 'none';
        return;
    }
    
    editMode = false;
    
    // Reset locations to original trip locations
    selectedLocations = [...currentTrip.locations];
    
    // Clear existing markers and path
    clearMap();
    
    // Only proceed with map updates if we have locations
    if (currentTrip.locations && currentTrip.locations.length > 0) {
        // Redisplay original trip markers
        currentTrip.locations.forEach(loc => {
            const marker = createPulsingMarker([loc.latitude, loc.longitude]);
            marker.addTo(map);
            markers.push(marker);
        });
        
        // Calculate bounds for all locations
        const bounds = L.latLngBounds(currentTrip.locations.map(loc => [loc.latitude, loc.longitude]));
        
        // Ensure we're at the right zoom level
        map.fitBounds(bounds, {
            paddingTopLeft: [400, 24],
            paddingBottomRight: [24, 24],
            maxZoom: 12
        });
        
        // Restore original path
        handlePathVisibility();
    }
    
    // Ensure labels are visible
    fadeInLayers();
    
    // Switch back to trip view mode
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
    
    // Clear any search results
    const searchResults = document.getElementById('editSearchResults');
    if (searchResults) {
        searchResults.innerHTML = '';
    }
    
    // Reset search input
    const searchInput = document.getElementById('editSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
}

function maintainLabelVisibility() {
    fadeInLayers();
}

function handleBackToTrip() {
    // Store trip data locally to prevent race conditions
    const trip = currentTrip;
    if (!trip || !trip.locations) {
        console.error('No valid trip data available');
        showTripsList();
        return;
    }

    // Show trip view mode and hide others immediately
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';

    // Reset locations to original trip state
    selectedLocations = [...trip.locations];
    
    // Clear existing markers and path
    clearMap();
    
    // Add markers for each location
    trip.locations.forEach(loc => {
        const marker = createPulsingMarker([loc.latitude, loc.longitude]);
        marker.addTo(map);
        markers.push(marker);
    });
    
    const bounds = L.latLngBounds(trip.locations.map(loc => [loc.latitude, loc.longitude]));
    
    // Fade out labels layers during animation
    fadeOutLayers();
    
    isMapAnimating = true;
    // First zoom out to show all trip locations
    map.flyToBounds(bounds, { 
        paddingTopLeft: [400, 24],
        paddingBottomRight: [24, 24],
        maxZoom: 12,
        duration: 2.0,
        easeLinearity: 0.1
    });
    
    map.once('moveend', () => {
        // Verify trip state is still valid
        if (!currentTrip) {
            console.error('Trip state lost during animation');
            showTripsList();
            return;
        }

        isMapAnimating = false;
        fadeInLayers();
        
        // Update trip details UI
        document.getElementById('viewTripTitle').textContent = trip.title;
        document.getElementById('viewTripDescription').textContent = trip.description || '';
        document.getElementById('tripViewDates').textContent = formatDateRange(trip.start_date, trip.end_date);
        
        // Update locations list
        updateViewLocations();
    });
}

function showTripsList() {
    // Immediately update UI to prevent flicker
    document.getElementById('tripListMode').style.display = 'block';
    document.getElementById('tripViewMode').style.display = 'none';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
    
    clearForms();
    clearMap();
    
    // Reset map view without animation to prevent race conditions
    map.setView([20, 0], 2, {
        animate: false
    });
    
    // Clear state after map is reset
    currentTrip = null;
    selectedLocations = [];
    editMode = false;
    
    // Ensure labels are visible and load trips
    fadeInLayers();
    loadTrips();
}

function updateViewLocations() {
    // Get current trip state safely
    const trip = currentTrip;
    if (!trip || !trip.locations) {
        console.error('Cannot update locations: no valid trip data');
        return;
    }
    
    const locationsList = document.getElementById('viewLocations');
    if (!locationsList) return;
    
    locationsList.innerHTML = trip.locations.map((location, index) => {
        // Prepare the location data for onclick
        const locationData = {
            name: location.name || 'Unnamed Location',
            display_name: location.display_name || '',
            latitude: location.latitude,
            longitude: location.longitude
        };
        
        // Escape any special characters in strings
        const escapedLocation = JSON.stringify(locationData).replace(/"/g, '&quot;');
        const escapedTitle = trip.title.replace(/"/g, '&quot;');
        const escapedTrip = JSON.stringify(trip).replace(/"/g, '&quot;');
        
        return `
            <li class="location-item" 
                data-location-index="${index}"
                data-lat="${location.latitude}"
                data-lng="${location.longitude}"
                onclick='showLocationDetails(${escapedLocation}, "${escapedTitle}", ${index}, ${trip.locations.length}, ${escapedTrip})'>
                <div class="location-info">
                    <div class="location-name">${locationData.name}</div>
                    <div class="location-address">${locationData.display_name}</div>
                </div>
                <i class="fas fa-chevron-right"></i>
            </li>
        `;
    }).join('');
    
    // Add hover handlers for locations
    locationsList.querySelectorAll('.location-item').forEach(item => {
        const index = parseInt(item.dataset.locationIndex);
        
        item.addEventListener('mouseover', () => {
            const lat = parseFloat(item.dataset.lat);
            const lng = parseFloat(item.dataset.lng);
            highlightLocationOnMap(lat, lng, index);
        });

        item.addEventListener('mouseout', () => {
            resetLocationHighlight(index);
        });
    });
}

function handleBackToTrip() {
    // Store trip data locally to prevent race conditions
    const trip = currentTrip;
    if (!trip || !trip.locations) {
        console.error('No valid trip data available');
        showTripsList();
        return;
    }

    // Show trip view mode and hide others immediately
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';

    // Reset locations to original trip state
    selectedLocations = [...trip.locations];
    
    // Clear existing markers and path
    clearMap();
    
    // Add markers for each location
    trip.locations.forEach(loc => {
        const marker = createPulsingMarker([loc.latitude, loc.longitude]);
        marker.addTo(map);
        markers.push(marker);
    });
    
    const bounds = L.latLngBounds(trip.locations.map(loc => [loc.latitude, loc.longitude]));
    
    // Fade out labels layers during animation
    fadeOutLayers();
    
    isMapAnimating = true;
    // First zoom out to show all trip locations
    map.flyToBounds(bounds, { 
        paddingTopLeft: [400, 24],
        paddingBottomRight: [24, 24],
        maxZoom: 12,
        duration: 2.0,
        easeLinearity: 0.1
    });
    
    map.once('moveend', () => {
        // Verify trip state is still valid
        if (!currentTrip) {
            console.error('Trip state lost during animation');
            showTripsList();
            return;
        }

        isMapAnimating = false;
        fadeInLayers();
        
        // Update trip details UI
        document.getElementById('viewTripTitle').textContent = trip.title;
        document.getElementById('viewTripDescription').textContent = trip.description || '';
        document.getElementById('tripViewDates').textContent = formatDateRange(trip.start_date, trip.end_date);
        
        // Update locations list
        updateViewLocations();
    });
}

function viewTrip(trip) {
    if (!trip) {
        console.error('No trip data provided to viewTrip');
        return;
    }

    // Store the trip data
    currentTrip = JSON.parse(JSON.stringify(trip)); // Deep copy to prevent reference issues
    selectedLocations = [...currentTrip.locations];
    
    // Clear existing markers and path
    clearMap();
    
    // Add markers for each location
    currentTrip.locations.forEach(loc => {
        const marker = createPulsingMarker([loc.latitude, loc.longitude]);
        marker.addTo(map);
        markers.push(marker);
    });
    
    // Calculate bounds for all locations
    const bounds = L.latLngBounds(currentTrip.locations.map(loc => [loc.latitude, loc.longitude]));
    
    // Update UI
    document.getElementById('viewTripTitle').textContent = currentTrip.title;
    document.getElementById('viewTripDescription').textContent = currentTrip.description || '';
    document.getElementById('tripViewDates').textContent = formatDateRange(currentTrip.start_date, currentTrip.end_date);
    
    // Show trip view and hide others
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
    
    // Update locations list
    updateViewLocations();
    
    // Animate to bounds
    isMapAnimating = true;
    map.flyToBounds(bounds, {
        paddingTopLeft: [400, 24],
        paddingBottomRight: [24, 24],
        maxZoom: 12,
        duration: 2.0,
        easeLinearity: 0.1
    });
    
    map.once('moveend', () => {
        isMapAnimating = false;
        handlePathVisibility();
        fadeInLayers();
    });
}

function updateViewLocations() {
    // Get current trip state safely
    const trip = currentTrip;
    if (!trip || !trip.locations) {
        console.error('Cannot update locations: no valid trip data');
        return;
    }
    
    const locationsList = document.getElementById('viewLocations');
    if (!locationsList) return;
    
    locationsList.innerHTML = trip.locations.map((location, index) => {
        // Prepare the location data for onclick
        const locationData = {
            name: location.name || 'Unnamed Location',
            display_name: location.display_name || '',
            latitude: location.latitude,
            longitude: location.longitude
        };
        
        // Escape any special characters in strings
        const escapedLocation = JSON.stringify(locationData).replace(/"/g, '&quot;');
        const escapedTitle = trip.title.replace(/"/g, '&quot;');
        const escapedTrip = JSON.stringify(trip).replace(/"/g, '&quot;');
        
        return `
            <li class="location-item" 
                data-location-index="${index}"
                data-lat="${location.latitude}"
                data-lng="${location.longitude}"
                onclick='showLocationDetails(${escapedLocation}, "${escapedTitle}", ${index}, ${trip.locations.length}, ${escapedTrip})'>
                <div class="location-info">
                    <div class="location-name">${locationData.name}</div>
                    <div class="location-address">${locationData.display_name}</div>
                </div>
                <i class="fas fa-chevron-right"></i>
            </li>
        `;
    }).join('');
    
    // Add hover handlers for locations
    locationsList.querySelectorAll('.location-item').forEach(item => {
        const index = parseInt(item.dataset.locationIndex);
        
        item.addEventListener('mouseover', () => {
            const lat = parseFloat(item.dataset.lat);
            const lng = parseFloat(item.dataset.lng);
            highlightLocationOnMap(lat, lng, index);
        });

        item.addEventListener('mouseout', () => {
            resetLocationHighlight(index);
        });
    });
}

function handleBackToTrip() {
    // Store trip data locally to prevent race conditions
    const trip = currentTrip;
    if (!trip || !trip.locations) {
        console.error('No valid trip data available');
        showTripsList();
        return;
    }

    // Show trip view mode and hide others immediately
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';

    // Reset locations to original trip state
    selectedLocations = [...trip.locations];
    
    // Clear existing markers and path
    clearMap();
    
    // Add markers for each location
    trip.locations.forEach(loc => {
        const marker = createPulsingMarker([loc.latitude, loc.longitude]);
        marker.addTo(map);
        markers.push(marker);
    });
    
    const bounds = L.latLngBounds(trip.locations.map(loc => [loc.latitude, loc.longitude]));
    
    // Fade out labels layers during animation
    fadeOutLayers();
    
    isMapAnimating = true;
    // First zoom out to show all trip locations
    map.flyToBounds(bounds, { 
        paddingTopLeft: [400, 24],
        paddingBottomRight: [24, 24],
        maxZoom: 12,
        duration: 2.0,
        easeLinearity: 0.1
    });
    
    map.once('moveend', () => {
        // Verify trip state is still valid
        if (!currentTrip) {
            console.error('Trip state lost during animation');
            showTripsList();
            return;
        }

        isMapAnimating = false;
        fadeInLayers();
        
        // Update trip details UI
        document.getElementById('viewTripTitle').textContent = trip.title;
        document.getElementById('viewTripDescription').textContent = trip.description || '';
        document.getElementById('tripViewDates').textContent = formatDateRange(trip.start_date, trip.end_date);
        
        // Update locations list
        updateViewLocations();
    });
}

function showTripsList() {
    // Immediately update UI to prevent flicker
    document.getElementById('tripListMode').style.display = 'block';
    document.getElementById('tripViewMode').style.display = 'none';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
    
    clearForms();
    clearMap();
    
    // Reset map view without animation to prevent race conditions
    map.setView([20, 0], 2, {
        animate: false
    });
    
    // Clear state after map is reset
    currentTrip = null;
    selectedLocations = [];
    editMode = false;
    
    // Ensure labels are visible and load trips
    fadeInLayers();
    loadTrips();
}

function clearForms() {
    // Safely clear form fields
    const formFields = {
        'tripTitle': '',
        'tripDescription': '',
        'editTripTitle': '',
        'editTripDescription': '',
        'tripTitle': '',
        'tripDescription': '',
        'tripStartDate': '',
        'tripEndDate': '',
        'editTripStartDate': '',
        'editTripEndDate': ''
    };

    Object.entries(formFields).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        }
    });

    // Reset locations and map
    selectedLocations = [];
    updateLocationsList();
    updateMap();
}

function closeTrip() {
    // Hide trip view/edit modes and show trips list
    document.getElementById('tripViewMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'block';
    
    // Clear map and reload trips
    clearMap();
    loadTrips();
}

function clearTripForm() {
    document.getElementById('tripTitle').value = '';
    document.getElementById('tripDescription').value = '';
    document.getElementById('tripStartDate').value = '';
    document.getElementById('tripEndDate').value = '';
    selectedLocations = [];
    updateNewTripLocations();
}

function cancelNewTrip() {
    // Hide new trip form, show trips list
    document.getElementById('newTripForm').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'block';
    
    // Clear form data
    clearTripForm();
    selectedLocations = [];
    updateMap();
}

async function saveNewTrip() {
    const title = document.getElementById('tripTitle').value.trim();
    const description = document.getElementById('tripDescription').value.trim();
    const startDateInput = document.getElementById('tripStartDate');
    const endDateInput = document.getElementById('tripEndDate');

    if (!title) {
        alert('Please enter a trip title');
        return;
    }

    if (selectedLocations.length === 0) {
        alert('Please add at least one location to your trip');
        return;
    }

    // Get the date values
    const startDate = startDateInput ? startDateInput.value : null;
    const endDate = endDateInput ? endDateInput.value : null;

    // Validate dates if both are provided
    if (startDate && endDate) {
        const startUTC = new Date(Date.UTC(
            ...startDate.split('-').map(Number)
        ));
        const endUTC = new Date(Date.UTC(
            ...endDate.split('-').map(Number)
        ));
        
        if (startUTC > endUTC) {
            alert('End date must be after start date');
            return;
        }
    }

    console.log('Saving new trip with locations:', selectedLocations);
    const tripData = {
        title,
        description,
        start_date: startDate,
        end_date: endDate,
        locations: selectedLocations.map(loc => ({
            name: loc.name,
            display_name: loc.display_name,
            latitude: loc.latitude,
            longitude: loc.longitude
        }))
    };

    try {
        const response = await fetch('/api/trips', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(tripData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save trip');
        }

        // Clear form and selected locations
        clearTripForm();
        selectedLocations = [];
        updateLocationsList();
        updateMap();

        // Show trips list and reload trips
        showTripsList();
        await loadTrips();

    } catch (error) {
        console.error('Error saving trip:', error);
        alert('Failed to save trip: ' + error.message);
    }
}

function showNewTripForm() {
    // Clear any existing data
    clearForms();
    selectedLocations = [];
    currentTrip = null;
    editMode = false;
    
    // Show new trip form and hide other views
    const views = {
        'tripViewMode': 'none',
        'tripListMode': 'none',
        'tripEditMode': 'none',
        'newTripForm': 'block'
    };

    Object.entries(views).forEach(([id, display]) => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = display;
        }
    });
    
    // Clear form fields
    document.getElementById('tripTitle').value = '';
    document.getElementById('tripDescription').value = '';
    
    // Update UI
    updateLocationsList();
    updateMap();
    setupDragAndDrop();
    updateNewTripLocations();
}

function updateNewTripLocations() {
    const newTripLocations = document.getElementById('newTripLocations');
    if (!newTripLocations) return;

    newTripLocations.innerHTML = '';
    selectedLocations.forEach((loc, index) => {
        const li = document.createElement('li');
        li.className = 'location-item';
        li.innerHTML = `
            <div class="drag-handle" role="button" aria-label="Drag to reorder"></div>
            <div class="location-info">
                <div class="location-name">${loc.name}</div>
                <div class="location-address">${loc.display_name || ''}</div>
            </div>
            <button class="btn-icon delete-btn" onclick="removeLocation(${index})" aria-label="Remove location">
                <i class="delete-icon"></i>
            </button>
        `;
        newTripLocations.appendChild(li);
    });

    // Initialize Sortable for drag-and-drop
    if (!newTripLocations.sortable) {
        new Sortable(newTripLocations, {
            animation: 150,
            handle: '.drag-handle',
            draggable: '.location-item',
            onEnd: function() {
                updateLocationsOrder('selectedLocations');
            }
        });
        newTripLocations.sortable = true;
    }

    // Update map with current locations
    updateMap();
}

// Helper function to format dates for display
function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Helper function to format a date range for display
function formatDateRange(startDate, endDate) {
    if (!startDate && !endDate) return '';
    
    const start = formatDateForDisplay(startDate);
    const end = formatDateForDisplay(endDate);
    
    if (start && end) {
        return `${start} to ${end}`;
    } else if (start) {
        return `From ${start}`;
    } else if (end) {
        return `Until ${end}`;
    }
    return '';
}

// Helper function to format dates for input fields
function formatDateForInput(dateStr) {
    if (!dateStr) return '';
    
    // For input fields, just return the ISO date string as is
    // since we're dealing with date-only values (not timestamps)
    return dateStr;
}

// Function to animate path with pulses
function animatePathWithPulses(pathCoordinates) {
    if (!pathCoordinates || pathCoordinates.length < 2) return null;

    // Create a featureGroup to hold the paths
    const pathGroup = L.featureGroup();

    // Create the base path for the entire route (solid line)
    const basePath = L.polyline(pathCoordinates, {
        color: 'var(--accent-color)',
        weight: 2,
        opacity: 0.35,  // Adjusted back to 0.15
        lineCap: 'round',
        lineJoin: 'round'
    });

    // Create multiple animated paths with offset animations for continuous flow
    const createAnimatedPath = (offset) => {
        const animatedPath = L.polyline(pathCoordinates, {
            color: 'var(--accent-color)',
            weight: 4,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round'
        });

        animatedPath.on('add', function(e) {
            const pathElement = e.target.getElement();
            if (pathElement) {
                pathElement.classList.remove(`flow-path-${offset}`);
                void pathElement.offsetWidth;

                // Create and add the animation style if it doesn't exist
                if (!document.querySelector(`style[data-animation="flow-${offset}"]`)) {
                    const style = document.createElement('style');
                    style.setAttribute('data-animation', `flow-${offset}`);
                    style.textContent = `
                        @keyframes flowAnimation${offset} {
                            0% {
                                stroke-dashoffset: 100;
                            }
                            100% {
                                stroke-dashoffset: 0;
                            }
                        }
                        .flow-path-${offset} {
                            stroke-dasharray: 10, 90;
                            animation: flowAnimation${offset} 3s linear infinite;
                            animation-delay: ${offset}s;
                        }
                    `;
                    document.head.appendChild(style);
                }
                
                pathElement.classList.add(`flow-path-${offset}`);
            }
        });

        return animatedPath;
    };

    // Create three paths with different offsets for continuous flow
    const animatedPath1 = createAnimatedPath(0);
    const animatedPath2 = createAnimatedPath(-1);
    const animatedPath3 = createAnimatedPath(-2);

    pathGroup.addLayer(basePath);
    pathGroup.addLayer(animatedPath1);
    pathGroup.addLayer(animatedPath2);
    pathGroup.addLayer(animatedPath3);

    return pathGroup;
}

async function deleteTrip() {
    if (!currentTrip || !currentTrip.id) {
        console.error('No trip ID provided for deletion');
        return;
    }

    if (!confirm('Are you sure you want to delete this trip?')) {
        return;
    }

    try {
        const response = await fetch(`/api/trips/${currentTrip.id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Clear the current trip and show the trips list
        currentTrip = null;
        showTripsList();
        
    } catch (error) {
        console.error('Error deleting trip:', error);
        alert('Failed to delete trip. Please try again.');
    }
}

function fadeOutLayers() {
    labelsLayer.setOpacity(0);
    terrainLayer.setOpacity(0);
}

function fadeInLayers() {
    labelsLayer.setOpacity(1);
    terrainLayer.setOpacity(0.3);
}

function startEditTrip() {
    if (!currentTrip) return;

    // Stop any ongoing animations immediately
    if (isMapAnimating) {
        map.stop();
        isMapAnimating = false;
    }

    // Remove any existing path
    if (path) {
        path.remove();
        path = null;
    }

    // Reset all markers to default state
    markers.forEach(marker => {
        if (marker.original && marker.highlighted) {
            marker.highlighted.remove();
            marker.original.addTo(map);
        } else if (marker.getLatLng) {
            unhighlightMarker(marker);
        }
    });

    // Only proceed with map updates if we have locations
    if (currentTrip.locations && currentTrip.locations.length > 0) {
        // Calculate bounds for all locations
        const bounds = L.latLngBounds(currentTrip.locations.map(loc => [loc.latitude, loc.longitude]));
        
        // First ensure we're at the right zoom level
        map.fitBounds(bounds, {
            paddingTopLeft: [400, 24],
            paddingBottomRight: [24, 24],
            maxZoom: 12
        });
    }

    // Ensure labels and terrain are visible
    fadeInLayers();
    
    // Then enter edit mode
    enterEditMode();
    
    // Finally, ensure path is visible
    handlePathVisibility();
}

function handlePathVisibility() {
    // Remove existing path if any
    if (path) {
        path.remove();
        path = null;
    }

    // Only create path if we have locations
    if (currentTrip && currentTrip.locations.length > 1) {
        const pathCoordinates = currentTrip.locations.map(loc => [loc.latitude, loc.longitude]);

        if (document.getElementById('tripViewMode').style.display === 'block' ||
            document.getElementById('tripEditMode').style.display === 'block') {
            if (!path) {
                path = animatePathWithPulses(pathCoordinates);
                if (path) path.addTo(map);
            }
        } else {
            if (path) {
                path.remove();
                path = null;
            }
        }
    }
}

function enterEditMode() {
    console.log('Entering edit mode...');
    editMode = true;
    selectedLocations = [...currentTrip.locations];  // Copy current trip locations
    
    // Update form fields
    const titleInput = document.getElementById('editTripTitle');
    const descriptionInput = document.getElementById('editTripDescription');
    const startDateInput = document.getElementById('editTripStartDate');
    const endDateInput = document.getElementById('editTripEndDate');
    
    if (titleInput) titleInput.value = currentTrip.title;
    if (descriptionInput) descriptionInput.value = currentTrip.description || '';
    if (startDateInput && currentTrip.start_date) {
        startDateInput.value = formatDateForInput(currentTrip.start_date);
    }
    if (endDateInput && currentTrip.end_date) {
        endDateInput.value = formatDateForInput(currentTrip.end_date);
    }
    
    // Show edit form and hide others
    document.getElementById('tripViewMode').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'block';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
    
    // Update locations list
    updateLocationsList();
}

function cancelEdit() {
    console.log('Cancelling edit mode...');
    if (!currentTrip) {
        console.error('No current trip found when cancelling edit');
        // Just switch back to trip list view
        document.getElementById('tripViewMode').style.display = 'none';
        document.getElementById('tripEditMode').style.display = 'none';
        document.getElementById('locationViewMode').style.display = 'none';
        document.getElementById('tripListMode').style.display = 'block';
        document.getElementById('newTripForm').style.display = 'none';
        return;
    }
    
    editMode = false;
    
    // Reset locations to original trip locations
    selectedLocations = [...currentTrip.locations];
    
    // Clear existing markers and path
    clearMap();
    
    // Only proceed with map updates if we have locations
    if (currentTrip.locations && currentTrip.locations.length > 0) {
        // Redisplay original trip markers
        currentTrip.locations.forEach(loc => {
            const marker = createPulsingMarker([loc.latitude, loc.longitude]);
            marker.addTo(map);
            markers.push(marker);
        });
        
        // Calculate bounds for all locations
        const bounds = L.latLngBounds(currentTrip.locations.map(loc => [loc.latitude, loc.longitude]));
        
        // Ensure we're at the right zoom level
        map.fitBounds(bounds, {
            paddingTopLeft: [400, 24],
            paddingBottomRight: [24, 24],
            maxZoom: 12
        });
        
        // Restore original path
        handlePathVisibility();
    }
    
    // Ensure labels are visible
    fadeInLayers();
    
    // Switch back to trip view mode
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
    
    // Clear any search results
    const searchResults = document.getElementById('editSearchResults');
    if (searchResults) {
        searchResults.innerHTML = '';
    }
    
    // Reset search input
    const searchInput = document.getElementById('editSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
}

function showTripsList() {
    // Immediately update UI to prevent flicker
    document.getElementById('tripListMode').style.display = 'block';
    document.getElementById('tripViewMode').style.display = 'none';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
    
    clearForms();
    clearMap();
    
    // Reset map view without animation to prevent race conditions
    map.setView([20, 0], 2, {
        animate: false
    });
    
    // Clear state after map is reset
    currentTrip = null;
    selectedLocations = [];
    editMode = false;
    
    // Ensure labels are visible and load trips
    fadeInLayers();
    loadTrips();
}

function viewTrip(trip) {
    if (!trip) {
        console.error('No trip data provided to viewTrip');
        return;
    }

    // Store the trip data
    currentTrip = JSON.parse(JSON.stringify(trip)); // Deep copy to prevent reference issues
    selectedLocations = [...currentTrip.locations];
    
    // Clear existing markers and path
    clearMap();
    
    // Add markers for each location
    currentTrip.locations.forEach(loc => {
        const marker = createPulsingMarker([loc.latitude, loc.longitude]);
        marker.addTo(map);
        markers.push(marker);
    });
    
    // Calculate bounds for all locations
    const bounds = L.latLngBounds(currentTrip.locations.map(loc => [loc.latitude, loc.longitude]));
    
    // Update UI
    document.getElementById('viewTripTitle').textContent = currentTrip.title;
    document.getElementById('viewTripDescription').textContent = currentTrip.description || '';
    document.getElementById('tripViewDates').textContent = formatDateRange(currentTrip.start_date, currentTrip.end_date);
    
    // Show trip view and hide others
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';
    
    // Update locations list
    updateViewLocations();
    
    // Animate to bounds
    isMapAnimating = true;
    map.flyToBounds(bounds, {
        paddingTopLeft: [400, 24],
        paddingBottomRight: [24, 24],
        maxZoom: 12,
        duration: 2.0,
        easeLinearity: 0.1
    });
    
    map.once('moveend', () => {
        isMapAnimating = false;
        handlePathVisibility();
        fadeInLayers();
    });
}

function updateViewLocations() {
    // Get current trip state safely
    const trip = currentTrip;
    if (!trip || !trip.locations) {
        console.error('Cannot update locations: no valid trip data');
        return;
    }
    
    const locationsList = document.getElementById('viewLocations');
    if (!locationsList) return;
    
    locationsList.innerHTML = trip.locations.map((location, index) => {
        // Prepare the location data for onclick
        const locationData = {
            name: location.name || 'Unnamed Location',
            display_name: location.display_name || '',
            latitude: location.latitude,
            longitude: location.longitude
        };
        
        // Escape any special characters in strings
        const escapedLocation = JSON.stringify(locationData).replace(/"/g, '&quot;');
        const escapedTitle = trip.title.replace(/"/g, '&quot;');
        const escapedTrip = JSON.stringify(trip).replace(/"/g, '&quot;');
        
        return `
            <li class="location-item" 
                data-location-index="${index}"
                data-lat="${location.latitude}"
                data-lng="${location.longitude}"
                onclick='showLocationDetails(${escapedLocation}, "${escapedTitle}", ${index}, ${trip.locations.length}, ${escapedTrip})'>
                <div class="location-info">
                    <div class="location-name">${locationData.name}</div>
                    <div class="location-address">${locationData.display_name}</div>
                </div>
                <i class="fas fa-chevron-right"></i>
            </li>
        `;
    }).join('');
    
    // Add hover handlers for locations
    locationsList.querySelectorAll('.location-item').forEach(item => {
        const index = parseInt(item.dataset.locationIndex);
        
        item.addEventListener('mouseover', () => {
            const lat = parseFloat(item.dataset.lat);
            const lng = parseFloat(item.dataset.lng);
            highlightLocationOnMap(lat, lng, index);
        });

        item.addEventListener('mouseout', () => {
            resetLocationHighlight(index);
        });
    });
}

function handleBackToTrip() {
    // Store trip data locally to prevent race conditions
    const trip = currentTrip;
    if (!trip || !trip.locations) {
        console.error('No valid trip data available');
        showTripsList();
        return;
    }

    // Show trip view mode and hide others immediately
    document.getElementById('tripListMode').style.display = 'none';
    document.getElementById('tripViewMode').style.display = 'block';
    document.getElementById('locationViewMode').style.display = 'none';
    document.getElementById('tripEditMode').style.display = 'none';
    document.getElementById('newTripForm').style.display = 'none';

    // Reset locations to original trip state
    selectedLocations = [...trip.locations];
    
    // Clear existing markers and path
    clearMap();
    
    // Add markers for each location
    trip.locations.forEach(loc => {
        const marker = createPulsingMarker([loc.latitude, loc.longitude]);
        marker.addTo(map);
        markers.push(marker);
    });
    
    const bounds = L.latLngBounds(trip.locations.map(loc => [loc.latitude, loc.longitude]));
    
    // Fade out labels layers during animation
    fadeOutLayers();
    
    isMapAnimating = true;
    // First zoom out to show all trip locations
    map.flyToBounds(bounds, { 
        paddingTopLeft: [400, 24],
        paddingBottomRight: [24, 24],
        maxZoom: 12,
        duration: 2.0,
        easeLinearity: 0.1
    });
    
    map.once('moveend', () => {
        // Verify trip state is still valid
        if (!currentTrip) {
            console.error('Trip state lost during animation');
            showTripsList();
            return;
        }

        isMapAnimating = false;
        fadeInLayers();
        
        // Update trip details UI
        document.getElementById('viewTripTitle').textContent = trip.title;
        document.getElementById('viewTripDescription').textContent = trip.description || '';
        document.getElementById('tripViewDates').textContent = formatDateRange(trip.start_date, trip.end_date);
        
        // Update locations list
        updateViewLocations();
    });
}
