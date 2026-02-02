let cards = [];
let cardMapById = {};
let cardMapByName = {};
let fusionMap = new Map(); // key: "minId-maxId" -> Set(resultIds)

async function loadCards() {
    try {
        const response = await fetch('cards_merged_de.json');
        cards = await response.json();
        cards.forEach(card => {
            cardMapById[card.Id] = card;
            cardMapByName[card.Name.toLowerCase()] = card;
            cardMapByName[card.Name_DE.toLowerCase()] = card;
        });

        // Build a lookup map for fast fusion checks (pair -> result(s))
        fusionMap = new Map();
        cards.forEach(card => {
            if (!card.Fusions || card.Fusions.length === 0) return;
            card.Fusions.forEach(fusion => {
                const a = fusion._card1;
                const b = fusion._card2;
                const r = fusion._result;
                const min = Math.min(a, b);
                const max = Math.max(a, b);
                const key = `${min}-${max}`;
                if (!fusionMap.has(key)) fusionMap.set(key, new Set());
                fusionMap.get(key).add(r);
            });
        });

        console.log('Cards loaded:', cards.length);
        // Add event listeners for input changes to update selected cards
        ['card1', 'card2', 'card3', 'card4', 'card5'].forEach(id => {
            document.getElementById(id).addEventListener('input', updateSelectedCards);
        });
    } catch (error) {
        console.error('Error loading cards:', error);
    }
}

function getFusionResults(id1, id2) {
    const min = Math.min(id1, id2);
    const max = Math.max(id1, id2);
    const key = `${min}-${max}`;
    const results = fusionMap.get(key);
    return results ? Array.from(results) : [];
}

function getCard(input) {
    if (!input.trim()) return null;
    const id = parseInt(input.trim());
    if (!isNaN(id) && cardMapById[id]) {
        return cardMapById[id];
    }
    return cardMapByName[input.trim().toLowerCase()] || null;
}

function showSuggestions(input) {
    const query = input.value.trim().toLowerCase();
    const suggestionsDiv = input.nextElementSibling;
    suggestionsDiv.innerHTML = '';

    if (query.length < 2) {
        suggestionsDiv.style.display = 'none';
        return;
    }

    const matches = cards.filter(card =>
        card.Id.toString().includes(query) ||
        card.Name.toLowerCase().includes(query) ||
        card.Name_DE.toLowerCase().includes(query)
    ).slice(0, 10);

    if (matches.length > 0) {
        matches.forEach(card => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = `${card.Id} - ${card.Name_DE}`;
            item.onclick = () => {
                input.value = card.Id.toString();
                suggestionsDiv.style.display = 'none';
                updateSelectedCards();
            };
            suggestionsDiv.appendChild(item);
        });
        suggestionsDiv.style.display = 'block';
    } else {
        suggestionsDiv.style.display = 'none';
    }
}

function updateSelectedCards() {
    const selectedCardsDiv = document.getElementById('selected-cards');
    selectedCardsDiv.innerHTML = '';

    const inputs = ['card1', 'card2', 'card3', 'card4', 'card5'];
    inputs.forEach(id => {
        const card = getCard(document.getElementById(id).value);
        if (card) {
            const cardDiv = document.createElement('div');
            cardDiv.className = 'selected-card';
            cardDiv.innerHTML = `
                <img src="images/de/${String(card.Id).padStart(3, '0')}.webp" alt="${card.Name_DE}">
                <p>${card.Name_DE}</p>
            `;
            selectedCardsDiv.appendChild(cardDiv);
        }
    });
}

function showFusions() {
    updateSelectedCards();
    const selectedCards = [
        getCard(document.getElementById('card1').value),
        getCard(document.getElementById('card2').value),
        getCard(document.getElementById('card3').value),
        getCard(document.getElementById('card4').value),
        getCard(document.getElementById('card5').value)
    ].filter(card => card !== null);

    const fusionsDiv = document.getElementById('fusions');
    fusionsDiv.innerHTML = '';

    // Count selected cards (so we can prevent matching a single card with itself)
    // Example: if only one copy is selected, a fusion like A + A should NOT show.
    const selectedCounts = selectedCards.reduce((acc, c) => {
        acc[c.Id] = (acc[c.Id] || 0) + 1;
        return acc;
    }, {});

    // Helpers
    const uniqueIds = Object.keys(selectedCounts).map(Number).sort((a, b) => a - b);
    const shownDirect = new Set();
    const shownChains = new Set();

    function renderFusionRowWithOrder(ingredientCards, resultCard, orderText) {
        const fusionDiv = document.createElement('div');
        fusionDiv.className = 'fusion';

        const parts = [];
        ingredientCards.forEach((c, idx) => {
            if (idx > 0) parts.push('<div class="plus">+</div>');
            parts.push(`
                <div class="card">
                    <img src="images/de/${String(c.Id).padStart(3, '0')}.webp" alt="${c.Name_DE}">
                    <p>${c.Name_DE}</p>
                </div>
            `);
        });

        parts.push('<div class="equals">=</div>');
        parts.push(`
            <div class="card">
                <img src="images/de/${String(resultCard.Id).padStart(3, '0')}.webp" alt="${resultCard.Name_DE}">
                <p>${resultCard.Name_DE}</p>
            </div>
        `);

        if (orderText) {
            parts.push(`<p class="order-hint">${orderText}</p>`);
        }

        fusionDiv.innerHTML = parts.join('');
        fusionsDiv.appendChild(fusionDiv);
    }

    function formatOrderHint(orderedOriginalIds) {
        if (!orderedOriginalIds || orderedOriginalIds.length < 2) return '';
        const names = orderedOriginalIds
            .map(id => cardMapById[id])
            .filter(Boolean)
            .map(c => c.Name_DE);
        if (names.length < 2) return '';

        let hint = `Reihenfolge: ${names[0]} + ${names[1]}`;
        for (let i = 2; i < names.length; i++) {
            hint += ` + ${names[i]}`;
        }
        return hint;
    }

    function decCount(counts, id, amount = 1) {
        counts[id] = (counts[id] || 0) - amount;
        if (counts[id] <= 0) delete counts[id];
    }

    function incCount(counts, id, amount = 1) {
        counts[id] = (counts[id] || 0) + amount;
    }

    // 1) Direct fusions (2 cards)
    for (let i = 0; i < uniqueIds.length; i++) {
        for (let j = i; j < uniqueIds.length; j++) {
            const a = uniqueIds[i];
            const b = uniqueIds[j];
            if (a === b && (selectedCounts[a] || 0) < 2) continue;

            const results = getFusionResults(a, b);
            if (results.length === 0) continue;

            const cardA = cardMapById[a];
            const cardB = cardMapById[b];
            if (!cardA || !cardB) continue;

            results.forEach(resId => {
                const resultCard = cardMapById[resId];
                if (!resultCard) return;

                const key = `${Math.min(a, b)}-${Math.max(a, b)}->${resId}`;
                if (shownDirect.has(key)) return;
                shownDirect.add(key);

                renderFusionRowWithOrder([cardA, cardB], resultCard, formatOrderHint([a, b]));
            });
        }
    }

    // 2) Future fusions (chain up to 5 originals):
    // We only ever fuse (current hidden result) + (one remaining original card)
    // and we hide intermediate results in the UI.
    const maxCards = Math.min(5, selectedCards.length);

    function dfsChain(usedOriginalIds, intermediateId, counts) {
        if (usedOriginalIds.length >= maxCards) return;

        const remainingIds = Object.keys(counts).map(Number).sort((a, b) => a - b);
        for (const nextId of remainingIds) {
            const nextResults = getFusionResults(intermediateId, nextId);
            if (nextResults.length === 0) continue;

            // consume one copy of nextId
            decCount(counts, nextId, 1);

            for (const nextResId of nextResults) {
                const newUsed = usedOriginalIds.concat([nextId]);
                const newLen = newUsed.length;

                // Dedup by multiset of originals + final result
                const sortedUsed = newUsed.slice().sort((a, b) => a - b);
                const chainKey = `${sortedUsed.join(',')}->${nextResId}`;
                if (!shownChains.has(chainKey)) {
                    shownChains.add(chainKey);

                    // Important: display ingredients in the *actual fusion order* (newUsed)
                    // so images match the order text/hint. Dedup stays order-independent.
                    const ingredients = newUsed
                        .map(id => cardMapById[id])
                        .filter(Boolean);
                    const resultCard = cardMapById[nextResId];
                    if (ingredients.length === newLen && resultCard) {
                        // Display: A + B + C => Y (no intermediate X shown)
                        renderFusionRowWithOrder(
                            ingredients,
                            resultCard,
                            formatOrderHint(newUsed)
                        );
                    }
                }

                // Continue chaining with the new intermediate (hidden result)
                dfsChain(newUsed, nextResId, counts);
            }

            // restore
            incCount(counts, nextId, 1);
        }
    }

    // Start chains from every possible first fusion A + B => X
    // (A and B are originals; X becomes the hidden intermediate)
    const countsForChains = { ...selectedCounts };
    for (let i = 0; i < uniqueIds.length; i++) {
        for (let j = i; j < uniqueIds.length; j++) {
            const a = uniqueIds[i];
            const b = uniqueIds[j];
            if (a === b && (countsForChains[a] || 0) < 2) continue;

            const firstResults = getFusionResults(a, b);
            if (firstResults.length === 0) continue;

            // consume A and B
            decCount(countsForChains, a, 1);
            decCount(countsForChains, b, 1);

            for (const firstResId of firstResults) {
                dfsChain([a, b], firstResId, countsForChains);
            }

            // restore A and B
            incCount(countsForChains, a, 1);
            incCount(countsForChains, b, 1);
        }
    }
}

// Init
loadCards();


