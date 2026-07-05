"""
Quote Generator Backend — Flask API with SQLite storage.

Endpoints:
    GET  /quotes/random  — Proxy to ZenQuotes API (avoids CORS)
    POST /quotes         — Save a quote to the database
    GET  /quotes         — Retrieve all saved quotes (newest first)
"""

import sqlite3
import os
import html
from datetime import datetime, timezone

from flask import Flask, request, jsonify, g
from flask_cors import CORS
import requests as http_requests

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app)

DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "quotes.db")

# ---------------------------------------------------------------------------
# Fallback quotes (used when external API is unavailable)
# ---------------------------------------------------------------------------
FALLBACK_QUOTES = [
    {"quote": "The best way to predict the future is to create it.", "author": "Peter Drucker"},
    {"quote": "In the middle of difficulty lies opportunity.", "author": "Albert Einstein"},
    {"quote": "Act as if what you do makes a difference. It does.", "author": "William James"},
    {"quote": "The only way to do great work is to love what you do.", "author": "Steve Jobs"},
    {"quote": "Believe you can and you're halfway there.", "author": "Theodore Roosevelt"},
    {"quote": "What we think, we become.", "author": "Buddha"},
    {"quote": "Strive not to be a success, but rather to be of value.", "author": "Albert Einstein"},
    {"quote": "The mind is everything. What you think you become.", "author": "Buddha"},
    {"quote": "An unexamined life is not worth living.", "author": "Socrates"},
    {"quote": "Happiness is not something ready made. It comes from your own actions.", "author": "Dalai Lama"},
]

_fallback_index = 0

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db():
    """Return a database connection for the current request."""
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception):
    """Close the database connection at the end of the request."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Create the quotes table if it doesn't exist."""
    conn = sqlite3.connect(DATABASE)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS quotes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            quote      TEXT NOT NULL,
            author     VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Input helpers
# ---------------------------------------------------------------------------

def sanitize(text: str) -> str:
    """Strip and HTML-escape user-provided text."""
    return html.escape(text.strip())


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/quotes/random", methods=["GET"])
def random_quote():
    """Proxy endpoint — fetch a random quote from ZenQuotes."""
    global _fallback_index

    try:
        resp = http_requests.get(
            "https://zenquotes.io/api/random",
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()

        if isinstance(data, list) and len(data) > 0:
            item = data[0]
            quote_text = item.get("q", "")
            author = item.get("a", "Unknown Author")
            if not quote_text:
                raise ValueError("Empty quote from API")
            return jsonify({"quote": quote_text, "author": author}), 200

        raise ValueError("Unexpected response format")

    except Exception:
        # Fallback: cycle through built-in quotes
        fallback = FALLBACK_QUOTES[_fallback_index % len(FALLBACK_QUOTES)]
        _fallback_index += 1
        return jsonify(fallback), 200


@app.route("/quotes", methods=["POST"])
def save_quote():
    """Save a quote to the database."""
    body = request.get_json(silent=True)

    if not body:
        return jsonify({"error": "Request body must be valid JSON."}), 400

    raw_quote = body.get("quote", "")
    raw_author = body.get("author", "")

    if not raw_quote or not raw_quote.strip():
        return jsonify({"error": "Quote text is required."}), 400

    quote_text = sanitize(raw_quote)
    author = sanitize(raw_author) if raw_author and raw_author.strip() else "Unknown Author"

    db = get_db()
    cursor = db.execute(
        "INSERT INTO quotes (quote, author) VALUES (?, ?)",
        (quote_text, author),
    )
    db.commit()

    # Retrieve the saved row
    row = db.execute("SELECT * FROM quotes WHERE id = ?", (cursor.lastrowid,)).fetchone()

    return jsonify({
        "id": row["id"],
        "quote": row["quote"],
        "author": row["author"],
        "created_at": row["created_at"],
    }), 201


@app.route("/quotes", methods=["GET"])
def get_quotes():
    """Retrieve all quotes, newest first."""
    db = get_db()
    rows = db.execute("SELECT * FROM quotes ORDER BY created_at DESC").fetchall()

    quotes = [
        {
            "id": row["id"],
            "quote": row["quote"],
            "author": row["author"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]
    return jsonify(quotes), 200


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    init_db()
    print(f"  Database: {DATABASE}")
    print("  Endpoints:")
    print("    GET  /quotes/random")
    print("    POST /quotes")
    print("    GET  /quotes")
    app.run(debug=True, port=5000)
