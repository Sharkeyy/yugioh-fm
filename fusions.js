let cards = [];
let cardMapById = {};
let cardMapByName = {};
let fusionMap = new Map(); // key: "minId-maxId" -> Set(resultIds)
let activeSuggestion = null;
let pendingFusionToField = null;
const HAND_INPUTS = ['card1', 'card2', 'card3', 'card4', 'card5'];
const FIELD_INPUTS = ['field1', 'field2', 'field3', 'field4', 'field5'];
const SHOWN_KEYS = { direct: new Set(), chain: new Set() };
let lastSelectedCardIds = [];

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
        [...HAND_INPUTS, ...FIELD_INPUTS].forEach(id => {
            const input = document.getElementById(id);
            if (!input) return;
            input.addEventListener('keydown', handleSuggestionKeys);
            input.addEventListener('input', () => showSuggestions(input));
        });

        const btnShowFusions = document.getElementById('btn-show-fusions');
        if (btnShowFusions) btnShowFusions.addEventListener('click', showFusions);

        const cancelBtn = document.querySelector('.replace-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', closeReplaceModal);

        const modal = document.getElementById('replace-modal');
        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) closeReplaceModal();
            });
        }
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
    activeSuggestion = null;

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
        matches.forEach((card, idx) => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = `${card.Id} - ${card.Name_DE}`;
            item.dataset.index = String(idx);
            item.onclick = () => {
                applySuggestion(input, card);
            };
            suggestionsDiv.appendChild(item);
        });
        suggestionsDiv.style.display = 'block';
    } else {
        suggestionsDiv.style.display = 'none';
    }
}

function applySuggestion(input, card) {
    input.value = card.Id.toString();
    const suggestionsDiv = input.nextElementSibling;
    suggestionsDiv.style.display = 'none';
    activeSuggestion = null;
    updateSelectedCards();
}

function handleSuggestionKeys(event) {
    const input = event.target;
    const suggestionsDiv = input.nextElementSibling;
    if (!suggestionsDiv || suggestionsDiv.style.display !== 'block') {
        if (event.key === 'Enter') {
            // Quick add by exact ID
            const card = getCard(input.value);
            if (card) {
                applySuggestion(input, card);
                event.preventDefault();
            }
        }
        return;
    }

    const items = Array.from(suggestionsDiv.querySelectorAll('.suggestion-item'));
    if (items.length === 0) return;

    const currentIdx = activeSuggestion ? Number(activeSuggestion.dataset.index) : -1;
    if (event.key === 'ArrowDown') {
        const nextIdx = (currentIdx + 1) % items.length;
        setActiveSuggestion(items[nextIdx]);
        event.preventDefault();
    } else if (event.key === 'ArrowUp') {
        const nextIdx = (currentIdx - 1 + items.length) % items.length;
        setActiveSuggestion(items[nextIdx]);
        event.preventDefault();
    } else if (event.key === 'Enter') {
        const target = activeSuggestion || items[0];
        const cardId = target.textContent.split(' - ')[0];
        const card = getCard(cardId);
        if (card) {
            applySuggestion(input, card);
            event.preventDefault();
        }
    } else if (event.key === 'Escape') {
        suggestionsDiv.style.display = 'none';
        activeSuggestion = null;
    }
}

function setActiveSuggestion(item) {
    if (activeSuggestion) activeSuggestion.classList.remove('is-active');
    activeSuggestion = item;
    if (activeSuggestion) activeSuggestion.classList.add('is-active');
}

function getFieldSlots() {
    return FIELD_INPUTS.map(id => {
        const input = document.getElementById(id);
        const card = input ? getCard(input.value) : null;
        return { id, input, card };
    });
}

function openReplaceModal(resultCard, inputsToClear) {
    const modal = document.getElementById('replace-modal');
    const options = document.getElementById('replace-options');
    if (!modal || !options) return;

    options.innerHTML = '';
    const slots = getFieldSlots();
    slots.forEach(slot => {
        const label = slot.card ? `${slot.card.Id} - ${slot.card.Name_DE}` : 'Leer';
        const option = document.createElement('div');
        option.className = 'replace-option';
        option.innerHTML = `
            <span>${slot.id.toUpperCase()} · ${label}</span>
            <strong>Ersetzen</strong>
        `;
        option.addEventListener('click', () => {
            if (inputsToClear) {
                inputsToClear.forEach(input => input.value = '');
            }
            if (slot.input) {
                slot.input.value = String(resultCard.Id);
            }
            if (slot.toggle) slot.toggle.checked = true;
            closeReplaceModal();
            updateSelectedCards();
            showFusions();
            triggerSlotAnimation(slot.input);
            showToast(`${resultCard.Name_DE} zum Spielfeld (Ablage ${slot.id.replace('field', '')}) hinzugefügt!`);
        });
        options.appendChild(option);
    });

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
}

function closeReplaceModal() {
    const modal = document.getElementById('replace-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    pendingFusionToField = null;
}

function triggerSlotAnimation(slotInput) {
    const playfieldSlot = slotInput.closest('.playfield-slot');
    if (playfieldSlot) {
        playfieldSlot.classList.remove('just-added');
        void playfieldSlot.offsetWidth; // force reflow
        playfieldSlot.classList.add('just-added');
        setTimeout(() => playfieldSlot.classList.remove('just-added'), 400);
    }
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="toast-icon">✓</span> <span>${message}</span>`;
    
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 300);
    }, 3000);
}

function determineInputsToClear(ingredientCards) {
    if (!ingredientCards || ingredientCards.length === 0) return [];
    
    // Prioritize hand inputs by listing them first
    const availableHandInputs = HAND_INPUTS.map(id => document.getElementById(id)).filter(input => input && input.value.trim() !== '');
    const availableFieldInputs = FIELD_INPUTS.map(id => document.getElementById(id)).filter(input => input && input.value.trim() !== '');
    
    const allAvailableInputs = [...availableHandInputs, ...availableFieldInputs];
    const inputsToClear = [];
    
    ingredientCards.forEach(card => {
        const inputIndex = allAvailableInputs.findIndex(input => {
            const inputCard = getCard(input.value);
            return inputCard && inputCard.Id === card.Id;
        });
        
        if (inputIndex !== -1) {
            const inputElements = allAvailableInputs.splice(inputIndex, 1);
            inputsToClear.push(inputElements[0]);
        }
    });
    
    return inputsToClear;
}

function onFusionClick(resultCard, ingredientCards) {
    const inputsToClear = determineInputsToClear(ingredientCards);
    const fieldInputsBeingCleared = inputsToClear.filter(input => FIELD_INPUTS.includes(input.id));
    
    const slots = getFieldSlots();
    let emptySlot = slots.find(slot => slot.input && !slot.input.value.trim());
    
    // If no slot is strictly empty right now, but a field slot WILL be cleared by this fusion, use that slot
    if (!emptySlot && fieldInputsBeingCleared.length > 0) {
        emptySlot = slots.find(slot => slot.input && slot.input.id === fieldInputsBeingCleared[0].id);
    }
    
    if (emptySlot) {
        inputsToClear.forEach(input => input.value = '');
        emptySlot.input.value = String(resultCard.Id);
        if (emptySlot.toggle) emptySlot.toggle.checked = true;
        updateSelectedCards();
        showFusions();
        triggerSlotAnimation(emptySlot.input);
        showToast(`${resultCard.Name_DE} zum Spielfeld hinzugefügt!`);
        return;
    }
    
    pendingFusionToField = resultCard;
    openReplaceModal(resultCard, inputsToClear);
}

function updateSelectedCards() {
    const selectedCardsDiv = document.getElementById('selected-cards');
    const selectedCards = [];
    HAND_INPUTS.forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        const card = getCard(input.value);
        if (card) {
            selectedCards.push(card);
        }
    });

    const currentIds = selectedCards.map(card => card.Id);
    if (currentIds.join('|') === lastSelectedCardIds.join('|')) return;

    selectedCardsDiv.innerHTML = '';
    
    // Pool of previously rendered IDs to check against for duplicates
    const oldIdsPool = [...lastSelectedCardIds];
    let newItemsCount = 0;

    selectedCards.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'selected-card';
        
        const oldIdx = oldIdsPool.indexOf(card.Id);
        if (oldIdx !== -1) {
            // Card was already tracked; disable entrance animation so it doesn't replay
            oldIdsPool.splice(oldIdx, 1);
            cardDiv.style.animation = 'none';
            cardDiv.style.opacity = '1';
            cardDiv.style.transform = 'translateY(0)';
        } else {
            // Brand new card added; stagger its entrance
            cardDiv.style.animationDelay = `${newItemsCount * 0.05}s`;
            newItemsCount++;
        }
        
        cardDiv.innerHTML = `
            <img src="images/de/${String(card.Id).padStart(3, '0')}.webp" alt="${card.Name_DE}">
            <p>${card.Name_DE}</p>
        `;
        selectedCardsDiv.appendChild(cardDiv);
    });

    lastSelectedCardIds = currentIds;
}

function showFusions() {
    updateSelectedCards();
    const handCards = HAND_INPUTS
        .map(id => getCard(document.getElementById(id).value))
        .filter(card => card !== null);
    const fieldCards = FIELD_INPUTS
        .map(id => getCard(document.getElementById(id).value))
        .filter(card => card !== null);
    const selectedCards = [...handCards, ...fieldCards];

    const fusionsDiv = document.getElementById('fusions');
    fusionsDiv.innerHTML = '';

    // Count selected cards (so we can prevent matching a single card with itself)
    // Example: if only one copy is selected, a fusion like A + A should NOT show.
    const selectedCounts = selectedCards.reduce((acc, c) => {
        acc[c.Id] = (acc[c.Id] || 0) + 1;
        return acc;
    }, {});

    const handCounts = handCards.reduce((acc, c) => {
        acc[c.Id] = (acc[c.Id] || 0) + 1;
        return acc;
    }, {});

    const fieldCounts = fieldCards.reduce((acc, c) => {
        acc[c.Id] = (acc[c.Id] || 0) + 1;
        return acc;
    }, {});

    // Helpers
    const uniqueIds = Object.keys(selectedCounts).map(Number).sort((a, b) => a - b);
    SHOWN_KEYS.direct.clear();
    SHOWN_KEYS.chain.clear();
    const shownDirect = SHOWN_KEYS.direct;
    const shownChains = SHOWN_KEYS.chain;

    const handRows = [];
    const fieldRows = [];

    function pushFusionRow(ingredientCards, resultCard, orderText, usesField) {
        const fusionDiv = document.createElement('div');
        fusionDiv.className = usesField ? 'fusion is-field' : 'fusion';

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

        const tagLabel = usesField ? 'Nutzt Spielfeld' : 'Nur Hand';
        const tagClass = usesField ? 'field' : 'hand';
        parts.push(`
            <div class="fusion-tags">
                <span class="tag ${tagClass}">${tagLabel}</span>
                <button class="btn-secondary result-action" type="button">Aufs Spielfeld legen</button>
            </div>
        `);

        fusionDiv.innerHTML = parts.join('');
        const actionBtn = fusionDiv.querySelector('.result-action');
        actionBtn.addEventListener('click', () => onFusionClick(resultCard, ingredientCards));
        if (usesField) {
            fieldRows.push(fusionDiv);
        } else {
            handRows.push(fusionDiv);
        }
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

                const usesField = (fieldCounts[a] || 0) > 0 || (fieldCounts[b] || 0) > 0;
                pushFusionRow(
                    [cardA, cardB],
                    resultCard,
                    formatOrderHint([a, b]),
                    usesField
                );
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
                        const usesField = newUsed.some(id => (fieldCounts[id] || 0) > 0);
                        // Display: A + B + C => Y (no intermediate X shown)
                        pushFusionRow(
                            ingredients,
                            resultCard,
                            formatOrderHint(newUsed),
                            usesField
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

    [...handRows, ...fieldRows].forEach((row, idx) => {
        row.style.animationDelay = `${idx * 0.05}s`;
        fusionsDiv.appendChild(row);
    });
}

// Init
loadCards();


