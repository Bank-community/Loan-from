// user-main.js
// Yeh file app ka "Director" hai. Yeh app ko shuru karta hai,
// authentication check karta hai, aur baaki files ko unka kaam saunpta hai.

import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, showLoadingError } from './user-ui.js';

/**
 * App ko shuru karne ka mukhya function.
 * Firebase config fetch karta hai aur user authentication check karta hai.
 */
async function checkAuthAndInitialize() {
    try {
        // Vercel se Firebase configuration securely fetch karein
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Configuration failed to load.');
        const firebaseConfig = await response.json();
        if (!firebaseConfig.apiKey) throw new Error('Invalid config received');
        
        firebase.initializeApp(firebaseConfig);
        
        const auth = firebase.auth();
        const database = firebase.database();

        // User ke login status mein badlav ko sunein
        auth.onAuthStateChanged(user => {
            if (user) {
                // Agar user logged in hai, to mukhya app logic chalayein
                runAppLogic(database);
            } else {
                // Agar user logged in nahi hai, to login page par bhej dein
                window.location.href = '/login.html';
            }
        });

    } catch (error) {
        console.error("FATAL: Could not initialize application.", error);
        // UI par error dikhayein
        showLoadingError(`Application failed to initialize: ${error.message}`);
    }
}

/**
 * Mukhya application logic. Data fetch karta hai aur UI ko render karta hai.
 * @param {firebase.database.Database} database - Firebase database instance.
 */
async function runAppLogic(database) {
    try {
        // Step 1: user-data.js se saara data fetch aur process karwayein
        const processedData = await fetchAndProcessData(database);

        if (processedData) {
            // Step 2: user-ui.js ko UI initialize karne ke liye bolein
            initUI(database);
            
            // Step 3: user-ui.js ko process kiya hua data dekar poora page render karwayein
            renderPage(processedData);
        }
    } catch (error) {
        console.error("Failed to run main app logic:", error);
        showLoadingError(error.message);
    }
}

// --- App ko shuru karein ---
// Jab poora HTML document load ho jaye, tab app initialization shuru karein.
document.addEventListener('DOMContentLoaded', checkAuthAndInitialize);


