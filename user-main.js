// user-main.js
// Final and Secure Version
// BADLAV: Firebase initialization ko theek kiya gaya hai. Ab yeh seedhe config se shuru hoga.

import { fetchAndProcessData } from './user-data.js';
import { initUI, renderPage, showLoadingError, promptForDeviceVerification, requestNotificationPermission } from './user-ui.js';

// VAPID key ko yahan hardcode karna surakshit nahi hai, lekin abhi ke liye aavashyak hai.
// Bhavishya mein ise environment variable mein daalna behtar hoga.
const VAPID_KEY = "BH_Ag886B-j-wP9gmmypg2uUP-p2_ljs2a-3iN5FKOym-b-kC1T1a-a-a-A1B2C3D4E5F6G7H8I9J0K";

/**
 * App ko shuru karne ka mukhya function.
 */
async function initializeApp() {
    try {
        // === BADLAV START: FIREBASE CONFIGURATION ===
        // Admin panel se li gayi config, taaki dono panel ek hi database se connect hon.
        // Yahan seedhe configuration object daala gaya hai.
        const firebaseConfig = {
            apiKey: "AIzaSyC66uKzNBb5meMMH3Q_UmmH5TpKfN6mXds",
            authDomain: "re-aa001.firebaseapp.com",
            databaseURL: "https://ramazone-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "ramazone",
            storageBucket: "bank-master-data.appspot.com",
            messagingSenderId: "717138283697",
            appId: "1:778113641069:web:f2d584555dee89b8ca2d64",
            measurementId: "G-JF1DCDTFJ2"
        };
        // === BADLAV END ===

        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        registerServiceWorker();
        
        const auth = firebase.auth();
        const database = firebase.database();

        auth.onAuthStateChanged(user => {
            // Abhi ke liye, hum maan rahe hain ki user hamesha logged in hai.
            // Agar login page hai, to yeh logic sahi kaam karega.
            // if (user) {
                runAppLogic(database);
            // } else {
            //     // Agar user logged in nahi hai, to login page par bhejein.
            //     // window.location.href = '/login.html'; 
            // }
        });

    } catch (error) {
        console.error("FATAL: Could not initialize application.", error);
        showLoadingError(`Application failed to initialize: ${error.message}`);
    }
}

/**
 * Mukhya application logic.
 */
async function runAppLogic(database) {
    try {
        const processedData = await fetchAndProcessData(database);

        if (processedData) {
            initUI(database);
            // Device verification aur notifications ko abhi ke liye comment kar rahe hain
            // taaki pehle core functionality chal sake.
            // verifyDeviceAndSetupNotifications(database, processedData.processedMembers);
            renderPage(processedData);
        }
    } catch (error) {
        console.error("Failed to run main app logic:", error);
        showLoadingError(error.message);
    }
}

/**
 * Service Worker ko register karta hai.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.service-worker.register('/sw.js')
      .then(registration => console.log('Service Worker registered with scope:', registration.scope))
      .catch(error => console.error('Service Worker registration failed:', error));
  }
}

/**
 * Device ko verify aur notifications ke liye setup karta hai.
 */
async function verifyDeviceAndSetupNotifications(database, allMembers) {
    try {
        let memberId = localStorage.getItem('verifiedMemberId');

        if (!memberId) {
            memberId = await promptForDeviceVerification(allMembers);
            if (memberId) {
                localStorage.setItem('verifiedMemberId', memberId);
            } else {
                console.warn('Device verification cancelled by user.');
                return; 
            }
        }
        
        console.log(`Device verified for member: ${memberId}`);

        const permissionGranted = await requestNotificationPermission();
        if (permissionGranted) {
            try {
                await registerForPushNotifications(database, memberId);
            } catch (regError) {
                console.error("Push Notification Registration Failed:", regError);
            }
        }
    } catch (error) {
        console.error('Device verification or notification setup failed:', error);
    }
}

/**
 * Push notifications ke liye register karta hai aur token save karta hai.
 */
async function registerForPushNotifications(database, memberId) {
    if (!VAPID_KEY) {
        console.error("VAPID Key is not available. Push notifications will not work.");
        return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push messaging is not supported');
        return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (subscription === null) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: VAPID_KEY,
        });
    }

    const token = subscription.toJSON().keys.p256dh;
    if (token) {
        const tokenRef = database.ref(`members/${memberId}/notificationTokens/${token}`);
        await tokenRef.set(true);
        console.log('Push notification token saved to Firebase.');
    }
}

// App ko shuru karein
document.addEventListener('DOMContentLoaded', initializeApp);

