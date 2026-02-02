let cardNameById = new Map();

async function loadCardNameMap() {
    try {
        const res = await fetch('cards_merged_de.json');
        const cards = await res.json();
        cardNameById = new Map(cards.map(c => [Number(c.Id), c.Name_DE || c.Name]));
    } catch (e) {
        // Not fatal; we can still show the English names from the TXT.
        console.warn('Could not load cards_merged_de.json for German names:', e);
        cardNameById = new Map();
    }
}

function formatAtkDef(atk, def) {
    const atkStr = (atk === null || atk === undefined) ? '' : String(atk);
    const defStr = (def === null || def === undefined) ? '' : String(def);
    if (!atkStr && !defStr) return '';
    return `${atkStr}/${defStr}`;
}

function sortSectionTitles(a, b) {
    function rank(title) {
        const m = title.match(/^(\d+)\s+Starchips$/i);
        if (m) {
            const n = Number(m[1]);
            // Keep regular buckets ordered numerically.
            // Put the 999999 bucket at the end.
            if (n === 999999) return 9_999_999_999;
            return n;
        }
        if (/^Above\s+1000\s+Starchips$/i.test(title)) return 1_000_000_000;
        if (/^Above\s+20000\s+Starchips$/i.test(title)) return 2_000_000_000;
        return 3_000_000_000;
    }

    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
}

function sectionsFromStarchipsJson(starchipsBySection) {
    const titles = Object.keys(starchipsBySection).sort(sortSectionTitles);
    return titles.map(title => {
        const cards = Array.isArray(starchipsBySection[title]) ? starchipsBySection[title] : [];
        const rows = cards
            .map(c => ({
                id: Number(c.id),
                titleEn: String(c.name ?? ''),
                atkDef: formatAtkDef(c.atk, c.def),
                password: String(c.password ?? ''),
                cost: Number(c.cost)
            }))
            // Safety: ensure stable ordering by ID.
            .sort((x, y) => x.id - y.id);

        return { title, rows };
    });
}

function escapeHtml(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function renderTables(sections) {
    const host = document.getElementById('password-tables');
    host.innerHTML = '';

    sections.forEach((section, idx) => {
        const details = document.createElement('details');
        details.className = 'pw-section';
        details.open = false; // keep all sections collapsed by default

        const summary = document.createElement('summary');
        summary.className = 'pw-section-title';
        summary.textContent = `${section.title} (${section.rows.length})`;
        details.appendChild(summary);

        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';

        const table = document.createElement('table');
        table.className = 'pw-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th style="width:72px">ID</th>
                    <th>Name</th>
                    <th style="width:110px">ATK/DEF</th>
                    <th style="width:120px">Passwort</th>
                    <th style="width:90px">Kosten</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        section.rows.forEach(r => {
            const nameDe = cardNameById.get(r.id);
            const displayName = (nameDe && String(nameDe).trim()) ? nameDe : r.titleEn;

            const tr = document.createElement('tr');
            tr.dataset.id = String(r.id);
            tr.dataset.password = r.password;
            tr.dataset.cost = String(r.cost);
            tr.dataset.section = section.title;

            tr.innerHTML = `
                <td><code>${String(r.id).padStart(3, '0')}</code></td>
                <td>${escapeHtml(displayName)}</td>
                <td><code>${escapeHtml(r.atkDef)}</code></td>
                <td><code>${escapeHtml(r.password)}</code></td>
                <td><code>${escapeHtml(String(r.cost))}</code></td>
            `;

            tbody.appendChild(tr);
        });

        wrap.appendChild(table);
        details.appendChild(wrap);
        host.appendChild(details);
    });
}

async function initPasswordsPage() {
    try {
        const res = await fetch('cards_starchips.json');
        const json = await res.json();

        await loadCardNameMap();
        const sections = sectionsFromStarchipsJson(json);
        renderTables(sections);
    } catch (e) {
        console.error('Failed to load cards_starchips.json:', e);
        const host = document.getElementById('password-tables');
        if (host) {
            host.innerHTML = '<div class="panel"><p>Fehler: cards_starchips.json konnte nicht geladen werden.</p></div>';
        }
    }
}

initPasswordsPage();

