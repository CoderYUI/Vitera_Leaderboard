import { database, ref, get } from './firebase-config.js';

const SHEET_BASE_URL = 'https://docs.google.com/spreadsheets/d/18YGpLXlqNiWfBX7bH-HNN4oFBttFMErHyuMduMGEu4I';
const ROUND1_GID = '0';
const ROUND2_GID = '855009639';
const ROUND3_GID = '2028513950';
const ROUND4_GID = '893729618';
const OVERALL_GID = '990261427';

// Add toggleTheme function definition
function toggleTheme() {
    const body = document.body;
    const button = document.querySelector('.theme-switch');
    const icon = button.querySelector('i');
    const text = button.querySelector('.theme-text');

    if (body.getAttribute('data-theme') === 'dark') {
        body.removeAttribute('data-theme');
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
        text.textContent = 'Light Mode';
        localStorage.setItem('theme', 'light');
    } else {
        body.setAttribute('data-theme', 'dark');
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
        text.textContent = 'Dark Mode';
        localStorage.setItem('theme', 'dark');
    }
}

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

// Add formatting helper functions
function formatTime(timeStr) {
    if (!timeStr) return '-';
    return timeStr.trim();
}

function formatScore(score) {
    if (!score || isNaN(score)) return '0';
    return Math.round(parseFloat(score)).toString();
}

function formatMoves(moves) {
    if (!moves || isNaN(moves)) return '0';
    return Math.round(parseFloat(moves)).toString();
}

function formatAccuracy(accuracy) {
    if (!accuracy || isNaN(accuracy)) return '0';
    return Math.round(parseFloat(accuracy)).toString();
}

function formatStatus(status) {
    if (!status) return '-';
    return status.trim();
}

// Add helper for time comparison
function timeToSeconds(timeStr) {
    if (!timeStr) return 9999999; // Large number for sorting incomplete times
    const [minutes, seconds] = timeStr.split(':').map(Number);
    return minutes * 60 + seconds;
}

// Update parseTableData function
function parseTableData(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const rows = doc.querySelectorAll('tr');
    const data = [];

    // Start from index 1 to skip only the first header row
    // Don't skip index 2 as it might contain actual data
    for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length) {
            // Only skip if it's clearly a header row
            const firstCell = cells[0].textContent.trim().toLowerCase();
            const secondCell = cells[1].textContent.trim().toLowerCase();
            if (firstCell === 'rank' || 
                firstCell === '#' || 
                (firstCell === 'team name' && secondCell === 'score')) {
                continue;
            }

            const rowData = Array.from(cells).map(cell => {
                const content = cell.textContent.trim();
                return content || '-';
            });
            
            // Only add rows that have at least some non-empty data
            if (rowData.some(cell => cell !== '-')) {
                data.push(rowData);
            }
        }
    }

    return data;
}

// Add tie-breaking helper functions
function compareRound1(a, b) {
    const statusA = a[1]?.toLowerCase() || '';
    const statusB = b[1]?.toLowerCase() || '';
    
    if (statusA !== statusB) {
        if (statusA.includes('complete')) return -1;
        if (statusB.includes('complete')) return 1;
    }

    if (statusA.includes('complete') && statusB.includes('complete')) {
        const timeCompare = timeToSeconds(a[2]) - timeToSeconds(b[2]);
        if (timeCompare !== 0) return timeCompare;
        return (parseInt(a[3]) || 0) - (parseInt(b[3]) || 0);
    }

    if (statusA.includes('timeout') && statusB.includes('timeout')) {
        const accuracyA = parseFloat(a[4].replace('%', '')) || 0;
        const accuracyB = parseFloat(b[4].replace('%', '')) || 0;
        if (accuracyA !== accuracyB) return accuracyB - accuracyA;
        return (parseInt(a[3]) || 0) - (parseInt(b[3]) || 0);
    }

    return 0;
}

function compareRound2(dataA, dataB) {
    const scoreA = parseFloat(dataA[6]) || 0;
    const scoreB = parseFloat(dataB[6]) || 0;
    return scoreB - scoreA;
}

function compareRound3(dataA, dataB) {
    const scoreA = parseFloat(dataA[6]) || 0;
    const scoreB = parseFloat(dataB[6]) || 0;
    return scoreB - scoreA;
}

function compareRound4(dataA, dataB) {
    const scoreA = parseFloat(dataA[1]) || 0;
    const scoreB = parseFloat(dataB[1]) || 0;
    return scoreB - scoreA;
}

function updateRound1(data) {
    const tbody = document.getElementById('round1Body');
    const oldRanks = new Map([...tbody.querySelectorAll('tr')].map(
        row => [row.querySelector('td:nth-child(2)').textContent, row.querySelector('td:first-child').textContent]
    ));
    
    tbody.innerHTML = '';

    // Complex sorting for Round 1
    const sortedData = data.sort((a, b) => {
        // First sort by status (Completed > Timeout)
        const statusA = a[1]?.toLowerCase() || '';
        const statusB = b[1]?.toLowerCase() || '';
        
        if (statusA !== statusB) {
            if (statusA.includes('complete')) return -1;
            if (statusB.includes('complete')) return 1;
        }

        // If both are completed
        if (statusA.includes('complete') && statusB.includes('complete')) {
            // First compare scores
            const scoreA = parseInt(a[5]) || 0;
            const scoreB = parseInt(b[5]) || 0;
            if (scoreA !== scoreB) return scoreB - scoreA;

            // If scores are tied, compare time
            const timeCompare = timeToSeconds(a[2]) - timeToSeconds(b[2]);
            if (timeCompare !== 0) return timeCompare;

            // If time is tied, compare moves
            return (parseInt(a[3]) || 0) - (parseInt(b[3]) || 0);
        }

        // If both are timeout
        if (statusA.includes('timeout') && statusB.includes('timeout')) {
            // First compare accuracy
            const accuracyA = parseFloat(a[4].replace('%', '')) || 0;
            const accuracyB = parseFloat(b[4].replace('%', '')) || 0;
            if (accuracyA !== accuracyB) return accuracyB - accuracyA;

            // Then compare moves (less moves is better)
            return (parseInt(a[3]) || 0) - (parseInt(b[3]) || 0);
        }

        // Default sort by score if status comparison didn't resolve
        return (parseInt(b[5]) || 0) - (parseInt(a[5]) || 0);
    });

    sortedData.forEach((row, index) => {
        const tr = document.createElement('tr');
        const accuracy = row[4] ? row[4].replace('%', '') : '0';
        const status = formatStatus(row[1]).toLowerCase();
        
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${row[0] || '-'}</td>
            <td data-status="${status}">${formatStatus(row[1])}</td>
            <td>${formatTime(row[2])}</td>
            <td>${formatMoves(row[3])}</td>
            <td>${accuracy}%</td>
            <td>${formatScore(row[5])}</td>
        `;
        
        // Add rank change animation
        const teamName = row[0];
        const oldRank = oldRanks.get(teamName);
        if (oldRank && oldRank !== (index + 1).toString()) {
            tr.classList.add('rank-changed');
        }
        
        tbody.appendChild(tr);
    });
}

function updateRound2(data) {
    const tbody = document.getElementById('round2Body');
    const oldRanks = new Map([...tbody.querySelectorAll('tr')].map(
        row => [row.querySelector('td:nth-child(2)').textContent, row.querySelector('td:first-child').textContent]
    ));
    
    tbody.innerHTML = '';

    const sortedData = data.sort((a, b) => {
        const scoreDiff = compareRound2(a, b);
        if (scoreDiff !== 0) return scoreDiff;
        return compareRound1(a, b);
    });

    sortedData.forEach((row, index) => {
        const tr = document.createElement('tr');
        const status = formatStatus(row[1]).toLowerCase();
        
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${row[0] || '-'}</td>
            <td data-status="${status}">${row[1] || '-'}</td>
            <td>${row[2] || '-'}</td>
            <td>${row[3] || '-'}</td>
            <td>${row[4] || '-'}</td>
            <td>${row[5] || '-'}</td>
            <td>${formatScore(row[6])}</td>
        `;
        
        // Add rank change animation
        const teamName = row[0];
        const oldRank = oldRanks.get(teamName);
        if (oldRank && oldRank !== (index + 1).toString()) {
            tr.classList.add('rank-changed');
        }
        
        tbody.appendChild(tr);
    });
}

function updateRound3(data) {
    const tbody = document.getElementById('round3Body');
    const oldRanks = new Map([...tbody.querySelectorAll('tr')].map(
        row => [row.querySelector('td:nth-child(2)').textContent, row.querySelector('td:first-child').textContent]
    ));
    
    tbody.innerHTML = '';

    const sortedData = data.sort((a, b) => {
        const scoreDiff = compareRound3(a, b);
        if (scoreDiff !== 0) return scoreDiff;
        const round2Diff = compareRound2(a, b);
        if (round2Diff !== 0) return round2Diff;
        return compareRound1(a, b);
    });

    sortedData.forEach((row, index) => {
        const tr = document.createElement('tr');
        const status = formatStatus(row[1]).toLowerCase();
        
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${row[0] || '-'}</td>
            <td data-status="${status}">${row[1] || '-'}</td>
            <td>${row[2] || '-'}</td>
            <td>${row[3] || '-'}</td>
            <td>${row[4] || '-'}</td>
            <td>${row[5] || '-'}</td>
            <td>${formatScore(row[6])}</td>
        `;
        
        // Add rank change animation
        const teamName = row[0];
        const oldRank = oldRanks.get(teamName);
        if (oldRank && oldRank !== (index + 1).toString()) {
            tr.classList.add('rank-changed');
        }
        
        tbody.appendChild(tr);
    });
}

function updateRound4(data) {
    const tbody = document.getElementById('round4Body');
    const oldRanks = new Map([...tbody.querySelectorAll('tr')].map(
        row => [row.querySelector('td:nth-child(2)').textContent, row.querySelector('td:first-child').textContent]
    ));
    
    tbody.innerHTML = '';

    const sortedData = data.sort((a, b) => {
        const scoreDiff = compareRound4(a, b);
        if (scoreDiff !== 0) return scoreDiff;
        const round3Diff = compareRound3(a, b);
        if (round3Diff !== 0) return round3Diff;
        const round2Diff = compareRound2(a, b);
        if (round2Diff !== 0) return round2Diff;
        return compareRound1(a, b);
    });

    sortedData.forEach((row, index) => {
        const tr = document.createElement('tr');
        const status = formatStatus(row[1]).toLowerCase();
        
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${row[0] || '-'}</td>
            <td data-status="${status}">${row[1] || '-'}</td>
        `;
        
        // Add rank change animation
        const teamName = row[0];
        const oldRank = oldRanks.get(teamName);
        if (oldRank && oldRank !== (index + 1).toString()) {
            tr.classList.add('rank-changed');
        }
        
        tbody.appendChild(tr);
    });
}

async function updateOverall(data) {
    const tbody = document.getElementById('overallBody');
    const thead = tbody.closest('table').querySelector('thead tr');
    tbody.innerHTML = '';
    thead.innerHTML = ''; // Clear existing headers

    // Get visibility status for all rounds
    const roundVisibility = {
        round1: await checkVisibility('round1'),
        round2: await checkVisibility('round2'),
        round3: await checkVisibility('round3'),
        round4: await checkVisibility('round4')
    };

    // Create headers based on visible rounds
    thead.appendChild(createTh('Rank'));
    thead.appendChild(createTh('Team Name'));
    if (roundVisibility.round1) thead.appendChild(createTh('Round 1'));
    if (roundVisibility.round2) thead.appendChild(createTh('Round 2'));
    if (roundVisibility.round3) thead.appendChild(createTh('Round 3'));
    if (roundVisibility.round4) thead.appendChild(createTh('Round 4'));
    thead.appendChild(createTh('Total Score'));

    const sortedData = data.sort((a, b) => {
        const totalScoreDiff = (parseFloat(b[5]) || 0) - (parseFloat(a[5]) || 0);
        if (totalScoreDiff !== 0) return totalScoreDiff;
        
        const round4Diff = compareRound4(a, b);
        if (round4Diff !== 0) return round4Diff;
        
        const round3Diff = compareRound3(a, b);
        if (round3Diff !== 0) return round3Diff;
        
        const round2Diff = compareRound2(a, b);
        if (round2Diff !== 0) return round2Diff;
        
        return compareRound1(a, b);
    });

    sortedData.forEach((row, index) => {
        const tr = document.createElement('tr');
        let html = `
            <td>${index + 1}</td>
            <td>${row[0] || '-'}</td>
        `;

        // Add scores only for visible rounds
        if (roundVisibility.round1) html += `<td>${formatScore(row[1])}</td>`;
        if (roundVisibility.round2) html += `<td>${formatScore(row[2])}</td>`;
        if (roundVisibility.round3) html += `<td>${formatScore(row[3])}</td>`;
        if (roundVisibility.round4) html += `<td>${formatScore(row[4])}</td>`;

        // Always show total score
        html += `<td>${formatScore(row[5])}</td>`;
        
        tr.innerHTML = html;
        tbody.appendChild(tr);
    });
}

// Helper function to create table headers
function createTh(text) {
    const th = document.createElement('th');
    th.textContent = text;
    return th;
}

// Make these functions available globally
window.toggleTheme = toggleTheme;
window.switchTab = async function(roundId, event) {
    const isVisible = await checkVisibility(roundId);
    if (!isVisible) {
        return; // Don't switch to hidden tabs
    }

    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active');
    });
    
    // Show selected tab content
    const selectedTab = document.getElementById(roundId);
    selectedTab.classList.add('active');
    selectedTab.style.display = 'block';
    
    // Update button states
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    if (event) {
        event.target.classList.add('active');
    } else {
        document.querySelector(`[data-round="${roundId}"]`).classList.add('active');
    }

    // Load data for the selected tab
    const data = await fetchSheetData();
    if (data[roundId]?.length > 0) {
        switch(roundId) {
            case 'round1': updateRound1(data.round1); break;
            case 'round2': updateRound2(data.round2); break;
            case 'round3': updateRound3(data.round3); break;
            case 'round4': updateRound4(data.round4); break;
            case 'overall': updateOverall(data.overall); break;
        }
    }
};

// Add after existing Firebase initialization
async function checkVisibility(roundId) {
    try {
        const visibilityRef = ref(database, `roundVisibility/${roundId}`);
        const snapshot = await get(visibilityRef);
        return snapshot.val() !== false;
    } catch (error) {
        console.error('Error checking visibility:', error);
        return true; // Default to visible if there's an error
    }
}

// Add helper function to show message
function showNoDataMessage(container) {
    container.innerHTML = `
        <div class="no-data-message">
            <div class="emoji">📊</div>
            <p>This leaderboard will be available soon!</p>
            <p>Please check back later.</p>
        </div>
    `;
}

// Add function to update tab visibility
async function updateTabVisibility() {
    const rounds = ['round1', 'round2', 'round3', 'round4', 'overall'];
    let firstVisibleTab = null;
    let anyVisible = false;

    for (const roundId of rounds) {
        const isVisible = await checkVisibility(roundId);
        const button = document.querySelector(`[data-round="${roundId}"]`);
        const content = document.getElementById(roundId);

        if (isVisible) {
            anyVisible = true;
            button.style.display = 'inline-block';
            button.disabled = false;
            content.style.display = 'none'; // Will be shown when selected
            if (!firstVisibleTab) firstVisibleTab = roundId;
        } else {
            button.style.display = 'none';
            button.disabled = true;
            content.style.display = 'none';
            button.classList.remove('active');
            content.classList.remove('active');
        }
    }

    // Show message if no rounds are visible
    if (!anyVisible) {
        const container = document.querySelector('.container');
        const tabContainer = document.querySelector('.tab-container');
        tabContainer.style.display = 'none';
        showNoDataMessage(container);
        return;
    }

    // Switch to first visible tab if current tab is hidden
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab || activeTab.style.display === 'none') {
        if (firstVisibleTab) {
            await switchTab(firstVisibleTab);
        }
    }
}

// Modify initLeaderboard to only handle initial tab
async function initLeaderboard() {
    await updateTabVisibility();
}

// Initial load and refresh timer
initLeaderboard();
setInterval(initLeaderboard, 300000);

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        const button = document.querySelector('.theme-switch');
        const icon = button.querySelector('i');
        const text = button.querySelector('.theme-text');
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
        text.textContent = 'Dark Mode';
    }
});
