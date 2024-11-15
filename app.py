from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import requests
import os
import logging
import traceback

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
db_path = os.path.join(instance_path, 'travel_journal.db')

# Configure SQLAlchemy
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ECHO'] = True  # Log all SQL queries

# Initialize database
db = SQLAlchemy(app)

class Trip(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    date = db.Column(db.DateTime, default=datetime.utcnow)
    locations = db.relationship('Location', backref='trip', lazy=True, order_by='Location.order', cascade='all, delete-orphan')

class Location(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    order = db.Column(db.Integer, nullable=False)
    trip_id = db.Column(db.Integer, db.ForeignKey('trip.id'), nullable=False)

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
        url = f'https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=5'
        headers = {'User-Agent': 'TravelJournalApp/1.0'}
        
        logger.info(f'Searching for location: {query}')
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        results = response.json()
        logger.info(f'Raw search results: {results}')
        
        locations = []
        
        for result in results:
            try:
                lat = float(result.get('lat', 0))
                lon = float(result.get('lon', 0))
                
                if lat == 0 and lon == 0:
                    continue
                    
                location = {
                    'name': result.get('display_name', ''),
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
        trips = Trip.query.order_by(Trip.date.desc()).all()
        return jsonify({
            'trips': [{
                'id': trip.id,
                'title': trip.title,
                'description': trip.description,
                'date': trip.date.isoformat(),
                'locations': [{
                    'name': loc.name,
                    'lat': loc.latitude,
                    'lon': loc.longitude
                } for loc in trip.locations]
            } for trip in trips]
        })
    except Exception as e:
        logger.error(f"Error getting trips: {str(e)}")
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
            description=data.get('description', '')
        )
        
        db.session.add(trip)
        db.session.flush()
        
        # Add locations
        for i, loc_data in enumerate(data['locations']):
            location = Location(
                name=loc_data['name'],
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
                'date': trip.date.isoformat(),
                'locations': [{
                    'name': loc.name,
                    'lat': loc.latitude,
                    'lon': loc.longitude
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
        
        # Remove old locations
        Location.query.filter_by(trip_id=trip_id).delete()
        
        # Add new locations
        for i, loc_data in enumerate(data['locations']):
            try:
                latitude = float(loc_data.get('latitude', loc_data.get('lat', 0)))
                longitude = float(loc_data.get('longitude', loc_data.get('lon', 0)))
                
                if not latitude or not longitude:
                    raise ValueError('Missing or invalid coordinates')
                    
                location = Location(
                    name=loc_data['name'],
                    latitude=latitude,
                    longitude=longitude,
                    order=i,
                    trip_id=trip_id
                )
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
                'date': trip.date.isoformat(),
                'locations': [{
                    'name': loc.name,
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
    # Clear port 5001 if it's in use
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('127.0.0.1', 5001))
        s.close()
    except socket.error as e:
        logger.warning(f"Port 5001 might be in use: {e}")
        
    logger.info("Starting server on port 5001")
    app.run(debug=True, port=5001)
