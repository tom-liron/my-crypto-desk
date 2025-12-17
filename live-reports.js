"use strict";

(() => {
    //
    // === Live Reports Constants and Globals ===
    //
    let percentageChart, usdChart;
    let percentDataMap = {};
    let priceDataMap = {};
    let initialPrices = {};
    const MAX_POINTS = 60;
    let updateInterval;

    //
    // === UI Helpers ===
    //

    // Displays a user message in an info or error box
    function displayUserMessage(messageHTML, isError = false) {
        const wrappers = ["percentageWrapper", "usdWrapper"];
        wrappers.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "none";
        });

        const messageArea = document.getElementById("messageArea") || createMessageArea();
        messageArea.innerHTML = `
            <div class="${isError ? "error-box" : "info-box"}">
                ${messageHTML}
            </div>`;
        messageArea.style.display = "block";
    }

    // Creates a message area in the DOM if not present
    function createMessageArea() {
        const fallback = document.createElement("div");
        fallback.id = "messageArea";
        document.body.appendChild(fallback);
        return fallback;
    }

    //
    // === Storage Helpers ===
    //

    // Retrieves selected coin symbols from localStorage
    function getSelectedSymbols() {
        try {
            const selected = JSON.parse(localStorage.getItem("selectedCoins") || "[]");
            const allCoins = JSON.parse(localStorage.getItem("coins") || "[]");
            const symbols = selected.map(id => {
                const coin = allCoins.find(c => c.id === id);
                if (!coin) throw new Error(`Missing coin data for ID: ${id}`);
                return coin.symbol.toUpperCase();
            });
            if (!symbols.length) throw new Error("No selected coins found.");
            return symbols;
        } catch (err) {
            throw new Error("Could not read coin symbols: " + err.message);
        }
    }

    //
    // === Initialization ===
    //

    // Entry point for initializing live reports
    function initializeLiveReports() {
        const percentEl = document.getElementById("percentageChart");
        const usdEl = document.getElementById("usdPriceChart");
        const percentWrapper = document.getElementById("percentageWrapper");
        const usdWrapper = document.getElementById("usdWrapper");

        if (!percentEl || !usdEl) {
            throw new Error("Missing chart containers.");
        }

        let symbols;
        try {
            symbols = getSelectedSymbols();
        } catch (err) {
            cleanupCharts();
            hideWrappers();
            displayUserMessage(`
                No coins selected for live tracking.<br>
                Please choose up to 5 favorite coins on the <strong>Markets</strong> page.<br><br>
                <a href="index.html" class="go-to-markets">Go Back</a>`, true);
            return;
        }

        resetDataMaps(symbols);
        showUSDChartWrapper(usdWrapper, usdEl);
        createPercentageChart(percentEl, symbols);
        createUSDChart(usdEl, symbols);
        startLiveUpdates(symbols);
    }

    // Destroys existing charts to clean up
    function cleanupCharts() {
        if (percentageChart) percentageChart.destroy();
        if (usdChart) usdChart.destroy();
        percentageChart = null;
        usdChart = null;
    }

    // Hides chart wrapper elements
    function hideWrappers() {
        ["percentageWrapper", "usdWrapper"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "none";
        });
    }

    // Displays the USD chart container
    function showUSDChartWrapper(wrapper, chartEl) {
        if (wrapper) wrapper.style.display = "block";
        if (chartEl) chartEl.style.display = "";
    }

    // Resets data maps for tracking percentages and prices
    function resetDataMaps(symbols) {
        percentDataMap = {};
        priceDataMap = {};
        initialPrices = {};
        for (const sym of symbols) {
            percentDataMap[sym] = [];
            priceDataMap[sym] = [];
        }
    }

    //
    // === Chart Creation ===
    //

    // Creates the % change chart using ApexCharts
    function createPercentageChart(el, symbols) {
        percentageChart = new ApexCharts(el, {
            chart: { type: "line", animations: { enabled: true }, toolbar: { show: true } },
            title: { text: "Live % Change", align: "center" },
            xaxis: { type: "datetime" },
            yaxis: {
                title: { text: "% Change" },
                labels: { formatter: val => `${val.toFixed(2)}%` }
            },
            stroke: { curve: "smooth", width: 2 },
            series: symbols.map(sym => ({ name: sym, data: percentDataMap[sym] }))
        });
        percentageChart.render();
    }

    // Creates the USD price chart using ApexCharts
    function createUSDChart(el, symbols) {
        usdChart = new ApexCharts(el, {
            chart: { type: "line", animations: { enabled: true }, toolbar: { show: true } },
            title: { text: "Live USD Price", align: "center" },
            xaxis: { type: "datetime" },
            yaxis: {
                title: { text: "USD" },
                labels: { formatter: val => `$${val.toFixed(2)}` }
            },
            stroke: { curve: "smooth", width: 2 },
            series: symbols.map(sym => ({ name: sym, data: priceDataMap[sym] }))
        });
        usdChart.render();
    }

    //
    // === Polling and Updating ===
    //

    // Starts polling the API and updating charts
    function startLiveUpdates(symbols) {
        const url = `https://min-api.cryptocompare.com/data/pricemulti?fsyms=${symbols.join(",")}&tsyms=USD`;

        updateInterval = setInterval(async () => {
            try {
                const data = await fetchLivePrices(url);
                const now = Date.now();

                const skipped = updatePriceData(symbols, data, now);

                if (skipped.length > 0) {
                    clearInterval(updateInterval);
                    cleanupCharts();
                    displayUserMessage(
                        `Live updates failed: No price for ${skipped.join(", ")}.<br>Try other coins.`,
                        true
                    );
                    return;
                }

                updateCharts(symbols);
            } catch (err) {
                clearInterval(updateInterval);
                displayUserMessage(`<p class="error-message">Live update error: ${err.message}</p>`, true);
            }
        }, 1000);
    }

    // Updates data arrays for charting and returns any symbols skipped
function updatePriceData(symbols, data, timestamp) {
    let skipped = [];

    for (const sym of symbols) {
        const coin = data[sym];
        const price = coin?.USD;

        if (typeof price !== "number" || !isFinite(price)) {
            skipped.push(sym);
            continue;
        }

        if (!(sym in initialPrices)) {
            initialPrices[sym] = price;
        }

        const basePrice = initialPrices[sym];
        const percentChange = ((price - basePrice) / basePrice) * 100;

        // Validate final computed value before pushing to charts
        if (!isFinite(percentChange)) {
            skipped.push(sym);
            continue;
        }

        percentDataMap[sym].push({ x: timestamp, y: percentChange });
        priceDataMap[sym].push({ x: timestamp, y: price });

        if (percentDataMap[sym].length > MAX_POINTS) percentDataMap[sym].shift();
        if (priceDataMap[sym].length > MAX_POINTS) priceDataMap[sym].shift();
    }

    return skipped;
}

    // Updates ApexCharts with the latest data
    function updateCharts(symbols) {
        const valid = symbols.filter(
            sym => percentDataMap[sym]?.length && priceDataMap[sym]?.length
        );

        percentageChart.updateSeries(valid.map(sym => ({ name: sym, data: percentDataMap[sym] })));
        usdChart.updateSeries(valid.map(sym => ({ name: sym, data: priceDataMap[sym] })));
    }

    //
    // === Fetch ===
    //

    // Fetches latest coin prices from the API
    async function fetchLivePrices(url) {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP error: ${res.status} ${res.statusText}`);
        }
        const json = await res.json();
        if (!json || typeof json !== "object") {
            throw new Error("Invalid API response.");
        }
        return json;
    }

    //
    // === Startup ===
    //

    document.addEventListener("DOMContentLoaded", () => {
        // Initialize reports if the live chart exists
        if (document.getElementById("percentageChart")) {
            try {
                initializeLiveReports();
            } catch (err) {
                console.error("Initialization error:", err.message);
            }
        }

        // Handle "Go to Markets" link click
        document.addEventListener("click", (e) => {
            if (e.target.id === "goToMarketsBtn") {
                window.location.href = "index.html";
            }
        });
    });

})();
