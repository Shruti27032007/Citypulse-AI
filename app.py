import json
import os
import uuid
from datetime import datetime
from flask import Flask, jsonify, render_template, request, abort

from services.city_service import (
    search_cities,
    get_complete_city_info,
    fetch_live_weather,
    EMERGENCY_NUMBERS,
    load_cache
)

app = Flask(__name__)

# File paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PLACES_FILE = os.path.join(BASE_DIR, "data", "places.json")
INSIGHTS_FILE = os.path.join(BASE_DIR, "data", "insights.json")

# Support Vercel serverless environment where root filesystem is read-only
if os.environ.get("VERCEL"):
    REPORTS_FILE = "/tmp/reports.json"
    if not os.path.exists(REPORTS_FILE) and os.path.exists(os.path.join(BASE_DIR, "data", "reports.json")):
        import shutil
        try:
            shutil.copy(os.path.join(BASE_DIR, "data", "reports.json"), REPORTS_FILE)
        except Exception:
            pass
else:
    REPORTS_FILE = os.path.join(BASE_DIR, "data", "reports.json")


def load_json_file(filepath, default=None):
    """Safely load JSON data from disk."""
    if not os.path.exists(filepath):
        return default if default is not None else []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        app.logger.error(f"Error loading {filepath}: {e}")
        return default if default is not None else []


def save_json_file(filepath, data):
    """Safely write JSON data to disk."""
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        app.logger.error(f"Error saving {filepath}: {e}")
        return False


def get_all_places_pool():
    """Aggregate places from both default dataset and all cached dynamic cities."""
    pool = load_json_file(PLACES_FILE, [])
    cache = load_cache()
    seen_ids = {p.get("id") for p in pool}
    for city_key, city_obj in cache.items():
        for cp in city_obj.get("places", []):
            if cp.get("id") not in seen_ids:
                pool.append(cp)
                seen_ids.add(cp.get("id"))
    return pool


# -------------------------------------------------------------
# Frontend Routes
# -------------------------------------------------------------

@app.route("/")
def index():
    """Main application landing page and single-page dashboard."""
    places = load_json_file(PLACES_FILE, [])
    reports = load_json_file(REPORTS_FILE, [])
    insights = load_json_file(INSIGHTS_FILE, {})
    return render_template("index.html", places=places, reports=reports, insights=insights)


# -------------------------------------------------------------
# REST API: Universal City Search & Dynamic Details
# -------------------------------------------------------------

@app.route("/api/city/search", methods=["GET"])
def api_city_search():
    """
    Search for ANY city or destination worldwide using OpenStreetMap Nominatim.
    Query: ?q=<search term>
    """
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"success": True, "count": 0, "results": []})

    results = search_cities(query)
    return jsonify({
        "success": True,
        "query": query,
        "count": len(results),
        "results": results
    })


@app.route("/api/city/details", methods=["GET"])
def api_city_details():
    """
    Retrieve dynamic city overview, live Open-Meteo weather,
    emergency contact numbers, and discovered POIs.
    Query: ?name=<city name>
    """
    city_name = request.args.get("name", "").strip()
    if not city_name:
        return jsonify({"success": False, "error": "City name is required"}), 400

    city_data = get_complete_city_info(city_name)
    if not city_data:
        return jsonify({
            "success": False,
            "error": f"City '{city_name}' could not be resolved. Please try checking the spelling or specifying country."
        }), 404

    return jsonify({
        "success": True,
        "data": city_data
    })


# -------------------------------------------------------------
# REST API: Places Explorer (With Dynamic City Switching)
# -------------------------------------------------------------

@app.route("/api/places", methods=["GET"])
def get_places():
    """
    Search, filter, and sort city destinations.
    Query params:
      - city: name of city (e.g. Pune, Mumbai, London, or empty for default)
      - search: string keyword
      - category: tourist, historical, food, parks, budget, hotels, all
      - sort: rating, price_asc, price_desc, name, safety, distance
      - max_budget: 1 (budget), 2 (moderate), 3 (premium)
    """
    city_param = request.args.get("city", "").strip()
    active_city_name = "Metropolis Central"

    if city_param and city_param.lower() not in ["all", "default"]:
        city_info = get_complete_city_info(city_param)
        if city_info and city_info.get("places"):
            places = city_info["places"]
            active_city_name = city_info["city_name"]
        else:
            places = load_json_file(PLACES_FILE, [])
    else:
        places = load_json_file(PLACES_FILE, [])

    search_query = request.args.get("search", "").strip().lower()
    category = request.args.get("category", "all").strip().lower()
    sort_by = request.args.get("sort", "rating").strip().lower()
    max_budget = request.args.get("max_budget", type=int)

    # 1. Filter by category
    if category and category != "all":
        places = [p for p in places if p.get("category", "").lower() == category]

    # 2. Filter by search query
    if search_query:
        def match_place(p):
            haystack = " ".join([
                p.get("name", ""),
                p.get("tagline", ""),
                p.get("description", ""),
                p.get("location", ""),
                p.get("category_label", ""),
                " ".join(p.get("interests", [])),
                " ".join(p.get("highlights", []))
            ]).lower()
            return search_query in haystack

        places = [p for p in places if match_place(p)]

    # 3. Filter by max budget tier if specified
    if max_budget and max_budget in [1, 2, 3]:
        places = [p for p in places if p.get("budget_numeric", 1) <= max_budget]

    # 4. Sorting
    if sort_by == "rating":
        places.sort(key=lambda x: x.get("rating", 0), reverse=True)
    elif sort_by == "price_asc":
        places.sort(key=lambda x: x.get("budget_numeric", 1))
    elif sort_by == "price_desc":
        places.sort(key=lambda x: x.get("budget_numeric", 1), reverse=True)
    elif sort_by == "name":
        places.sort(key=lambda x: x.get("name", "").lower())
    elif sort_by == "safety":
        places.sort(key=lambda x: x.get("safety_score", 0), reverse=True)
    elif sort_by == "distance":
        places.sort(key=lambda x: x.get("distance_km", 999))

    return jsonify({
        "success": True,
        "city": active_city_name,
        "count": len(places),
        "data": places
    })


@app.route("/api/places/<place_id>", methods=["GET"])
def get_place_detail(place_id):
    """Retrieve full detail for a single place across default and dynamic catalogs."""
    places = get_all_places_pool()
    place = next((p for p in places if p.get("id") == place_id), None)
    if not place:
        return jsonify({"success": False, "error": "Place not found"}), 404
    return jsonify({"success": True, "data": place})


# -------------------------------------------------------------
# REST API: CityPulse Smart Match (Dynamic City Recommendation)
# -------------------------------------------------------------

@app.route("/api/smart-match", methods=["POST"])
def smart_match():
    """
    Genuine rule-based recommendation algorithm that dynamically scores
    and justifies recommendations for the chosen city based on user selections:
    Body:
      - city: string (optional, e.g. Pune, London, Mumbai)
      - interests: list of strings (e.g. ['Culinary & Street Food', 'Budget Travel'])
      - budget: 'free_budget' (tier 1), 'moderate' (tier 2), 'any' (tier 3)
      - category: 'all' or specific category
      - max_distance: float in km (optional)
      - accessibility_priority: bool (optional)
    """
    payload = request.get_json(silent=True) or {}
    city_param = payload.get("city", "").strip()
    user_interests = payload.get("interests", [])
    user_budget = payload.get("budget", "any")  # 'free_budget', 'moderate', 'any'
    user_category = payload.get("category", "all")
    max_distance = payload.get("max_distance")
    accessibility_priority = payload.get("accessibility_priority", False)

    active_city_name = "Metropolis Central"
    if city_param and city_param.lower() not in ["all", "default"]:
        city_info = get_complete_city_info(city_param)
        if city_info and city_info.get("places"):
            places = city_info["places"]
            active_city_name = city_info["city_name"]
        else:
            places = load_json_file(PLACES_FILE, [])
    else:
        places = load_json_file(PLACES_FILE, [])

    scored_results = []

    for p in places:
        score = 40.0  # Base viability score
        reasons = []

        # Category affinity
        if user_category and user_category != "all":
            if p.get("category") == user_category:
                score += 25.0
                reasons.append(f"Direct match for requested category '{p.get('category_label')}'.")
            else:
                score -= 15.0

        # Interests overlap
        place_interests = set(p.get("interests", []))
        matched_interests = [i for i in user_interests if i in place_interests]
        if user_interests:
            overlap_ratio = len(matched_interests) / max(len(user_interests), 1)
            score += overlap_ratio * 35.0
            if matched_interests:
                reasons.append(f"Matches your passion for {', '.join(matched_interests)}.")
        else:
            score += 10.0  # Neutral interest score

        # Budget alignment
        budget_tier = p.get("budget_numeric", 1)
        if user_budget == "free_budget":
            if budget_tier == 1:
                score += 20.0
                reasons.append(f"Fits your budget goal with affordable pricing ({p.get('cost_estimate')}).")
            else:
                score -= 20.0
        elif user_budget == "moderate":
            if budget_tier <= 2:
                score += 15.0
                reasons.append(f"Balanced pricing fitting moderate budget ({p.get('cost_estimate')}).")
            else:
                score -= 10.0
        else:
            score += 10.0

        # Accessibility priority bonus
        if accessibility_priority:
            acc_score = p.get("accessibility_score", 3)
            if acc_score >= 4:
                score += 12.0
                reasons.append(f"High accessibility rating ({acc_score}/5 with barrier-free facilities).")
            else:
                score -= 8.0

        # Distance factor
        if max_distance is not None:
            try:
                max_d = float(max_distance)
                place_d = float(p.get("distance_km", 999))
                if place_d <= max_d:
                    score += 10.0
                    reasons.append(f"Close to city hub ({place_d} km away, well within your {max_d} km limit).")
                else:
                    score -= (place_d - max_d) * 4.0
            except (ValueError, TypeError):
                pass

        # Rating quality booster
        rating = p.get("rating", 4.0)
        score += (rating - 4.0) * 10.0

        # Cap score between 45% and 99%
        final_score = int(min(99, max(48, round(score))))

        # Fallback reason if none triggered
        if not reasons:
            reasons.append(f"High community rating ({p.get('rating')}/5.0) in {p.get('location')}.")

        # Match badge
        if final_score >= 90:
            badge = "Exceptional Match"
            badge_color = "emerald"
        elif final_score >= 75:
            badge = "Great Fit"
            badge_color = "teal"
        else:
            badge = "Good Alternative"
            badge_color = "blue"

        scored_results.append({
            "place": p,
            "match_score": final_score,
            "match_badge": badge,
            "badge_color": badge_color,
            "reasons": reasons[:3]
        })

    # Sort descending by match score
    scored_results.sort(key=lambda x: x["match_score"], reverse=True)

    return jsonify({
        "success": True,
        "city": active_city_name,
        "query_summary": {
            "city": active_city_name,
            "interests_count": len(user_interests),
            "budget_filter": user_budget,
            "category_filter": user_category
        },
        "recommendations": scored_results[:6]
    })


# -------------------------------------------------------------
# REST API: Compare Places
# -------------------------------------------------------------

@app.route("/api/compare", methods=["POST"])
def compare_places():
    """
    Compare two places side-by-side across budget, ratings, accessibility,
    cleanliness, distance, and safety.
    """
    payload = request.get_json(silent=True) or {}
    id1 = payload.get("place_id_1")
    id2 = payload.get("place_id_2")
    city_param = payload.get("city", "").strip()

    if not id1 or not id2:
        return jsonify({"success": False, "error": "Both place_id_1 and place_id_2 are required"}), 400

    if id1 == id2:
        return jsonify({"success": False, "error": "Please select two different places to compare"}), 400

    # Search in city places first, then pool
    places_pool = get_all_places_pool()
    if city_param and city_param.lower() not in ["all", "default"]:
        city_info = get_complete_city_info(city_param)
        if city_info and city_info.get("places"):
            places_pool = city_info["places"] + places_pool

    p1 = next((p for p in places_pool if p.get("id") == id1), None)
    p2 = next((p for p in places_pool if p.get("id") == id2), None)

    if not p1 or not p2:
        return jsonify({"success": False, "error": "One or both selected places were not found"}), 404

    # Build comparison metric matrix
    comparison = {
        "place_1": p1,
        "place_2": p2,
        "metrics": [
            {
                "label": "Cost / Affordability",
                "val1": p1.get("cost_estimate", "Not available"),
                "val2": p2.get("cost_estimate", "Not available"),
                "winner": "place_1" if p1.get("budget_numeric", 9) < p2.get("budget_numeric", 9) else ("place_2" if p2.get("budget_numeric", 9) < p1.get("budget_numeric", 9) else "tie"),
                "note": "Labelled estimate or verified entry fee."
            },
            {
                "label": "Community Rating",
                "val1": f"{p1.get('rating', 'N/A')} ★ ({p1.get('reviews_count', 0):,} reviews)",
                "val2": f"{p2.get('rating', 'N/A')} ★ ({p2.get('reviews_count', 0):,} reviews)",
                "winner": "place_1" if p1.get("rating", 0) > p2.get("rating", 0) else ("place_2" if p2.get("rating", 0) > p1.get("rating", 0) else "tie"),
                "note": "Aggregated user feedback score."
            },
            {
                "label": "Accessibility Rating",
                "val1": f"{p1.get('accessibility_score', 'N/A')}/5 • {p1.get('accessibility', 'Not available')}",
                "val2": f"{p2.get('accessibility_score', 'N/A')}/5 • {p2.get('accessibility', 'Not available')}",
                "winner": "place_1" if p1.get("accessibility_score", 0) > p2.get("accessibility_score", 0) else ("place_2" if p2.get("accessibility_score", 0) > p1.get("accessibility_score", 0) else "tie"),
                "note": "Step-free, elevators, or local transit accommodations."
            },
            {
                "label": "Cleanliness Index",
                "val1": f"{p1.get('cleanliness_rating', 'Not available')}/5.0",
                "val2": f"{p2.get('cleanliness_rating', 'Not available')}/5.0",
                "winner": "place_1" if p1.get("cleanliness_rating", 0) > p2.get("cleanliness_rating", 0) else ("place_2" if p2.get("cleanliness_rating", 0) > p1.get("cleanliness_rating", 0) else "tie"),
                "note": "Hygiene inspection and visitor reports."
            },
            {
                "label": "Proximity to City Center",
                "val1": f"{p1.get('distance_km', 'Not available')} km",
                "val2": f"{p2.get('distance_km', 'Not available')} km",
                "winner": "place_1" if p1.get("distance_km", 99) < p2.get("distance_km", 99) else ("place_2" if p2.get("distance_km", 99) < p1.get("distance_km", 99) else "tie"),
                "note": "Distance from central geographic centroid."
            },
            {
                "label": "Safety Score & Advisory",
                "val1": f"{p1.get('safety_score', 'Not available')}/10 • {p1.get('safety_advisory', '')}",
                "val2": f"{p2.get('safety_score', 'Not available')}/10 • {p2.get('safety_advisory', '')}",
                "winner": "place_1" if p1.get("safety_score", 0) > p2.get("safety_score", 0) else ("place_2" if p2.get("safety_score", 0) > p1.get("safety_score", 0) else "tie"),
                "note": "Patrol density, illumination, and incident reports."
            }
        ]
    }

    return jsonify({"success": True, "data": comparison})


# -------------------------------------------------------------
# REST API: Safety Intelligence & Citizen Reporting
# -------------------------------------------------------------

@app.route("/api/safety-reports", methods=["GET"])
def get_safety_reports():
    """Retrieve community safety & citizen reports with city emergency numbers."""
    reports = load_json_file(REPORTS_FILE, [])
    category_filter = request.args.get("category")
    status_filter = request.args.get("status")
    city_filter = request.args.get("city", "").strip()

    emergency_data = EMERGENCY_NUMBERS.get("default")
    if city_filter and city_filter.lower() not in ["all", "default"]:
        city_info = get_complete_city_info(city_filter)
        if city_info and city_info.get("emergency"):
            emergency_data = city_info["emergency"]
        # Match city in location, city tag, or description
        city_reports = [r for r in reports if r.get("city", "").lower() == city_filter.lower() or city_filter.lower() in r.get("location", "").lower()]
        if city_reports:
            reports = city_reports

    if category_filter and category_filter != "all":
        reports = [r for r in reports if r.get("category", "").lower() == category_filter.lower()]

    if status_filter == "verified":
        reports = [r for r in reports if r.get("is_verified") is True]
    elif status_filter == "unverified":
        reports = [r for r in reports if r.get("is_verified") is False]

    return jsonify({
        "success": True,
        "count": len(reports),
        "data": reports,
        "emergency": emergency_data,
        "disclaimer": "Sample seed data is labelled. Absence of incident reports does not guarantee safety. In emergencies, contact local emergency services immediately."
    })


@app.route("/api/safety-reports", methods=["POST"])
def submit_safety_report():
    """
    Submit a citizen safety report with city tag.
    Persists report to data/reports.json.
    """
    payload = request.get_json(silent=True) or {}
    category = payload.get("category", "").strip()
    description = payload.get("description", "").strip()
    location = payload.get("location", "").strip()
    severity = payload.get("severity", "Moderate").strip()
    photo_url = payload.get("photo_url", "").strip()
    city = payload.get("city", "Metropolis Central").strip()

    # Field validations
    errors = []
    if not category:
        errors.append("Please select a report category.")
    if not location or len(location) < 3:
        errors.append("Please provide a valid location or landmark (at least 3 characters).")
    if not description or len(description) < 8:
        errors.append("Please write a meaningful description of the situation (at least 8 characters).")

    if errors:
        return jsonify({"success": False, "errors": errors}), 400

    new_report = {
        "id": f"cit-{uuid.uuid4().hex[:6]}",
        "city": city,
        "category": category,
        "category_label": f"{category} Alert",
        "location": location,
        "description": description,
        "severity": severity,
        "status": "Community Submitted (Awaiting Verification)",
        "is_verified": False,
        "timestamp": datetime.now().strftime("Today, %I:%M %p"),
        "upvotes": 1,
        "source_type": "Citizen Report (Live Submission)",
        "photo_url": photo_url if photo_url else None,
        "is_sample": False
    }

    reports = load_json_file(REPORTS_FILE, [])
    reports.insert(0, new_report)

    saved = save_json_file(REPORTS_FILE, reports)
    if not saved:
        return jsonify({"success": False, "error": "Internal error: could not persist report"}), 500

    return jsonify({
        "success": True,
        "message": f"Citizen report for {city} submitted successfully! It has been posted to the live community feed.",
        "data": new_report
    }), 201


@app.route("/api/safety-reports/<report_id>/upvote", methods=["POST"])
def upvote_report(report_id):
    """Allow citizens to verify/upvote existing community reports."""
    reports = load_json_file(REPORTS_FILE, [])
    report = next((r for r in reports if r.get("id") == report_id), None)
    if not report:
        return jsonify({"success": False, "error": "Report not found"}), 404

    report["upvotes"] = report.get("upvotes", 0) + 1
    if report.get("upvotes") >= 5 and not report.get("is_verified"):
        report["status"] = "Community Confirmed (5+ Citizen Endorsements)"

    save_json_file(REPORTS_FILE, reports)
    return jsonify({"success": True, "upvotes": report["upvotes"], "status": report["status"]})


# -------------------------------------------------------------
# REST API: City Insights & Telemetry
# -------------------------------------------------------------

@app.route("/api/city-insights", methods=["GET"])
def get_city_insights():
    """Retrieve city telemetry data, live weather, and environmental conditions."""
    city_filter = request.args.get("city", "").strip()
    insights = load_json_file(INSIGHTS_FILE, {})
    reports = load_json_file(REPORTS_FILE, [])
    places = load_json_file(PLACES_FILE, [])

    if city_filter and city_filter.lower() not in ["all", "default"]:
        city_info = get_complete_city_info(city_filter)
        if city_info:
            insights["city_name"] = city_info["city_name"]
            insights["weather"] = city_info.get("weather", insights.get("weather"))
            insights["coordinates"] = {"lat": city_info.get("lat"), "lon": city_info.get("lon")}
            insights["country"] = city_info.get("country")
            insights["data_status"] = "Live Meteorological Feed (Open-Meteo) & OpenStreetMap"
            insights["disclaimer"] = "Atmospheric data is real-time from Open-Meteo. Traffic zones reflect municipal open standards."
            if city_info.get("places"):
                places = city_info["places"]

    insights["live_summary"] = {
        "active_citizen_reports": len(reports),
        "verified_reports_count": len([r for r in reports if r.get("is_verified")]),
        "cataloged_destinations": len(places),
        "last_telemetry_sync": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    return jsonify({
        "success": True,
        "data": insights
    })


# -------------------------------------------------------------
# REST API: Quick Stats for Header & Hero
# -------------------------------------------------------------

@app.route("/api/stats", methods=["GET"])
def get_stats():
    """Quick statistics for landing hero indicators."""
    places = get_all_places_pool()
    reports = load_json_file(REPORTS_FILE, [])
    cache = load_cache()
    return jsonify({
        "success": True,
        "destinations_count": len(places),
        "cities_indexed": max(3, len(cache)),
        "reports_count": len(reports),
        "verified_reports": len([r for r in reports if r.get("is_verified")]),
        "avg_safety_score": round(sum(p.get("safety_score", 9.0) for p in places) / max(len(places), 1), 1)
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True, use_reloader=False)
