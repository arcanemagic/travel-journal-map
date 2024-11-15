# Travel Journal Map

An interactive web application for creating and managing travel journals with an integrated map interface. Plan your trips by adding locations, organizing them in sequence, and visualizing your journey on a beautiful map.

## Features

- Interactive map interface using Leaflet.js
- Add and organize locations with drag-and-drop functionality
- Create and manage multiple trips
- Clean, modern UI with smooth animations
- Location search using OpenStreetMap
- Responsive design

## Tech Stack

- Backend: Flask with SQLAlchemy
- Frontend: Vanilla JavaScript
- Map: Leaflet.js
- UI Components: Font Awesome, Inter font
- Drag & Drop: Sortable.js
- Geocoding: Nominatim OpenStreetMap API

## Setup

1. Clone the repository:
```bash
git clone https://github.com/arcanemagic/travel-journal-map.git
cd travel-journal-map
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the application:
```bash
python app.py
```

5. Open your browser and navigate to `http://localhost:5000`

## Usage

1. Click "New Trip" to start planning a journey
2. Search for locations using the search bar
3. Add locations to your trip
4. Drag and drop to reorder locations
5. Save your trip with a title and description
6. View and edit your trips anytime

## Contributing

Feel free to open issues or submit pull requests with improvements.

## License

MIT License
