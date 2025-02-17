import { database, ref, get, set, onValue } from './firebase-config.js';

// Import the fetchSheetData function
const SHEET_BASE_URL = 'https://docs.google.com/spreadsheets/d/18YGpLXlqNiWfBX7bH-HNN4oFBttFMErHyuMduMGEu4I';
const ROUND1_GID = '0';
const ROUND2_GID = '855009639';
const ROUND3_GID = '2028513950';
const ROUND4_GID = '893729618';
const OVERALL_GID = '990261427';

// Copy necessary helper functions from script.js
function parseTableData(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const rows = doc.querySelectorAll('tr');
    const data = [];

    for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length) {
            const rowData = Array.from(cells).map(cell => {
                const content = cell.textContent.trim();
                return content || '-';
            });
            
            if (rowData.some(cell => cell !== '-')) {
                data.push(rowData);
            }
        }
    }
    return data;
}

// Copy fetchSheetData function
async function fetchSheetData() {
    try {
        const [round1Data, round2Data, round3Data, round4Data, overallData] = await Promise.all([
            fetch(`${SHEET_BASE_URL}/gviz/tq?tqx=out:html&gid=${ROUND1_GID}`),
            fetch(`${SHEET_BASE_URL}/gviz/tq?tqx=out:html&gid=${ROUND2_GID}`),
            fetch(`${SHEET_BASE_URL}/gviz/tq?tqx=out:html&gid=${ROUND3_GID}`),
            fetch(`${SHEET_BASE_URL}/gviz/tq?tqx=out:html&gid=${ROUND4_GID}`),
            fetch(`${SHEET_BASE_URL}/gviz/tq?tqx=out:html&gid=${OVERALL_GID}`)
        ]);

        const [round1Html, round2Html, round3Html, round4Html, overallHtml] = await Promise.all([
            round1Data.text(),
            round2Data.text(),
            round3Data.text(),
            round4Data.text(),
            overallData.text()
        ]);

        return {
            round1: parseTableData(round1Html),
            round2: parseTableData(round2Html),
            round3: parseTableData(round3Html),
            round4: parseTableData(round4Html),
            overall: parseTableData(overallHtml)
        };
    } catch (error) {
        console.error('Error fetching data:', error);
        return { round1: [], round2: [], round3: [], round4: [], overall: [] };
    }
}

// Admin password - should be stored more securely in production
const ADMIN_PASSWORD = '2427';

export function authenticate() {
    const password = document.getElementById('adminPassword').value;
    if (password === ADMIN_PASSWORD) {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        loadVisibilityStates();
    } else {
        alert('Incorrect password');
    }
}

export function logout() {
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('adminPassword').value = '';
}

export function toggleVisibility(round) {
    const roundRef = ref(database, `roundVisibility/${round}`);
    get(roundRef).then((snapshot) => {
        const currentState = snapshot.val();
        set(roundRef, !currentState);
    });
}

// Update loadVisibilityStates to handle errors
function loadVisibilityStates() {
    const roundsRef = ref(database, 'roundVisibility');
    onValue(roundsRef, async (snapshot) => {
        try {
            const states = snapshot.val() || {};
            updateToggleButtons(states);
            await updatePreviewTables();
        } catch (error) {
            console.error('Error updating states:', error);
        }
    });
}

function updateToggleButtons(states) {
    ['round1', 'round2', 'round3', 'round4', 'overall'].forEach(round => {
        const button = document.getElementById(`${round}Toggle`);
        const isVisible = states[round] !== false;
        button.textContent = isVisible ? 'Hide' : 'Show';
        button.className = isVisible ? 'visible' : 'hidden';
    });
}

// Update updatePreviewTables to handle errors
async function updatePreviewTables() {
    try {
        const sheetData = await fetchSheetData();
        if (!sheetData) return;
        
        updatePreviewTable('preview-round1', sheetData.round1, [
            'Team', 'Status', 'Time', 'Moves', 'Accuracy', 'Points'
        ]);
        
        updatePreviewTable('preview-round2', sheetData.round2, [
            'Team', 'R1', 'R2', 'R3', 'R4', 'R5', 'Score'
        ]);
        
        updatePreviewTable('preview-round3', sheetData.round3, [
            'Team', 'B1', 'B2', 'B3', 'B4', 'B5', 'Score'
        ]);
        
        updatePreviewTable('preview-round4', sheetData.round4, [
            'Team', 'Score'
        ]);
        
        updatePreviewTable('preview-overall', sheetData.overall, [
            'Team', 'R1', 'R2', 'R3', 'R4', 'Total'
        ]);
    } catch (error) {
        console.error('Error updating preview tables:', error);
    }
}

function updatePreviewTable(containerId, data, headers) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let html = `
        <table>
            <thead>
                <tr>
                    ${headers.map(h => `<th>${h}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${data.slice(0, 5).map(row => `
                    <tr>
                        ${row.slice(0, headers.length).map(cell => `
                            <td>${cell}</td>
                        `).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}
