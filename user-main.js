// user-main.js
// Yeh file app ka entry point (shuruwat) hai.
// Iska kaam authentication check karna aur dusre modules ko unka kaam saunpna hai.

import { fetchAllData } from './user-data.js';
import { initUI, renderPage, showLoadingError } from './user-ui.js';

// App ko shuru karne ka mukhya function
async function initializeAndRunApp() {
    try {
        // PWA ke liye service worker register karein
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registered successfully', reg))
                .catch(err => console.error('Service Worker registration failed:', err));
        }

        // Vercel se Firebase config fetch karein
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Config fetch failed');
        const firebaseConfig = await response.json();
        if (!firebaseConfig.apiKey) throw new Error('Invalid config received');
        
        // Firebase ko initialize karein
        firebase.initializeApp(firebaseConfig);
        
        const auth = firebase.auth();
        const database = firebase.database();

        // User ke login status ko check karein
        auth.onAuthStateChanged(async user => {
            if (user) {
                // Agar user logged in hai, to poora app chalu karein
                try {
                    // Step 1: UI ke sabhi event listeners ko attach karein
                    initUI(database);
                    
                    // Step 2: Firebase se saara data fetch aur process karein
                    const processedData = await fetchAllData(database);
                    
                    // Step 3: Processed data ko UI par render karein
                    renderPage(processedData);

                } catch (error) {
                    console.error('App failed to run after login:', error);
                    showLoadingError(error.message);
                }
            } else {
                // Agar user logged in nahi hai, to login page par redirect karein
                window.location.href = '/login.html';
            }
        });

    } catch (error) {
        console.error("FATAL: Could not initialize application.", error);
        showLoadingError(`Application Error: ${error.message}`);
    }
}

// App ko shuru karne ke liye event listener
document.addEventListener('DOMContentLoaded', initializeAndRunApp);

