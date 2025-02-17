import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, get, set, onValue } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const firebaseConfig = {
    apiKey: "AIzaSyA_Xdf-e9Scs9rGeROxtXx3XY4RjwlB4ME",
    authDomain: "leaderboard-accde.firebaseapp.com",
    databaseURL: "https://leaderboard-accde-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "leaderboard-accde",
    storageBucket: "leaderboard-accde.firebasestorage.app",
    messagingSenderId: "160063863408",
    appId: "1:160063863408:web:823b71dd101698ecda12b5",
    measurementId: "G-G9Q50F3LDT"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Initialize visibility states if they don't exist
const initializeVisibilityStates = async () => {
    try {
        const rounds = ['round1', 'round2', 'round3', 'round4', 'overall'];
        const visibilityRef = ref(database, 'roundVisibility');
        
        const snapshot = await get(visibilityRef);
        if (!snapshot.exists()) {
            const defaultStates = {};
            rounds.forEach(round => defaultStates[round] = true);
            await set(visibilityRef, defaultStates).catch(error => {
                console.warn('Could not set initial visibility states:', error);
                // Continue anyway as we'll default to showing everything
            });
        }
    } catch (error) {
        console.warn('Error initializing visibility states:', error);
        // Continue execution as we'll default to showing everything
    }
};

// Add this line after database initialization
initializeVisibilityStates().catch(console.error);

export { database, ref, get, set, onValue };
