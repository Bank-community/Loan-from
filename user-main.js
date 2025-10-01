// user-main.js
// Yeh file app ka "Director" hai. Yeh app ko shuru karta hai,
// authentication check karta hai, aur baaki files ko unka kaam saunpta hai.

import { fetchAndProcessData } from './user-data.js';
// === YAHAN BADLAV KIYA GAYA HAI ===
import { initUI, renderPage, showLoadingError, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';
// === BADLAV SAMAPT ===

// === YAHAN BADLAV KIYA GAYA HAI ===
// !! IMPORTANT !! Aapko Firebase Console se apna VAPID key yahan daalna hoga.
const VAPID_KEY = 'YOUR_FIREBASE_MESSAGING_VAPID_KEY';
// === BADLAV SAMAPT ===

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
        
        // === YAHAN BADLAV KIYA GAYA HAI ===
        // Service worker ko register karein
        registerServiceWorker();
        // === BADLAV SAMAPT ===
        
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
            
            // === YAHAN BADLAV KIYA GAYA HAI ===
            // Step 3: Device ko verify karein aur push notifications setup karein
            await verifyDeviceAndSetupNotifications(database, processedData.processedMembers);
            // === BADLAV SAMAPT ===
            
            // Step 4: user-ui.js ko process kiya hua data dekar poora page render karwayein
            renderPage(processedData);
        }
    } catch (error)
    {
        console.error("Failed to run main app logic:", error);
        showLoadingError(error.message);
    }
}

// === YAHAN NAYA FUNCTION JODA GAYA HAI ===
/**
 * Service Worker ko browser mein register karta hai.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('Service Worker registered with scope:', registration.scope);
      }).catch(error => {
        console.error('Service Worker registration failed:', error);
      });
  }
}

/**
 * Device ko verify karta hai aur push notifications ke liye setup karta hai.
 * @param {firebase.database.Database} database - Firebase database instance.
 * @param {Array} allMembers - Sabhi members ka array.
 */
async function verifyDeviceAndSetupNotifications(database, allMembers) {
    try {
        let memberId = localStorage.getItem('verifiedMemberId');

        // Agar device pehle se verified nahi hai, to user se naam poochein
        if (!memberId) {
            memberId = await promptForDeviceVerification(allMembers);
            if (memberId) {
                localStorage.setItem('verifiedMemberId', memberId);
            } else {
                console.warn('Device verification cancelled by user.');
                return; // User ne cancel kar diya
            }
        }
        
        console.log(`Device verified for member: ${memberId}`);

        // Notification ki permission lein
        const permissionGranted = await requestNotificationPermission();
        if (permissionGranted) {
            await registerForPushNotifications(database, memberId);
        }

    } catch (error) {
        console.error('Device verification or notification setup failed:', error);
    }
}

/**
 * Push notifications ke liye register karta hai aur token ko Firebase mein save karta hai.
 * @param {firebase.database.Database} database - Firebase database instance.
 * @param {string} memberId - Verified member ki ID.
 */
async function registerForPushNotifications(database, memberId) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push messaging is not supported');
        return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    // Agar subscription nahi hai, to naya banayein
    if (subscription === null) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: VAPID_KEY,
        });
    }

    // Subscription token ko Firebase mein save karein
    const token = subscription.toJSON().keys.p256dh; // Ek unique part of the token
    if (token) {
        const tokenRef = database.ref(`members/${memberId}/notificationTokens/${token}`);
        await tokenRef.set(true);
        console.log('Push notification token saved to Firebase.');
    }
}

// === BADLAV SAMAPT ===

// --- App ko shuru karein ---
// Jab poora HTML document load ho jaye, tab app initialization shuru karein.
document.addEventListener('DOMContentLoaded', checkAuthAndInitialize);

