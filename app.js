/**
 * Quote Generator with History — Client-side Application Logic
 *
 * Responsibilities:
 *   - Fetch random quotes via the backend proxy (GET /quotes/random)
 *   - Save quotes to the backend (POST /quotes)
 *   - Load and display quote history (GET /quotes)
 *   - Dynamic UI updates, loading/error states
 */

(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  const API_BASE = "http://localhost:5000";

  // ---------------------------------------------------------------------------
  // DOM References
  // ---------------------------------------------------------------------------
  const btnGenerate       = document.getElementById("btn-generate");
  const currentQuoteSec   = document.getElementById("current-quote");
  const currentQuoteText  = document.getElementById("current-quote-text");
  const currentQuoteAuthor= document.getElementById("current-quote-author");
  const historyLoading    = document.getElementById("history-loading");
  const historyEmpty      = document.getElementById("history-empty");
  const historyList       = document.getElementById("history-list");
  const historyCount      = document.getElementById("history-count");
  const errorToast        = document.getElementById("error-toast");
  const errorToastMessage = document.getElementById("error-toast-message");

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let isGenerating = false;
  let toastTimer   = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Show a toast error message for a few seconds.
   */
  function showError(message) {
    errorToastMessage.textContent = message;
    errorToast.hidden = false;
    // Force reflow so the transition triggers
    void errorToast.offsetWidth;
    errorToast.classList.add("is-visible");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      errorToast.classList.remove("is-visible");
      setTimeout(() => { errorToast.hidden = true; }, 400);
    }, 4500);
  }

  /**
   * Format an ISO timestamp to a user-friendly relative or absolute string.
   */
  function formatTime(isoString) {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;

      const now  = new Date();
      const diff = (now - date) / 1000; // seconds

      if (diff < 60)    return "Just now";
      if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;

      return date.toLocaleDateString("en-US", {
        month: "short",
        day:   "numeric",
        year:  date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
        hour:  "2-digit",
        minute:"2-digit",
      });
    } catch {
      return isoString;
    }
  }

  /**
   * Create a history card DOM element.
   */
  function createHistoryCard(quote, animate = false) {
    const li = document.createElement("li");
    li.className = "history-card" + (animate ? " card-enter" : "");

    const qDiv = document.createElement("p");
    qDiv.className = "history-card__quote";
    qDiv.textContent = quote.quote;

    const meta = document.createElement("div");
    meta.className = "history-card__meta";

    const author = document.createElement("span");
    author.className = "history-card__author";
    author.textContent = quote.author || "Unknown Author";

    const time = document.createElement("span");
    time.className = "history-card__time";
    time.textContent = formatTime(quote.created_at);

    meta.appendChild(author);
    meta.appendChild(time);
    li.appendChild(qDiv);
    li.appendChild(meta);

    return li;
  }

  /**
   * Update the history count badge.
   */
  function updateCount(count) {
    historyCount.textContent = `${count} quote${count !== 1 ? "s" : ""}`;
  }

  // ---------------------------------------------------------------------------
  // API Calls
  // ---------------------------------------------------------------------------

  /**
   * Load all saved quotes from the backend.
   */
  async function loadHistory() {
    historyLoading.hidden = false;
    historyEmpty.hidden   = true;
    historyList.innerHTML = "";

    try {
      const resp = await fetch(`${API_BASE}/quotes`);
      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);

      const quotes = await resp.json();

      historyLoading.hidden = true;

      if (quotes.length === 0) {
        historyEmpty.hidden = false;
        updateCount(0);
        return;
      }

      quotes.forEach((q) => {
        historyList.appendChild(createHistoryCard(q, false));
      });
      updateCount(quotes.length);

    } catch (err) {
      historyLoading.hidden = true;
      historyEmpty.hidden   = false;
      showError("Could not load quote history. Is the backend running?");
      console.error("loadHistory error:", err);
    }
  }

  /**
   * Fetch a random quote through the backend proxy.
   */
  async function fetchRandomQuote() {
    const resp = await fetch(`${API_BASE}/quotes/random`);
    if (!resp.ok) throw new Error(`Quote API responded ${resp.status}`);
    return resp.json(); // { quote, author }
  }

  /**
   * Save a quote to the backend.
   */
  async function saveQuote(quote, author) {
    const resp = await fetch(`${API_BASE}/quotes`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ quote, author }),
    });
    if (!resp.ok) throw new Error(`Save failed with status ${resp.status}`);
    return resp.json(); // { id, quote, author, created_at }
  }

  // ---------------------------------------------------------------------------
  // Generate Flow
  // ---------------------------------------------------------------------------

  async function handleGenerate() {
    if (isGenerating) return;
    isGenerating = true;

    btnGenerate.classList.add("is-loading");
    btnGenerate.disabled = true;

    try {
      // 1. Fetch random quote
      const data = await fetchRandomQuote();
      const quoteText = data.quote;
      const author    = data.author || "Unknown Author";

      // 2. Display current quote
      currentQuoteText.textContent   = quoteText;
      currentQuoteAuthor.textContent = author;
      currentQuoteSec.hidden         = false;

      // Re-trigger animation
      const card = currentQuoteSec.querySelector(".current-quote__card");
      card.classList.remove("quote-enter");
      void card.offsetWidth; // reflow
      card.classList.add("quote-enter");

      // 3. Save to backend
      let savedQuote;
      try {
        savedQuote = await saveQuote(quoteText, author);
      } catch (saveErr) {
        showError("Quote fetched but could not be saved. Backend may be unavailable.");
        console.error("saveQuote error:", saveErr);
        return; // still show the quote, just don't update history
      }

      // 4. Prepend to history
      historyEmpty.hidden = true;
      const newCard = createHistoryCard(savedQuote, true);
      historyList.prepend(newCard);
      updateCount(historyList.children.length);

    } catch (err) {
      showError("Could not generate a quote. Please check your connection and try again.");
      console.error("handleGenerate error:", err);
    } finally {
      isGenerating = false;
      btnGenerate.classList.remove("is-loading");
      btnGenerate.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  btnGenerate.addEventListener("click", handleGenerate);
  loadHistory();
})();
