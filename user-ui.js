// user-ui.js
// Is file ka kaam data ko screen par dikhana (render) aur sabhi user interactions (clicks, scrolls) ko handle karna hai.

// --- Global Variables & Element Cache ---
let allMembersData = {};
let penaltyWalletData = {};
let allTransactions = [];
let communityStats = {};
let cardColors = {};
let currentMemberForFullView = null;
let deferredInstallPrompt = null;
let popupsHaveBeenShown = false;

// Element Cache
const getElement = (id) => document.getElementById(id);
const elements = {
    memberContainer: getElement('memberContainer'),
    headerActionsContainer: getElement('headerActionsContainer'),
    staticHeaderButtonsContainer: getElement('staticHeaderButtons'),
    customCardsContainer: getElement('customCardsContainer'),
    communityLetterSlides: getElement('communityLetterSlides'),
    totalMembersValue: getElement('totalMembersValue'),
    totalLoanValue: getElement('totalLoanValue'),
    currentYear: getElement('currentYear'),
    headerDisplay: getElement('headerDisplay'),
    infoSlider: getElement('infoSlider'),
    
    // Modals
    balanceModal: getElement('balanceModal'),
    penaltyWalletModal: getElement('penaltyWalletModal'),
    memberProfileModal: getElement('memberProfileModal'),
    sipStatusModal: getElement('sipStatusModal'),
    notificationModal: getElement('notificationModal'),
    allMembersModal: getElement('allMembersModal'),
    passwordPromptModal: getElement('passwordPromptModal'),
    fullProfileViewModal: getElement('fullProfileViewModal'),
    imageModal: getElement('imageModal'),
};

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const BANK_LOGO_URL = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';

// --- Initialization ---

/**
 * Sabhi static event listeners ko attach karta hai.
 */
export function initUI(database) {
    setupEventListeners(database);
    setupPWA();
    observeElements(document.querySelectorAll('.animate-on-scroll'));
    if (elements.currentYear) elements.currentYear.textContent = new Date().getFullYear();
}

/**
 * Processed data milne ke baad poore page ko render karta hai.
 * @param {object} data - Processed data from user-data.js
 */
export function renderPage(data) {
    // Data ko global variables mein store karein
    allMembersData = data.allMembersData;
    penaltyWalletData = data.penaltyWalletData;
    allTransactions = data.allTransactions;
    communityStats = data.communityStats;
    cardColors = data.adminSettings.card_colors || {};

    // UI update functions ko call karein
    displayHeaderButtons(data.adminSettings.header_buttons || {});
    displayMembers(Object.values(data.allMembersData).filter(m => m.status === 'Approved').sort((a, b) => b.balance - a.balance));
    displayCustomCards(data.adminSettings.custom_cards || {});
    displayCommunityLetters(data.adminSettings.community_letters || {});
    updateInfoCards(Object.keys(data.allMembersData).length, data.communityStats.totalLoanDisbursed);
    startHeaderDisplayRotator(Object.values(data.allMembersData), data.communityStats);
    buildInfoSlider(data.adminSettings);
    processTodaysTransactions();
    
    feather.replace();
}

/**
 * Data load hone mein error aane par message dikhata hai.
 * @param {string} message - Error message.
 */
export function showLoadingError(message) {
    if (elements.memberContainer) {
        elements.memberContainer.innerHTML = `<p class="error-text">❌ ${message}</p>`;
    }
}


// --- Display & Rendering Functions ---

function displayMembers(members) {
    if (!elements.memberContainer) return;
    elements.memberContainer.innerHTML = '';
    if (members.length === 0) {
        elements.memberContainer.innerHTML = '<p class="loading-text">Koi sadasya nahi mila.</p>';
        return;
    }
    
    const medalURLs = [
        "https://www.svgrepo.com/show/452215/gold-medal.svg",
        "https://www.svgrepo.com/show/452101/silver-medal.svg",
        "https://www.svgrepo.com/show/452174/bronze-medal.svg"
    ];
    
    members.forEach((member, index) => {
        const card = document.createElement('div');
        card.className = 'member-card animate-on-scroll';
        let rankHTML = '';
        
        if (index < 3) { 
            rankHTML = `<img src="${medalURLs[index]}" class="rank-icon" alt="Medal">`;
            const rankColor = ['gold', 'silver', 'bronze'][index];
            if (cardColors[rankColor]) {
                card.style.backgroundColor = cardColors[rankColor];
                card.classList.add('colored-card');
            }
        } 
        
        card.innerHTML = `
            ${rankHTML}
            <div class="member-photo-container">
                <img src="${member.displayImageUrl}" alt="${member.name}" class="member-photo" loading="lazy" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
                ${member.isPrime ? '<div class="prime-tag">Prime</div>' : ''}
            </div>
            <p class="member-name" title="${member.name}">${member.name}</p>
            <p class="member-balance">${member.balance.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</p>
        `;
        card.onclick = () => showMemberProfileModal(member.id);
        elements.memberContainer.appendChild(card);
    });
    observeElements(document.querySelectorAll('.animate-on-scroll'));
}

function displayHeaderButtons(buttons) {
    // Yeh function poora nahi hai aur iske karan buttons nahi dikh rahe
}

function displayCustomCards(cards) {
    const section = getElement('customCardsSection');
    if (!elements.customCardsContainer || !section) return;
    elements.customCardsContainer.innerHTML = '';

    const cardArray = Object.values(cards);
    if (cardArray.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    cardArray.forEach(cardData => {
        const cardElement = document.createElement('div');
        cardElement.className = 'custom-card';
        cardElement.innerHTML = `
            <div class="custom-card-img-wrapper">
                <img src="${cardData.imageUrl || DEFAULT_IMAGE}" alt="${cardData.title || ''}" class="custom-card-img" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
                <a href="${cardData.buttonLink || '#'}" class="custom-card-btn" style="background-color: ${cardData.buttonColor || 'var(--primary-color)'}" target="_blank" rel="noopener noreferrer">${cardData.buttonText || 'Learn More'}</a>
            </div>
            <div class="custom-card-content">
                <h3 class="custom-card-title">${cardData.title || ''}</h3>
                <p class="custom-card-desc">${cardData.description || ''}</p>
            </div>
        `;
        elements.customCardsContainer.appendChild(cardElement);
    });
    initializeCustomCardSlider(cardArray);
}

function displayCommunityLetters(letters) {
     // Yeh function poora nahi hai
}

function updateInfoCards(memberCount, totalLoan) {
    if (elements.totalMembersValue) elements.totalMembersValue.textContent = memberCount;
    if (elements.totalLoanValue) elements.totalLoanValue.textContent = totalLoan.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}


// --- Modal Functions ---

function showMemberProfileModal(memberId) {
    const member = allMembersData[memberId];
    if (!member) return;

    currentMemberForFullView = memberId;
    getElement('profileModalImage').src = member.displayImageUrl;
    getElement('profileModalName').textContent = member.name;
    getElement('profileModalJoiningDate').textContent = formatDate(member.joiningDate);
    getElement('profileModalBalance').textContent = member.balance.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    getElement('profileModalReturn').textContent = member.totalReturn.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    getElement('profileModalLoanCount').textContent = member.loanCount;
    
    getElement('profileModalSipStatus').innerHTML = member.sipStatus.paid
        ? `<span class="sip-status-icon paid">✔</span><span class="sip-status-text">Paid: ${member.sipStatus.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>`
        : `<span class="sip-status-icon not-paid">✖</span><span class="sip-status-text">Not Paid</span>`;

    getElement('profileModalBalance').className = `stat-value ${member.balance >= 0 ? 'positive' : 'negative'}`;
    elements.memberProfileModal.classList.toggle('prime-modal', member.isPrime);
    getElement('profileModalPrimeTag').style.display = member.isPrime ? 'block' : 'none';
    
    openModal(elements.memberProfileModal);
}

function showBalanceModal() {
    openModal(elements.balanceModal);
    animateValue(getElement('totalSipAmountDisplay'), 0, communityStats.totalSipAmount, 1200);
    animateValue(getElement('totalCurrentLoanDisplay'), 0, communityStats.totalCurrentLoanAmount, 1200);
    animateValue(getElement('netReturnAmountDisplay'), 0, communityStats.netReturnAmount, 1200);
    animateValue(getElement('availableAmountDisplay'), 0, communityStats.availableCommunityBalance, 1200);
}

function showSipStatusModal() {
    // Is function ka logic bhi poora nahi hai
}

function showAllMembersModal() {
    // Is function ka logic bhi poora nahi hai
}

function showPenaltyWalletModal() {
    // Is function ka logic bhi poora nahi hai
}

function showFullProfileViewModal(memberId) {
    const memberData = allMembersData[memberId];
    const processedMember = { extraBalance: 0 }; // Placeholder

    getElement('fullProfileName').textContent = memberData.fullName;
    getElement('fullProfileMemberId').textContent = memberData.membershipId || 'N/A';
    getElement('fullProfileMobile').textContent = memberData.mobileNumber || 'N/A';
    getElement('fullProfileDob').textContent = formatDate(memberData.dob);
    getElement('fullProfileAadhaar').textContent = memberData.aadhaar || 'N/A';
    getElement('fullProfileAddress').textContent = memberData.address || 'N/A';
    getElement('fullProfileExtraAmount').textContent = (processedMember.extraBalance || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    
    const profilePic = getElement('fullProfilePic');
    profilePic.src = memberData.profilePicUrl || DEFAULT_IMAGE;
    profilePic.onclick = () => showFullImage(profilePic.src, 'Profile Photo');

    const docPic = getElement('fullProfileDoc');
    docPic.src = memberData.documentUrl || DEFAULT_IMAGE;
    docPic.onclick = () => showFullImage(docPic.src, 'Document');

    const signPic = getElement('fullProfileSign');
    signPic.src = memberData.signatureUrl || DEFAULT_IMAGE;
    signPic.onclick = () => showFullImage(signPic.src, 'Signature');

    openModal(elements.fullProfileViewModal);
}


// --- Event Listeners & Helpers ---

function setupEventListeners(database) {
    document.body.addEventListener('click', (e) => {
        if (e.target.matches('.close, .close *')) {
            const modal = e.target.closest('.modal');
            if (modal) closeModal(modal);
        }
        if (e.target.matches('.modal')) closeModal(e.target);
        if (e.target.closest('#totalMembersCard')) showAllMembersModal();
        if (e.target.closest('#fullViewBtn')) {
            closeModal(elements.memberProfileModal);
            openModal(elements.passwordPromptModal);
        }
        if (e.target.closest('#submitPasswordBtn')) handlePasswordCheck(database);
        if (e.target.closest('#viewHistoryBtn')) {
            // Logic missing
        }
        if (e.target.closest('#profileModalHeader')) {
            const imgSrc = getElement('profileModalImage').src;
            if (imgSrc) showFullImage(imgSrc, getElement('profileModalName').textContent);
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') document.querySelectorAll('.modal.show').forEach(closeModal);
    });
    
    getElement('passwordInput').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handlePasswordCheck(database);
    });
}

function attachDynamicButtonListeners() {
    // Is function ka logic poora nahi hai, isliye buttons kaam nahi kar rahe
}


// --- Other UI Logic ---

function initializeLetterSlider() {
    // Is function ka logic poora nahi hai
}

function initializeCustomCardSlider(cards) {
    // Is function ka logic poora nahi hai
}

function startHeaderDisplayRotator(members, stats) {
    // Is function ka logic poora nahi hai
}

function buildInfoSlider() {
    // Is function ka logic poora nahi hai
}

function processTodaysTransactions() {
    // Is function ka logic poora nahi hai
}

function displayNotifications() {
    // Is function ka logic poora nahi hai
}

function showPopupNotification(tx) {
    // Is function ka logic poora nahi hai
}

function setupPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        const installBtn = getElement('installAppBtn');
        if (installBtn) installBtn.style.display = 'inline-flex';
    });
}

function animateValue(el, start, end, duration) {
    if (!el) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const currentValue = Math.floor(progress * (end - start) + start);
        el.textContent = currentValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

// === Yeh purana logic hai jo modal kholta hai ===
async function handlePasswordCheck(database) {
    const input = getElement('passwordInput');
    const password = input.value;
    if (!password) return alert('Please enter password.');

    try {
        const snapshot = await database.ref(`members/${currentMemberForFullView}/password`).once('value');
        if (password === snapshot.val()) {
            closeModal(elements.passwordPromptModal);
            // Modal kholne ka logic
            showFullProfileViewModal(currentMemberForFullView);
            input.value = '';
        } else {
            alert('Incorrect password.');
            input.value = '';
        }
    } catch (error) {
        alert('Could not verify password.');
    }
}
// ===============================================

function openModal(modal) { if (modal) { modal.classList.add('show'); document.body.style.overflow = 'hidden'; } }
function closeModal(modal) { if (modal) { modal.classList.remove('show'); document.body.style.overflow = ''; } }
function showFullImage(src, alt) { getElement('fullImageSrc').src = src; getElement('fullImageSrc').alt = alt; openModal(elements.imageModal); }
const scrollObserver = new IntersectionObserver((entries) => { entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('is-visible'); }); }, { threshold: 0.1 });
function observeElements(elements) { elements.forEach(el => scrollObserver.observe(el)); }
function formatDate(dateString) { return dateString ? new Date(dateString).toLocaleDateString('en-GB') : 'N/A'; }


