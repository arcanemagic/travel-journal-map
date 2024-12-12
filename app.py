from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date
import requests
import os
import logging
import traceback
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Log static file requests
@app.after_request
def after_request(response):
    if request.path.startswith('/static/'):
        logger.info(f'Static file request: {request.path} -> {response.status_code}')
    return response

# Ensure the instance folder exists
instance_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'instance')
if not os.path.exists(instance_path):
    os.makedirs(instance_path)

# Configure SQLAlchemy
db_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'instance', 'travel_journal.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ECHO'] = True  # Log all SQL queries

# Initialize database
db = SQLAlchemy(app)

class Trip(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    locations = db.relationship('Location', backref='trip', lazy='joined', order_by='Location.order', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'locations': [location.to_dict() for location in self.locations] if isinstance(self.locations, (list, tuple)) else []
        }

class Location(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)  # From Nominatim's name field
    display_name = db.Column(db.String(500), nullable=False)  # From Nominatim's display_name field
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    order = db.Column(db.Integer, nullable=False)
    trip_id = db.Column(db.Integer, db.ForeignKey('trip.id'), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'display_name': self.display_name,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'order': self.order
        }

def init_db():
    with app.app_context():
        # Create tables if they don't exist
        db.create_all()
        logger.info("Database initialized successfully")

# Initialize database tables
init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/search', methods=['GET'])
def search_location():
    query = request.args.get('q', '')
    if not query:
        return jsonify({'error': 'No query provided'}), 400

    try:
        # Use Nominatim for geocoding
        url = f'https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=5&addressdetails=1'
        headers = {'User-Agent': 'TravelJournalApp/1.0'}
        
        logger.info(f'Searching for location: {query}')
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        results = response.json()
        logger.info(f'Raw search results: {results}')
        
        locations = []
        
        for result in results:
            try:
                logger.info(f'Processing result: {result}')
                lat = float(result.get('lat', 0))
                lon = float(result.get('lon', 0))
                
                if lat == 0 and lon == 0:
                    continue

                # Get the most appropriate name
                name = result.get('name')  # First try to get Nominatim's name field
                if not name:
                    # Fall back to our custom logic
                    name = result.get('address', {}).get('house_number', '')
                    if name:
                        name = f"{name} {result.get('address', {}).get('road', '')}"
                    else:
                        name = result.get('display_name', '').split(',')[0].strip()
                    
                location = {
                    'name': name,
                    'display_name': result.get('display_name', ''),
                    'latitude': lat,
                    'longitude': lon
                }
                logger.info(f'Processed location: {location}')
                locations.append(location)
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid coordinates in search result: {result}")
                continue
        
        logger.info(f'Returning {len(locations)} locations')
        return jsonify({'locations': locations})
    except Exception as e:
        logger.error(f"Error in search_location: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to search location'}), 500

@app.route('/api/trips', methods=['GET'])
def get_trips():
    try:
        logger.info("Fetching all trips...")
        trips = Trip.query.order_by(Trip.id.desc()).all()
        logger.info(f"Found {len(trips)} trips")
        
        trip_list = []
        for trip in trips:
            try:
                trip_data = trip.to_dict()
                trip_list.append(trip_data)
            except Exception as trip_error:
                logger.error(f"Error processing trip {trip.id}: {str(trip_error)}")
                logger.error(traceback.format_exc())
        
        return jsonify({'trips': trip_list})
    except Exception as e:
        logger.error(f"Error getting trips: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to get trips'}), 500

@app.route('/api/trips', methods=['POST'])
def create_trip():
    try:
        data = request.get_json()
        logger.debug(f"Received trip data: {data}")
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        if not data.get('title'):
            return jsonify({'error': 'Title is required'}), 400
            
        if not data.get('locations'):
            return jsonify({'error': 'At least one location is required'}), 400
        
        # Create new trip
        trip = Trip(
            title=data['title'],
            description=data.get('description', ''),
            start_date=date.fromisoformat(data.get('start_date', '')) if data.get('start_date') else None,
            end_date=date.fromisoformat(data.get('end_date', '')) if data.get('end_date') else None
        )
        
        db.session.add(trip)
        db.session.flush()
        
        # Add locations
        for i, loc_data in enumerate(data['locations']):
            location = Location(
                name=loc_data['name'],
                display_name=loc_data.get('display_name', loc_data['name']),
                latitude=float(loc_data.get('lat', loc_data.get('latitude', 0))),
                longitude=float(loc_data.get('lon', loc_data.get('longitude', 0))),
                order=i,
                trip_id=trip.id
            )
            db.session.add(location)
        
        db.session.commit()
        logger.info(f"Trip created successfully with ID: {trip.id}")
        return jsonify({'message': 'Trip created successfully', 'trip_id': trip.id}), 201
        
    except Exception as e:
        db.session.rollback()
        error_details = traceback.format_exc()
        logger.error(f"Error creating trip: {str(e)}\n{error_details}")
        return jsonify({'error': f'Failed to create trip: {str(e)}'}), 500

@app.route('/api/trips/<int:trip_id>', methods=['GET'])
def get_trip(trip_id):
    try:
        trip = Trip.query.get(trip_id)
        if not trip:
            return jsonify({'error': 'Trip not found'}), 404
            
        return jsonify({
            'trip': {
                'id': trip.id,
                'title': trip.title,
                'description': trip.description,
                'created_at': trip.created_at.isoformat() if trip.created_at else None,
                'start_date': trip.start_date.isoformat() if trip.start_date else None,
                'end_date': trip.end_date.isoformat() if trip.end_date else None,
                'locations': [{
                    'name': loc.name,
                    'display_name': loc.display_name,
                    'latitude': loc.latitude,
                    'longitude': loc.longitude
                } for loc in trip.locations]
            }
        })
    except Exception as e:
        logger.error(f"Error getting trip {trip_id}: {str(e)}")
        return jsonify({'error': 'Failed to get trip'}), 500

@app.route('/api/trips/<int:trip_id>', methods=['PUT'])
def update_trip(trip_id):
    try:
        trip = Trip.query.get(trip_id)
        if not trip:
            return jsonify({'error': 'Trip not found'}), 404

        data = request.get_json()
        logger.debug(f"Updating trip {trip_id} with data: {data}")
        
        if not data or not data.get('title'):
            return jsonify({'error': 'Title is required'}), 400
            
        if not data.get('locations'):
            return jsonify({'error': 'At least one location is required'}), 400
        
        # Update trip details
        trip.title = data['title']
        trip.description = data.get('description', '')
        
        # Handle dates
        def parse_date(date_str):
            if not date_str:
                return None
            try:
                # Parse the date string directly without timezone handling
                # since we're dealing with dates only (not timestamps)
                year, month, day = map(int, date_str.split('-'))
                return date(year, month, day)
            except (ValueError, TypeError) as e:
                logger.error(f"Error parsing date {date_str}: {e}")
                return None

        trip.start_date = parse_date(data.get('start_date'))
        trip.end_date = parse_date(data.get('end_date'))
        
        # Log existing locations before removal
        logger.debug("Existing locations before removal:")
        for loc in trip.locations:
            logger.debug(f"Location: name={loc.name}, display_name={loc.display_name}")
        
        # Remove old locations
        Location.query.filter_by(trip_id=trip_id).delete()
        
        # Add new locations
        for i, loc_data in enumerate(data['locations']):
            try:
                latitude = float(loc_data.get('latitude', loc_data.get('lat', 0)))
                longitude = float(loc_data.get('longitude', loc_data.get('lon', 0)))
                
                if not latitude or not longitude:
                    raise ValueError('Missing or invalid coordinates')
                
                logger.debug(f"Creating new location with data: {loc_data}")
                location = Location(
                    name=loc_data['name'],
                    display_name=loc_data.get('display_name'),  # Use the provided display_name
                    latitude=latitude,
                    longitude=longitude,
                    order=i,
                    trip_id=trip_id
                )
                logger.debug(f"New location created: name={location.name}, display_name={location.display_name}")
                db.session.add(location)
            except (KeyError, ValueError, TypeError) as e:
                logger.error(f"Error processing location data: {loc_data}")
                raise ValueError(f"Invalid location data at index {i}: {str(e)}")
        
        db.session.commit()
        logger.info(f"Trip {trip_id} updated successfully")
        
        # Return the updated trip data
        return jsonify({
            'trip': {
                'id': trip.id,
                'title': trip.title,
                'description': trip.description,
                'created_at': trip.created_at.isoformat() if trip.created_at else None,
                'start_date': trip.start_date.isoformat() if trip.start_date else None,
                'end_date': trip.end_date.isoformat() if trip.end_date else None,
                'locations': [{
                    'name': loc.name,
                    'display_name': loc.display_name,
                    'latitude': loc.latitude,
                    'longitude': loc.longitude
                } for loc in trip.locations]
            }
        })
    
    except Exception as e:
        db.session.rollback()
        error_details = traceback.format_exc()
        logger.error(f"Error updating trip {trip_id}: {str(e)}\n{error_details}")
        return jsonify({'error': f'Failed to update trip: {str(e)}'}), 500

@app.route('/api/trips/<int:trip_id>', methods=['DELETE'])
def delete_trip(trip_id):
    try:
        trip = Trip.query.get(trip_id)
        if not trip:
            return jsonify({'error': 'Trip not found'}), 404
        
        db.session.delete(trip)
        db.session.commit()
        logger.info(f"Trip {trip_id} deleted successfully")
        return jsonify({'message': 'Trip deleted successfully'})
    
    except Exception as e:
        db.session.rollback()
        error_details = traceback.format_exc()
        logger.error(f"Error deleting trip {trip_id}: {str(e)}\n{error_details}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('FLASK_RUN_PORT', 5001))  # Default to 5000 if not set
    app.run(debug=True, host='0.0.0.0', port=port)
