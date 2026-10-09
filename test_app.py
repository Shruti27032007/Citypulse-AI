import unittest
import json
import os
from app import app, load_json_file, REPORTS_FILE

class CityPulseTestCase(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        self.client = app.test_client()
        # Save snapshot of reports
        self.original_reports = load_json_file(REPORTS_FILE, [])

    def tearDown(self):
        # Restore pristine reports file after tests run
        from app import save_json_file
        save_json_file(REPORTS_FILE, self.original_reports)

    def test_homepage(self):
        """Test landing page renders with 200 OK and contains brand title."""
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"CityPulse AI", response.data)
        self.assertIn(b"Explore Smarter. Travel Better. Stay Aware.", response.data)

    def test_universal_city_search_autocomplete(self):
        """Test global city search autocomplete endpoint."""
        # Search Pune
        resp = self.client.get('/api/city/search?q=Pune')
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data['success'])
        self.assertGreater(data['count'], 0)
        pune_match = any("pune" in r['name'].lower() for r in data['results'])
        self.assertTrue(pune_match)

        # Search London
        resp_lon = self.client.get('/api/city/search?q=London')
        self.assertEqual(resp_lon.status_code, 200)
        data_lon = resp_lon.get_json()
        self.assertTrue(data_lon['success'])
        self.assertGreater(data_lon['count'], 0)

        # Empty search query handling
        resp_empty = self.client.get('/api/city/search?q=')
        self.assertEqual(resp_empty.status_code, 200)
        self.assertEqual(resp_empty.get_json()['count'], 0)

    def test_dynamic_city_details_pune_mumbai_london(self):
        """Test fetching dynamic overview, live weather, emergency, and POIs for Pune, Mumbai, London."""
        cities = ['Pune', 'Mumbai', 'London']
        for city in cities:
            resp = self.client.get(f'/api/city/details?name={city}')
            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()
            self.assertTrue(data['success'])
            city_info = data['data']
            self.assertTrue(city.lower() in city_info['city_name'].lower() or city_info['city_name'].lower() in city.lower())
            self.assertIn('weather', city_info)
            self.assertIn('temperature', city_info['weather'])
            self.assertIn('emergency', city_info)
            self.assertIn('overview', city_info)
            self.assertGreater(len(city_info['places']), 0)

    def test_different_cities_produce_different_places(self):
        """Verify that searching different cities produces different dynamic results."""
        resp_pune = self.client.get('/api/places?city=Pune')
        resp_london = self.client.get('/api/places?city=London')
        self.assertEqual(resp_pune.status_code, 200)
        self.assertEqual(resp_london.status_code, 200)

        pune_places = [p['name'] for p in resp_pune.get_json()['data']]
        london_places = [p['name'] for p in resp_london.get_json()['data']]

        self.assertNotEqual(pune_places, london_places)

    def test_smart_match_with_dynamic_city(self):
        """Verify Smart Match engine runs recommendations on the dynamically selected city."""
        payload = {
            "city": "Pune",
            "interests": ["Culture & History"],
            "budget": "free_budget",
            "category": "historical"
        }
        resp = self.client.post('/api/smart-match', json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data['success'])
        self.assertEqual(data['city'], 'Pune')
        self.assertGreater(len(data['recommendations']), 0)

    def test_compare_places(self):
        """Test side-by-side comparison of 2 places."""
        payload = {
            "place_id_1": "skyline-observatory",
            "place_id_2": "lantern-night-market"
        }
        response = self.client.post('/api/compare', json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['success'])
        self.assertIn('metrics', data['data'])
        self.assertEqual(len(data['data']['metrics']), 6)

    def test_citizen_report_submission_with_city(self):
        """Test citizen report validation and successful persistence with city tag."""
        # Test validation error on empty fields
        bad_resp = self.client.post('/api/safety-reports', json={"category": ""})
        self.assertEqual(bad_resp.status_code, 400)

        # Valid report with city
        valid_payload = {
            "city": "Pune",
            "category": "Pedestrian Safety",
            "location": "FC Road Footpath",
            "description": "Footpath paving uneven near Fergusson College gate; watch your step.",
            "severity": "Low"
        }
        good_resp = self.client.post('/api/safety-reports', json=valid_payload)
        self.assertEqual(good_resp.status_code, 201)
        created_data = good_resp.get_json()
        self.assertTrue(created_data['success'])
        self.assertEqual(created_data['data']['city'], 'Pune')

    def test_city_insights_and_weather(self):
        """Test insights dashboard data delivery for dynamic city."""
        response = self.client.get('/api/city-insights?city=Pune')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['success'])
        self.assertIn('weather', data['data'])
        self.assertIn('temperature', data['data']['weather'])

if __name__ == '__main__':
    unittest.main()
