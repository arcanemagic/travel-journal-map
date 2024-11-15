// Initialize map and variables
let map;
let selectedLocations = [];
let path = null;
let markers = [];
let currentTrip = null;
let editMode = false;

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
});

function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Trip edit form buttons
    const editForm = document.getElementById('tripEditMode');
    if (editForm) {
        const saveButton = editForm.querySelector('.btn-primary');
        const cancelButton = editForm.querySelector('.btn-outline-secondary');
        if (saveButton) saveButton.addEventListener('click', updateTrip);
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
        attributionControl: true
    }).setView([20, 0], 2);

    // Add the clean, topographic map style
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: ' OpenStreetMap contributors, CARTO'
    }).addTo(map);

    // Add zoom control to bottom right
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);
}

function createPulsingMarker(latlng, color = '#FF1E80') {
    const pulsingIcon = L.divIcon({
        className: 'custom-marker',
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

function createPulsingDot(latlng) {
    return L.divIcon({
        className: 'pulsing-dot',
        html: '<div class="pulse-dot"></div>',
        iconSize: [10, 10],
        iconAnchor: [5, 5]
    });
}

function clearMap() {
    // Clear existing markers
    if (markers) {
        markers.forEach(marker => {
            if (marker) marker.remove();
        });
        markers = [];
    }

    // Clear existing path
    if (path) {
        path.remove();
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

            // Add tooltip that shows on hover
            if (location.name) {
                marker.bindTooltip(location.name, {
                    permanent: false,
                    direction: 'top',
                    offset: [0, -10],
                    opacity: 0.9,
                    className: 'location-tooltip'
                });
            }
        });

        // Create a path between the markers if there are at least 2 locations
        if (selectedLocations.length >= 2) {
            const pathCoordinates = selectedLocations.map(loc => [
                parseFloat(loc.latitude),
                parseFloat(loc.longitude)
            ]).filter(coords => !isNaN(coords[0]) && !isNaN(coords[1]));

            if (pathCoordinates.length >= 2) {
                path = L.polyline(pathCoordinates, {
                    color: 'var(--accent-color)',
                    weight: 3,
                    opacity: 0.7
                }).addTo(map);
            }
        }

        // Fit the map bounds to show all markers
        if (markers.length > 0) {
            const group = new L.featureGroup(markers);
            map.fitBounds(group.getBounds().pad(0.1));
        }
    }
}

function addLocation(location) {
    console.log('Adding location:', location);
    try {
        // Validate coordinates
        const lat = parseFloat(location.latitude || location.lat);
        const lon = parseFloat(location.longitude || location.lon);
        
        if (isNaN(lat) || isNaN(lon)) {
            throw new Error('Invalid coordinates provided');
        }
        
        // Add to selected locations with consistent property names
        selectedLocations.push({
            name: location.name,
            latitude: lat,
            longitude: lon
        });
        
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
            <i class="fas fa-grip-vertical drag-handle"></i>
            <span class="location-name">${location.name}</span>
            <button class="btn-icon delete-btn" onclick="removeLocation(${index})" aria-label="Remove location">
                <i class="fas fa-trash-alt"></i>
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
                latitude: loc.lat,
                longitude: loc.lon,
                order: index
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
                        div.textContent = location.name;
                        div.addEventListener('click', () => {
                            console.log('Selected location:', location);
                            addLocation({
                                name: location.name,
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
        const data = await response.json();
        console.log('Got trips data:', data);
        
        const tripsList = document.getElementById('tripsList');
        tripsList.innerHTML = '';
        
        // Show trips list, hide other panels
        tripsList.style.display = 'block';
        document.getElementById('newTripForm').style.display = 'none';
        document.getElementById('tripViewMode').style.display = 'none';
        document.getElementById('tripEditMode').style.display = 'none';
        
        if (data.trips && Array.isArray(data.trips)) {
            data.trips.forEach(trip => {
                const tripItem = document.createElement('div');
                tripItem.className = 'list-group-item';
                tripItem.innerHTML = `
                    <h5>${trip.title}</h5>
                    <p>${trip.description || ''}</p>
                    <small>${new Date(trip.date).toLocaleDateString()}</small>
                `;
                tripItem.addEventListener('click', () => showTripDetails(trip));
                tripsList.appendChild(tripItem);
            });
            console.log('Trips loaded successfully');
        } else {
            console.error('No trips array in response:', data);
            tripsList.innerHTML = '<p>No trips found</p>';
        }
    } catch (error) {
        console.error('Error loading trips:', error);
        document.getElementById('tripsList').innerHTML = '<p>Error loading trips</p>';
    }
}

async function updateTrip() {
    try {
        if (!currentTrip || !currentTrip.id) {
            throw new Error('No trip ID found');
        }

        const title = document.getElementById('editTripTitle').value.trim();
        const description = document.getElementById('editTripDescription').value.trim();
        
        if (!title) {
            alert('Please enter a title for your trip');
            return;
        }
        
        if (selectedLocations.length === 0) {
            alert('Please add at least one location to your trip');
            return;
        }
        
        // Format locations for API, ensuring all coordinates are valid
        const locations = selectedLocations.map(loc => {
            const lat = parseFloat(loc.latitude);
            const lon = parseFloat(loc.longitude);
            
            if (isNaN(lat) || isNaN(lon)) {
                throw new Error(`Invalid coordinates for location: ${loc.name}`);
            }
            
            return {
                name: loc.name,
                lat: lat,
                lon: lon
            };
        });
        
        const response = await fetch(`/api/trips/${currentTrip.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title,
                description,
                locations
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const { trip: updatedTrip } = await response.json();
        if (!updatedTrip) {
            throw new Error('No trip data received from server');
        }
        
        // Update UI with the fresh trip data
        showTripDetails(updatedTrip);
        
    } catch (error) {
        console.error('Error updating trip:', error);
        alert('Failed to update trip. Please try again.');
    }
}

function showTripDetails(trip) {
    if (!trip || !trip.locations) {
        console.error('Invalid trip data:', trip);
        showTripsList();
        return;
    }

    clearForms();
    currentTrip = trip;
    editMode = false;
    
    // Update view form
    const titleElement = document.getElementById('viewTripTitle');
    const descriptionElement = document.getElementById('viewTripDescription');
    const locationsList = document.getElementById('viewLocations');
    
    if (!titleElement || !descriptionElement || !locationsList) {
        console.error('Required elements not found');
        return;
    }

    titleElement.textContent = trip.title;
    descriptionElement.textContent = trip.description || '';
    
    // Update locations list
    locationsList.innerHTML = '';
    
    trip.locations.forEach(location => {
        const li = document.createElement('li');
        li.className = 'location-item';
        li.textContent = location.name;
        locationsList.appendChild(li);
    });

    // Add delete button functionality
    const deleteButton = document.querySelector('.btn-danger');
    if (deleteButton) {
        deleteButton.onclick = () => deleteTrip(currentTrip.id);
    }

    // Show view form and hide others
    const views = {
        'tripViewMode': 'block',
        'tripListMode': 'none',
        'tripEditMode': 'none',
        'newTripForm': 'none'
    };

    Object.entries(views).forEach(([id, display]) => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = display;
        }
    });
    
    // Update map
    displayLocationsOnMap(trip.locations);
}

function startEditTrip() {
    if (!currentTrip) {
        console.error('No trip to edit');
        return;
    }

    editMode = true;
    
    // Update edit form
    document.getElementById('editTripTitle').value = currentTrip.title;
    document.getElementById('editTripDescription').value = currentTrip.description || '';
    
    // Copy trip locations to selectedLocations with consistent property names
    selectedLocations = currentTrip.locations.map(loc => ({
        name: loc.name,
        latitude: parseFloat(loc.lat || loc.latitude),
        longitude: parseFloat(loc.lon || loc.longitude)
    })).filter(loc => {
        const isValid = !isNaN(loc.latitude) && !isNaN(loc.longitude);
        if (!isValid) {
            console.warn('Filtered out invalid location:', loc);
        }
        return isValid;
    });

    // Show edit form and hide others
    const views = {
        'tripViewMode': 'none',
        'tripListMode': 'none',
        'tripEditMode': 'block',
        'newTripForm': 'none'
    };

    Object.entries(views).forEach(([id, display]) => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = display;
        }
    });

    // Update locations list and map
    updateLocationsList();
    updateMap();
    setupDragAndDrop();
}

function cancelEdit() {
    editMode = false;
    
    if (currentTrip) {
        showTripDetails(currentTrip);
    } else {
        showTripsList();
    }
}

function showTripsList() {
    clearForms();
    
    const views = {
        'tripListMode': 'block',
        'tripViewMode': 'none',
        'tripEditMode': 'none',
        'newTripForm': 'none'
    };

    Object.entries(views).forEach(([id, display]) => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = display;
        }
    });

    clearMap();
}

function clearForms() {
    // Safely clear form fields
    const formFields = {
        'tripTitle': '',
        'tripDescription': '',
        'editTripTitle': '',
        'editTripDescription': '',
        'tripTitle': '',
        'tripDescription': ''
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
    selectedLocations = [];
    updateLocationsList();
    updateMap();
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

    if (!title) {
        alert('Please enter a title for the trip');
        return;
    }

    if (selectedLocations.length === 0) {
        alert('Please add at least one location to the trip');
        return;
    }

    const tripData = {
        title,
        description,
        locations: selectedLocations.map(loc => ({
            name: loc.name,
            lat: parseFloat(loc.latitude || loc.lat),
            lon: parseFloat(loc.longitude || loc.lon)
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
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        // Close new trip form and refresh trips list
        cancelNewTrip();
        loadTrips();
    } catch (error) {
        console.error('Error creating trip:', error);
        alert('Failed to create trip. Please try again.');
    }
}

async function deleteTrip(tripId) {
    if (!tripId) {
        console.error('No trip ID provided for deletion');
        return;
    }

    if (!confirm('Are you sure you want to delete this trip?')) {
        return;
    }

    try {
        const response = await fetch(`/api/trips/${tripId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Refresh the trips list
        await loadTrips();
        showTripsList();
    } catch (error) {
        console.error('Error deleting trip:', error);
        alert('Failed to delete trip. Please try again.');
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
            <i class="fas fa-grip-vertical drag-handle"></i>
            <span class="location-name">${loc.name}</span>
            <button class="btn-icon btn-danger" onclick="removeLocation(${index})" aria-label="Remove location">
                <i class="fas fa-trash-alt"></i>
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
            onEnd: function(evt) {
                const movedItem = selectedLocations.splice(evt.oldIndex, 1)[0];
                selectedLocations.splice(evt.newIndex, 0, movedItem);
                updateMap();
            }
        });
        newTripLocations.sortable = true;
    }

    // Update map with current locations
    updateMap();
}
