"use strict";

(() => {

    // === App State Setup ===

    // Stores all available coins
    let allCoins = [];

    // Stores up to 5 selected coin IDs
    const selectedCoins = new Set();

    // === Initialization Logic ===

    window.addEventListener("load", async () => {
        try {
            setupSearchInput();       // Set up live search input and clear button
            setupDialogBehavior();    // Initialize dialog buttons and handlers

            allCoins = loadCoins();   // Try to load coin data from cache
            if (!allCoins) {
                allCoins = await getCoins();   // Fetch from API if not cached
                saveCoins(allCoins);           // Save fetched data to cache
            }

            displayAllCards(allCoins); // Render all coin cards
            restoreSwitchStates();     // Restore toggle states from previous session

        } catch (err) {
            alert(err.message);
        }
    });

    // === Data Fetching & Caching ==

    // Fetch coin data from CoinGecko API
    async function getCoins() {
        const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd";
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch coins.");

        const coins = await response.json();
        if (!Array.isArray(coins)) throw new Error("Invalid coin data received.");
        return coins;
    }

    // Save coin data to localStorage
    function saveCoins(allCoins) {
        try {
            const json = JSON.stringify(allCoins);
            localStorage.setItem("coins", json);
        } catch {
            throw new Error("Failed to save coins to localStorage.");
        }
    }

    // Load coin data from localStorage
    function loadCoins() {
        try {
            const json = localStorage.getItem("coins");
            const parsed = JSON.parse(json);
            return Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }

    // === Display Functions ==

    // Display all coin cards in the container
    function displayAllCards(coins) {
        const container = document.getElementById("cardsContainer");
        if (!container) return;

        container.innerHTML = "";
        for (const coin of coins) {
            const card = displayCoinCard(coin);
            container.appendChild(card);
        }
    }

    // Create and return a coin card element
    function displayCoinCard(coin) {
        const card = createCardElement(coin);
        attachCardEventListeners(card, coin);
        return card;
    }

    // Create the HTML structure for a coin card
    function createCardElement(coin) {
        const card = document.createElement("div");
        card.className = "coin-card";
        card.dataset.name = coin.name;
        card.innerHTML = `
                <div class="card-inner">
                    <div class="card-front">
                        <div class="switch-wrapper">
                            <label class="switch-label">
                                <input type="checkbox" data-id="${coin.id}" class="coin-switch">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <img src="${coin.image}" alt="${coin.name}" class="coin-icon" />
                        <h3>${coin.name}</h3>
                        <h5>${coin.symbol.toUpperCase()}</h5>
                        <button class="info-btn">More Info</button>
                    </div>
                    <div class="card-back">
                        <div class="card-content">
                            <p class="loading-msg">Loading...</p>
                        </div>
                        <button class="back-btn">Back</button>
                    </div>
                </div>
            `;
        return card;
    }

    // Attach event listeners to a coin card
    function attachCardEventListeners(card, coin) {
        const button = card.querySelector(".info-btn");
        if (button) {
            button.addEventListener("click", () => handleMoreInfoClick(coin.id, card));
        }

        const checkbox = card.querySelector(".coin-switch");
        if (checkbox) {
            checkbox.addEventListener("change", (event) => {
                handleSwitchToggle(coin.id, event.target.checked);
            });
        }
    }

    // === Search Functions ==

    // Get references to search input and clear button
    function getSearchElements() {
        const searchInput = document.getElementById("searchInput");
        const clearBtn = document.getElementById("clearBtn");
        if (!searchInput || !clearBtn) return null;
        return { searchInput, clearBtn };
    }

    // Set up input events for search functionality
function setupSearchInput() {
    const elements = getSearchElements();
    if (!elements) return;
    const { searchInput, clearBtn } = elements;

    // Typing in input triggers filtering (only on index.html)
    searchInput.addEventListener("input", () => {
        clearBtn.style.display = searchInput.value ? "block" : "none";

        // Only call filterCoinsBySearch if this page supports it
        if (typeof filterCoinsBySearch === "function") {
            filterCoinsBySearch(searchInput.value);
        }
    });

    // Pressing Enter redirects to index.html with query
    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const query = searchInput.value.trim();
            if (query) {
                window.location.href = `index.html?q=${encodeURIComponent(query)}`;
            }
        }
    });

    setupClearSearch(); // Optional clear button
}


    // Set up clear button for search input
    function setupClearSearch() {
        const { searchInput, clearBtn } = getSearchElements();
        if (!searchInput || !clearBtn) return;

        clearBtn.addEventListener("click", () => {
            searchInput.value = "";
            clearBtn.style.display = "none";
            searchInput.focus();
            filterCoinsBySearch("");
        });
    }

    // Filter and display coins based on search query
    function filterCoinsBySearch(query) {
        const lowerQuery = query.toLowerCase();
        const filtered = allCoins.filter(coin =>
            coin.name.toLowerCase().includes(lowerQuery) ||
            coin.symbol.toLowerCase().includes(lowerQuery)
        );
        displayAllCards(filtered);
    }

    // === "More Info" Functions ===

    // Handle "More Info" button click
    async function handleMoreInfoClick(coinId, card) {
        const back = card.querySelector(".card-back");

        // If card is already flipped, unflip it
        if (card.classList.contains("flipped")) {
            card.classList.remove("flipped");
            return;
        }

        // Prevent multiple clicks while loading
        if (card.dataset.loading === "true") return;
        card.dataset.loading = "true";

        // Flip the card
        card.classList.add("flipped");

        if (!back.dataset.loaded) {
            injectBackLayout(back);
            try {
                await populateBackWithPrices(coinId, back);
                back.dataset.loaded = "true";
            } catch {
                const content = back.querySelector(".card-content");
                content.innerHTML = `<p class="error-message">Failed to load prices. <br><br>Please wait a moment<br>and try again later.</p>`;
            } finally {
                card.dataset.loading = "false";
            }

            setupBackButton(card, back);
        } else {
            card.dataset.loading = "false";
        }
    }

    // Replace back side content layout
    function injectBackLayout(back) {
        back.innerHTML = `
                <div class="card-back-inner">
                    <div class="card-content"></div>
                    <button class="back-btn">Back</button>
                </div>
            `;
    }

    // Fetch and insert live coin prices into back of the card
    async function populateBackWithPrices(coinId, back) {
        const prices = await fetchCoinPrices(coinId);
        const content = back.querySelector(".card-content");

        content.innerHTML = `
                <div class="price-row"><span class="symbol">$</span><span>${prices.usd} (USD)</span></div>
                <div class="price-row"><span class="symbol">€</span><span>${prices.eur} (EUR)</span></div>
                <div class="price-row"><span class="symbol">₪</span><span>${prices.ils} (ILS)</span></div>
            `;
    }

    // Setup back button to unflip card
    function setupBackButton(card, back) {
        const backBtn = back.querySelector(".back-btn");
        backBtn.addEventListener("click", () => {
            card.classList.remove("flipped");
        });
    }

    // Fetch live prices for a specific coin
    async function fetchCoinPrices(coinId) {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd,eur,ils`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error("Network error: Failed to fetch prices.");
        }

        const data = await response.json();
        const prices = data[coinId];

        if (!prices || typeof prices.usd !== "number" || typeof prices.eur !== "number" || typeof prices.ils !== "number") {
            throw new Error("Unexpected response format from price API.");
        }

        return prices;
    }

    // === Switch Functions ===

    // Handle toggle switch for selecting favorite coins
    function handleSwitchToggle(coinId, isChecked) {
        if (isChecked) {
            if (selectedCoins.size < 5) {
                selectedCoins.add(coinId);
                saveSelectedCoins();
            } else {
                const checkbox = document.querySelector(`.coin-switch[data-id="${coinId}"]`);
                if (checkbox) checkbox.checked = false;
                openCoinLimitDialog(coinId);
            }
        } else {
            selectedCoins.delete(coinId);
            saveSelectedCoins();
        }
    }

    // Save selected coin IDs to localStorage
    function saveSelectedCoins() {
        localStorage.setItem("selectedCoins", JSON.stringify([...selectedCoins]));
    }

    // Load selected coin IDs from localStorage
    function loadSelectedCoins() {
        try {
            const stored = localStorage.getItem("selectedCoins");
            const parsed = JSON.parse(stored);
            return new Set(parsed);
        } catch {
            return new Set();
        }
    }

    // Restore all toggle switches from saved state
    function restoreSwitchStates() {
        selectedCoins.clear();
        const restored = loadSelectedCoins();
        for (const id of restored) {
            selectedCoins.add(id);
            const checkbox = document.querySelector(`.coin-switch[data-id="${id}"]`);
            if (checkbox) checkbox.checked = true;
        }
    }

    // Update visual switch state for a specific coin
    function updateSwitchState(coinId, isChecked) {
        const checkbox = document.querySelector(`.coin-switch[data-id="${coinId}"]`);
        if (checkbox) checkbox.checked = isChecked;
    }

    // === Dialog Box Functions ===

    // Open the limit dialog when 5 coins are already selected
    function openCoinLimitDialog(newCoinId) {
        const dialog = document.getElementById("coinLimitDialog");
        if (!dialog) return;

        updateDialogContent(newCoinId);
        dialog.showModal();
    }

    // Populate dialog with current selected coins and incoming coin info
    function updateDialogContent(newCoinId) {
        const dialog = document.getElementById("coinLimitDialog");
        const contentDiv = document.getElementById("dialogContent");
        if (!dialog || !contentDiv) return;

        const coin = allCoins.find(c => c.id === newCoinId);
        if (coin) {
            const messageEl = dialog.querySelector("#coinLimitMessage");
            messageEl.textContent = `You can only select up to 5 coins. To add ${coin.name} (${coin.symbol.toUpperCase()}), please remove one below:`;
        }

        contentDiv.innerHTML = "";

        for (const coinId of selectedCoins) {
            const coin = allCoins.find(c => c.id === coinId);
            const label = document.createElement("label");
            label.className = "dialog-option";
            label.innerHTML = `
                    <input type="radio" name="coinToRemove" value="${coinId}">
                    ${coin ? `${coin.name} (${coin.symbol.toUpperCase()})` : coinId}
                `;
            contentDiv.appendChild(label);
        }

        dialog.dataset.pendingCoin = newCoinId;
    }

    // Setup confirm/cancel actions for dialog
    function setupDialogBehavior() {
        const dialog = document.getElementById("coinLimitDialog");
        const confirmBtn = document.getElementById("confirmReplaceBtn");
        const cancelBtn = document.getElementById("cancelDialogBtn");
        if (!dialog || !confirmBtn || !cancelBtn) return;

        confirmBtn.addEventListener("click", () => {
            const selected = dialog.querySelector("input[name='coinToRemove']:checked");
            if (selected) {
                const removeId = selected.value;
                removeCoinFromSelection(removeId);
                dialog.close();

                const newCoinId = dialog.dataset.pendingCoin;
                selectedCoins.add(newCoinId);
                saveSelectedCoins();
                updateSwitchState(newCoinId, true);
            }
        });

        cancelBtn.addEventListener("click", () => {
            dialog.close();
        });
    }

    // Remove coin from selected set and update UI
    function removeCoinFromSelection(coinId) {
        selectedCoins.delete(coinId);
        saveSelectedCoins();
        updateSwitchState(coinId, false);
    }

})();
