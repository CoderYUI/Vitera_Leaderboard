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
    if (!score || isNaN(score)) {
        // Check if the score is specifically "Eliminated" (case-insensitive)
        if (typeof score === 'string' && score.toLowerCase() === 'eliminated') {
            return 'Eliminated';
        }
        return '0';
    }
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
    
    // Check if both teams have 0 score or invalid score
    if ((scoreA === 0 || isNaN(scoreA)) && (scoreB === 0 || isNaN(scoreB))) {
        // Use Round 1 data for comparison
        const round1ScoreA = parseInt(dataA[5]) || 0;
        const round1ScoreB = parseInt(dataB[5]) || 0;
        if (round1ScoreA !== round1ScoreB) {
            return round1ScoreB - round1ScoreA;
        }
        return compareRound1(dataA, dataB);
    }
    
    return scoreB - scoreA;
}

function compareRound3(dataA, dataB) {
    // First separate into three categories: scores > 0, score = 0, and eliminated
    const scoreA = parseFloat(dataA[6]) || 0;
    const scoreB = parseFloat(dataB[6]) || 0;
    const isEliminatedA = dataA[6] === 'eliminated' || dataA[6] === 'Eliminated';
    const isEliminatedB = dataB[6] === 'eliminated' || dataB[6] === 'Eliminated';

    // Put eliminated teams at the bottom
    if (isEliminatedA && !isEliminatedB) return 1;
    if (!isEliminatedA && isEliminatedB) return -1;
    if (isEliminatedA && isEliminatedB) {
        // Both eliminated, use Round 2 then Round 1 for tiebreaker
        const round2ScoreA = parseFloat(dataA[5]) || 0;
        const round2ScoreB = parseFloat(dataB[5]) || 0;
        if (round2ScoreA !== round2ScoreB) return round2ScoreB - round2ScoreA;
        return compareRound1(dataA, dataB);
    }

    // Handle non-eliminated teams
    // First sort by score (high to low)
    if (scoreA !== scoreB) return scoreB - scoreA;
    
    // For same scores (including 0), use previous rounds as tiebreaker
    const round2ScoreA = parseFloat(dataA[5]) || 0;
    const round2ScoreB = parseFloat(dataB[5]) || 0;
    if (round2ScoreA !== round2ScoreB) return round2ScoreB - round2ScoreA;
    
    // If Round 2 scores are also tied, use Round 1
    return compareRound1(dataA, dataB);
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
        const rawStatus = formatStatus(row[1]).toLowerCase();
        // Change 'complete' to 'completed' to match the CSS class
        const status = rawStatus === 'complete' ? 'completed' : rawStatus;
        
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

function compareRound1ForRound2(dataA, dataB) {
    // Get the Round 1 data that's stored in Round 2 sheet
    const statusA = dataA[1]?.toLowerCase() || '';
    const statusB = dataB[1]?.toLowerCase() || '';
    const timeA = dataA[2];
    const timeB = dataB[2];
    const movesA = dataA[3];
    const movesB = dataB[3];
    const accuracyA = dataA[4];
    const accuracyB = dataB[4];
    const scoreA = dataA[5];
    const scoreB = dataB[5];

    // Use the same logic as Round 1
    if (statusA !== statusB) {
        if (statusA.includes('complete')) return -1;
        if (statusB.includes('complete')) return 1;
    }

    if (statusA.includes('complete') && statusB.includes('complete')) {
        if (scoreA !== scoreB) return parseInt(scoreB) - parseInt(scoreA);
        const timeCompare = timeToSeconds(timeA) - timeToSeconds(timeB);
        if (timeCompare !== 0) return timeCompare;
        return (parseInt(movesA) || 0) - (parseInt(movesB) || 0);
    }

    if (statusA.includes('timeout') && statusB.includes('timeout')) {
        const accA = parseFloat(accuracyA?.replace('%', '')) || 0;
        const accB = parseFloat(accuracyB?.replace('%', '')) || 0;
        if (accA !== accB) return accB - accA;
        return (parseInt(movesA) || 0) - (parseInt(movesB) || 0);
    }

    return 0;
}

async function updateRound2(data) {
    // First, fetch Round 1 data
    const round1Data = (await fetchSheetData()).round1;
    
    // Create map of team names to their Round 1 data
    const round1Map = new Map(
        round1Data.map(row => [row[0], row])
    );
    
    const tbody = document.getElementById('round2Body');
    // Add this line to fix the oldRanks error
    const oldRanks = new Map([...tbody.querySelectorAll('tr')].map(
        row => [row.querySelector('td:nth-child(2)').textContent, row.querySelector('td:first-child').textContent]
    ));
    
    tbody.innerHTML = '';

    // Check if all scores are 0
    const allZeroScores = data.every(row => {
        const totalScore = parseFloat(row[6]) || 0;
        return totalScore === 0;
    });

    const sortedData = data.sort((a, b) => {
        const scoreA = parseFloat(a[6]) || 0;
        const scoreB = parseFloat(b[6]) || 0;

        // If scores are different, sort by score
        if (scoreA !== scoreB) {
            return scoreB - scoreA;
        }

        // If scores are tied (including all zeros), use Round 1 data to break tie
        const teamAround1 = round1Map.get(a[0]);
        const teamBround1 = round1Map.get(b[0]);

        if (teamAround1 && teamBround1) {
            // Use complete Round 1 sorting logic
            const statusA = teamAround1[1]?.toLowerCase() || '';
            const statusB = teamBround1[1]?.toLowerCase() || '';

            // First check completion status
            if (statusA.includes('complete') && !statusB.includes('complete')) return -1;
            if (!statusA.includes('complete') && statusB.includes('complete')) return 1;

            // If both completed
            if (statusA.includes('complete') && statusB.includes('complete')) {
                // Compare times
                const timeCompare = timeToSeconds(teamAround1[2]) - timeToSeconds(teamBround1[2]);
                if (timeCompare !== 0) return timeCompare;
                // Compare moves if times are equal
                return (parseInt(teamAround1[3]) || 0) - (parseInt(teamBround1[3]) || 0);
            }

            // If both timeout
            if (statusA.includes('timeout') && statusB.includes('timeout')) {
                const accA = parseFloat(teamAround1[4]?.replace('%', '')) || 0;
                const accB = parseFloat(teamBround1[4]?.replace('%', '')) || 0;
                if (accA !== accB) return accB - accA;
                return (parseInt(teamAround1[3]) || 0) - (parseInt(teamBround1[3]) || 0);
            }
        }

        // If team not found in Round 1, put them at the end
        if (teamAround1 && !teamBround1) return -1;
        if (!teamAround1 && teamBround1) return 1;

        // If neither team found in Round 1, maintain original order
        return 0;
    });

    // Rest of updateRound2 remains the same
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

async function updateRound3(data) {
    // First, fetch Round 1 and Round 2 data for tiebreaking
    const round1Data = (await fetchSheetData()).round1;
    const round2Data = (await fetchSheetData()).round2;
    
    // Create rankings maps - sort Round 2 data first by its own logic
    const sortedRound2 = round2Data.sort((a, b) => {
        const scoreA = parseFloat(a[6]) || 0;
        const scoreB = parseFloat(b[6]) || 0;
        return scoreB - scoreA;
    });
    
    const round2Rankings = new Map(
        sortedRound2.map((row, index) => [row[0], index])
    );
    
    const round1Rankings = new Map(
        round1Data.map((row, index) => [row[0], index])
    );

    const tbody = document.getElementById('round3Body');
    const oldRanks = new Map([...tbody.querySelectorAll('tr')].map(
        row => [row.querySelector('td:nth-child(2)').textContent, row.querySelector('td:first-child').textContent]
    ));
    
    tbody.innerHTML = '';

    const sortedData = data.sort((a, b) => {
        const scoreA = parseFloat(a[6]) || 0;
        const scoreB = parseFloat(b[6]) || 0;
        const isEliminatedA = a[6] === 'eliminated' || a[6] === 'Eliminated' || a.every(cell => cell === '-' || cell === '');
        const isEliminatedB = b[6] === 'eliminated' || b[6] === 'Eliminated' || b.every(cell => cell === '-' || cell === '');

        // First sort by scores
        if (!isEliminatedA && !isEliminatedB) {
            if (scoreA !== scoreB) return scoreB - scoreA;
        }

        // Put eliminated teams after teams with scores
        if (isEliminatedA && !isEliminatedB) return 1;
        if (!isEliminatedA && isEliminatedB) return -1;

        // For tied scores or both eliminated, use tiebreakers
        if (scoreA === scoreB || (isEliminatedA && isEliminatedB)) {
            // First try Round 2 rankings
            const round2RankA = round2Rankings.get(a[0]);
            const round2RankB = round2Rankings.get(b[0]);
            if (round2RankA !== undefined && round2RankB !== undefined) {
                return round2RankA - round2RankB;
            }

            // If Round 2 rankings are the same or not found, use Round 1
            const round1RankA = round1Rankings.get(a[0]);
            const round1RankB = round1Rankings.get(b[0]);
            if (round1RankA !== undefined && round1RankB !== undefined) {
                return round1RankA - round1RankB;
            }
        }

        return 0;
    });

    // Rest of updateRound3 remains the same...
    sortedData.forEach((row, index) => {
        const tr = document.createElement('tr');
        const status = formatStatus(row[1]).toLowerCase();
        const totalScore = row[6];
        const isEliminated = totalScore === 'eliminated' || 
                           totalScore === 'Eliminated' || 
                           row.slice(1, 6).every(cell => cell === '-' || cell === '');
        
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${row[0] || '-'}</td>
            <td>${isEliminated ? '-' : (row[1] || '0')}</td>
            <td>${isEliminated ? '-' : (row[2] || '0')}</td>
            <td>${isEliminated ? '-' : (row[3] || '0')}</td>
            <td>${isEliminated ? '-' : (row[4] || '0')}</td>
            <td>${isEliminated ? '-' : (row[5] || '0')}</td>
            <td data-status="${isEliminated ? 'eliminated' : ''}">${
                isEliminated ? 'Eliminated' : (formatScore(totalScore) || '0')
            }</td>
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

async function updateRound4(data) {
    // Fetch data from previous rounds
    const allData = await fetchSheetData();
    const round1Data = allData.round1;
    const round2Data = allData.round2;
    const round3Data = allData.round3;

    // Create lookup maps for previous round data
    const round3Map = new Map(round3Data.map(row => [row[0], row]));
    const round2Map = new Map(round2Data.map(row => [row[0], row]));
    const round1Map = new Map(round1Data.map(row => [row[0], row]));
    
    const tbody = document.getElementById('round4Body');
    const oldRanks = new Map([...tbody.querySelectorAll('tr')].map(
        row => [row.querySelector('td:nth-child(2)').textContent, row.querySelector('td:first-child').textContent]
    ));
    
    tbody.innerHTML = '';

    const sortedData = data.sort((a, b) => {
        const scoreA = parseFloat(a[1]) || 0;
        const scoreB = parseFloat(b[1]) || 0;
        const isEliminatedA = a[1]?.toLowerCase() === 'eliminated';
        const isEliminatedB = b[1]?.toLowerCase() === 'eliminated';

        // Always put eliminated teams at the bottom
        if (isEliminatedA && !isEliminatedB) return 1;
        if (!isEliminatedA && isEliminatedB) return -1;
        
        // If both are non-eliminated, sort by score
        if (!isEliminatedA && !isEliminatedB) {
            if (scoreA !== scoreB) return scoreB - scoreA;
            
            // For tied scores, use previous round logic
            const teamAround3 = round3Map.get(a[0]);
            const teamBround3 = round3Map.get(b[0]);
            if (teamAround3 && teamBround3) {
                const round3Diff = compareRound3(teamAround3, teamBround3);
                if (round3Diff !== 0) return round3Diff;
            }

            const teamAround2 = round2Map.get(a[0]);
            const teamBround2 = round2Map.get(b[0]);
            if (teamAround2 && teamBround2) {
                const round2Diff = compareRound2(teamAround2, teamBround2);
                if (round2Diff !== 0) return round2Diff;
            }

            const teamAround1 = round1Map.get(a[0]);
            const teamBround1 = round1Map.get(b[0]);
            if (teamAround1 && teamBround1) {
                return compareRound1(teamAround1, teamBround1);
            }
        }

        // If both eliminated, use previous round rankings
        if (isEliminatedA && isEliminatedB) {
            const teamAround3 = round3Map.get(a[0]);
            const teamBround3 = round3Map.get(b[0]);
            if (teamAround3 && teamBround3) {
                const round3Diff = compareRound3(teamAround3, teamBround3);
                if (round3Diff !== 0) return round3Diff;
            }

            const teamAround2 = round2Map.get(a[0]);
            const teamBround2 = round2Map.get(b[0]);
            if (teamAround2 && teamBround2) {
                const round2Diff = compareRound2(teamAround2, teamBround2);
                if (round2Diff !== 0) return round2Diff;
            }

            const teamAround1 = round1Map.get(a[0]);
            const teamBround1 = round1Map.get(b[0]);
            if (teamAround1 && teamBround1) {
                return compareRound1(teamAround1, teamBround1);
            }
        }

        return 0;
    });

    // Rest of the function remains the same...
    sortedData.forEach((row, index) => {
        const tr = document.createElement('tr');
        const status = row[1] === '-' ? 'eliminated' : formatStatus(row[1]).toLowerCase();
        const displayStatus = status === 'eliminated' ? 'Eliminated' : (row[1] || '-');
        
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${row[0] || '-'}</td>
            <td data-status="${status}">${displayStatus}</td>
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

    // Fetch previous round data for tiebreaking
    const allData = await fetchSheetData();
    const round1Data = allData.round1;
    const round2Data = allData.round2;
    const round3Data = allData.round3;

    // Create lookup maps
    const round3Map = new Map(round3Data.map(row => [row[0], row]));
    const round2Map = new Map(round2Data.map(row => [row[0], row]));
    const round1Map = new Map(round1Data.map(row => [row[0], row]));

    const sortedData = data.sort((a, b) => {
        // First compare total scores
        const totalScoreA = parseFloat(a[5]) || 0;
        const totalScoreB = parseFloat(b[5]) || 0;
        if (totalScoreA !== totalScoreB) return totalScoreB - totalScoreA;

        // If total scores are tied, use Round 3 logic
        const teamAround3 = round3Map.get(a[0]);
        const teamBround3 = round3Map.get(b[0]);
        if (teamAround3 && teamBround3) {
            const round3Diff = compareRound3(teamAround3, teamBround3);
            if (round3Diff !== 0) return round3Diff;
        }

        // If still tied, use Round 2 logic
        const teamAround2 = round2Map.get(a[0]);
        const teamBround2 = round2Map.get(b[0]);
        if (teamAround2 && teamBround2) {
            const round2Diff = compareRound2(teamAround2, teamBround2);
            if (round2Diff !== 0) return round2Diff;
        }

        // If still tied, use Round 1 logic
        const teamAround1 = round1Map.get(a[0]);
        const teamBround1 = round1Map.get(b[0]);
        if (teamAround1 && teamBround1) {
            return compareRound1(teamAround1, teamBround1);
        }

        return 0;
    });

    // Update winners podium
    const podiumContainer = document.querySelector('.winners-podium');
    podiumContainer.innerHTML = '';

    // Create podium places
    const podiumHTML = `
        <div class="podium-place podium-second">
            <div class="medal-icon">🥈</div>
            <div class="podium-name">${sortedData[1]?.[0] || '-'}</div>
            <div class="podium-score">${formatScore(sortedData[1]?.[5] || '0')} pts</div>
        </div>
        <div class="podium-place podium-first">
            <div class="medal-icon">🥇</div>
            <div class="podium-name">${sortedData[0]?.[0] || '-'}</div>
            <div class="podium-score">${formatScore(sortedData[0]?.[5] || '0')} pts</div>
        </div>
        <div class="podium-place podium-third">
            <div class="medal-icon">🥉</div>
            <div class="podium-name">${sortedData[2]?.[0] || '-'}</div>
            <div class="podium-score">${formatScore(sortedData[2]?.[5] || '0')} pts</div>
        </div>
    `;
    podiumContainer.innerHTML = podiumHTML;

    sortedData.forEach((row, index) => {
        const tr = document.createElement('tr');
        let html = `
            <td>${index + 1}</td>
            <td>${row[0] || '-'}</td>
        `;

        // Add scores for visible rounds with elimination check
        if (roundVisibility.round1) {
            html += `<td>${formatScore(row[1])}</td>`;
        }
        if (roundVisibility.round2) {
            html += `<td>${formatScore(row[2])}</td>`;
        }
        if (roundVisibility.round3) {
            const isEliminated = row[3]?.toLowerCase() === 'eliminated' || 
                               (typeof row[3] === 'string' && row[3].split(',').every(cell => cell === '-' || cell === ''));
            html += `<td data-status="${isEliminated ? 'eliminated' : ''}">${
                isEliminated ? 'Eliminated' : formatScore(row[3])
            }</td>`;
        }
        if (roundVisibility.round4) {
            const isEliminated = row[4]?.toLowerCase() === 'eliminated';
            html += `<td data-status="${isEliminated ? 'eliminated' : ''}">${
                isEliminated ? 'Eliminated' : formatScore(row[4])
            }</td>`;
        }

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
            <div class="message-content">
                <img src="/images/logo/advitya.png" alt="Advitya Logo" class="message-logo">
                <div class="emoji">📊</div>
                <h2>Leaderboard Coming Soon!</h2>
                <p>The competition is about to begin. Stay tuned for real-time updates and rankings.</p>
                <p>May the best team win!</p>
            </div>
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
