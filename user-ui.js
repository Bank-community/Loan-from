// user-ui.js
// Is file ka kaam data ko screen par dikhana (render) aur sabhi user interactions (clicks, scrolls) ko handle karna hai.

// --- Global Variables & Element Cache ---
let allMembersData = {};
let penaltyWalletData = {};
let allTransactions = [];
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
    allMembersData = data.processedMembers.reduce((obj, member) => {
        obj[member.id] = member;
        return obj;
    }, {});
    penaltyWalletData = data.penaltyWalletData;
    allTransactions = data.allTransactions;
    cardColors = data.adminSettings.card_colors || {};

    // UI update functions ko call karein
    displayHeaderButtons(data.adminSettings.header_buttons || {});
    displayMembers(data.processedMembers);
    displayCustomCards(data.adminSettings.custom_cards || {});
    displayCommunityLetters(data.adminSettings.community_letters || {});
    updateInfoCards(data.processedMembers.length, data.communityStats.totalLoanDisbursed);
    startHeaderDisplayRotator(data.processedMembers, data.communityStats);
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
    if (!elements.headerActionsContainer || !elements.staticHeaderButtonsContainer) return;
    elements.headerActionsContainer.innerHTML = '';
    elements.staticHeaderButtonsContainer.innerHTML = '';

    if (Object.keys(buttons).length === 0) return;

    const buttonWrapper = document.createElement('div');
    buttonWrapper.className = 'dynamic-buttons-wrapper';

    Object.values(buttons).sort((a,b) => (a.order || 0) - (b.order || 0)).forEach(btnData => {
        const isLink = btnData.url && !btnData.id;
        const element = document.createElement(isLink ? 'a' : 'button');

        element.className = `${btnData.base_class || 'civil-button'} ${btnData.style_preset || ''}`;
        if (btnData.id) element.id = btnData.id;
        if (isLink) {
            element.href = btnData.url;
            if (btnData.target) element.target = btnData.target;
        }
        
        element.innerHTML = `${btnData.icon_svg || ''}<b>${btnData.name || ''}</b>` + (btnData.id === 'notificationBtn' ? '<span id="notificationDot" class="notification-dot"></span>' : '');

        Object.assign(element.style, {
            backgroundColor: btnData.transparent ? 'transparent' : btnData.color,
            color: btnData.textColor, width: btnData.width, height: btnData.height,
            borderRadius: btnData.borderRadius, borderColor: btnData.borderColor,
            borderWidth: btnData.borderWidth,
            borderStyle: (parseFloat(btnData.borderWidth) > 0 || btnData.style_preset === 'btn-outline') ? 'solid' : 'none'
        });

        if (['viewBalanceBtn', 'viewPenaltyWalletBtn'].includes(btnData.id)) {
            elements.staticHeaderButtonsContainer.appendChild(element);
        } else {
            buttonWrapper.appendChild(element);
        }
    });
    
    elements.headerActionsContainer.appendChild(buttonWrapper);
    attachDynamicButtonListeners();
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
    if (!elements.communityLetterSlides) return;
    elements.communityLetterSlides.innerHTML = '';
    const letterArray = Object.values(letters);
    if (letterArray.length === 0) {
        elements.communityLetterSlides.innerHTML = `<div class="slide"><p class="p-8 text-center text-gray-500">No letters available.</p></div>`;
    } else {
        letterArray.forEach(letter => {
            elements.communityLetterSlides.innerHTML += `<div class="slide"><img src="${letter.imageUrl}" alt="${letter.altText || 'Letter'}" loading="lazy" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';"></div>`;
        });
    }
    initializeLetterSlider();
}

function updateInfoCards(memberCount, totalLoan) {
    if (elements.totalMembersValue) elements.totalMembersValue.textContent = memberCount;
    if (elements.totalLoanValue) elements.totalLoanValue.textContent = totalLoan.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

// --- Modal Functions ---

function showMemberProfileModal(memberId) {
    const member = allMembersData[memberId];
    if (!member) return;

    currentMemberForFullView = member.id;
    getElement('profileModalImage').src = member.displayImageUrl;
    getElement('profileModalName').textContent = member.name;
    getElement('profileModalJoiningDate').textContent = formatDate(member.joiningDate);
    getElement('profileModalBalance').textContent = member.balance.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    getElement('profileModalReturn').textContent = member.totalReturn.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
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
    const stats = calculateCommunityStats(Object.values(allMembersData), allTransactions, {}, penaltyWalletData);
    openModal(elements.balanceModal);

    animateValue(getElement('totalSipAmountDisplay'), 0, stats.totalSipAmount, 1200);
    animateValue(getElement('totalCurrentLoanDisplay'), 0, stats.totalCurrentLoanAmount, 1200);
    animateValue(getElement('netReturnAmountDisplay'), 0, stats.netReturnAmount, 1200);
    animateValue(getElement('availableAmountDisplay'), 0, stats.availableCommunityBalance, 1200);
}

function showSipStatusModal() {
    const container = getElement('sipStatusListContainer');
    if (!container) return;
    container.innerHTML = '';
    
    const sortedMembers = Object.values(allMembersData).sort((a, b) => 
        (b.sipStatus.paid ? 1 : 0) - (a.sipStatus.paid ? 1 : 0) || a.name.localeCompare(b.name)
    );
    
    sortedMembers.forEach(member => {
        const item = document.createElement('div');
        item.className = 'sip-status-item';
        const statusClass = member.sipStatus.paid ? 'paid' : 'not-paid';
        item.innerHTML = `
            <img src="${member.displayImageUrl}" alt="${member.name}" loading="lazy" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
            <span class="sip-status-name">${member.name}</span>
            <span class="sip-status-badge ${statusClass}">${member.sipStatus.paid ? 'Paid' : 'Not Paid'}</span>`;
        container.appendChild(item);
    });
    openModal(elements.sipStatusModal);
}

function showAllMembersModal() {
    const container = getElement('allMembersListContainer');
    if (!container) return;
    container.innerHTML = '';

    const sortedMembers = Object.values(allMembersData).sort((a, b) => a.name.localeCompare(b.name));

    sortedMembers.forEach(member => {
        const item = document.createElement('div');
        item.className = 'sip-status-item';
        item.innerHTML = `
            <img src="${member.profilePicUrl || DEFAULT_IMAGE}" alt="${member.fullName}">
            <span class="sip-status-name">${member.fullName}</span>`;
        container.appendChild(item);
    });
    openModal(elements.allMembersModal);
}

function showPenaltyWalletModal() {
    const incomes = Object.values(penaltyWalletData.incomes || {}).map(i => ({...i, type: 'income'}));
    const expenses = Object.values(penaltyWalletData.expenses || {}).map(e => ({...e, type: 'expense'}));
    const history = [...incomes, ...expenses].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const totalIncomes = incomes.reduce((sum, i) => sum + i.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    
    getElement('penaltyBalance').textContent = `₹${(totalIncomes - totalExpenses).toLocaleString('en-IN')}`;
    const list = getElement('penaltyHistoryList');
    list.innerHTML = '';
    list.classList.remove('visible');
    getElement('viewHistoryBtn').textContent = 'View History';

    if (history.length === 0) {
        list.innerHTML = `<li class="no-penalty-history">No records found.</li>`;
    } else {
        history.forEach(tx => {
            const isIncome = tx.type === 'income';
            list.innerHTML += `
                <li class="penalty-history-item">
                    <div class="penalty-details">
                        <p class="penalty-text"><strong>${isIncome ? tx.from : tx.reason}</strong></p>
                        <div class="penalty-time">${isIncome ? tx.reason : ''} · ${new Date(tx.timestamp).toLocaleString('en-GB')}</div>
                    </div>
                    <span class="penalty-amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '-'} ₹${tx.amount.toLocaleString('en-IN')}</span>
                </li>`;
        });
    }
    openModal(elements.penaltyWalletModal);
}

function showFullProfileViewModal() {
    const memberData = allMembersData[currentMemberForFullView];
    if (!memberData) return;
    
    getElement('fullProfileName').textContent = memberData.fullName;
    getElement('fullProfileMemberId').textContent = memberData.membershipId || 'N/A';
    getElement('fullProfileMobile').textContent = memberData.mobileNumber || 'N/A';
    getElement('fullProfileDob').textContent = formatDate(memberData.dob);
    getElement('fullProfileAadhaar').textContent = memberData.aadhaar || 'N/A';
    getElement('fullProfileAddress').textContent = memberData.address || 'N/A';
    getElement('fullProfileExtraAmount').textContent = (memberData.extraBalance || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    
    const pic = getElement('fullProfilePic');
    pic.src = memberData.profilePicUrl || DEFAULT_IMAGE;
    pic.onclick = () => showFullImage(pic.src, 'Profile Photo');

    const doc = getElement('fullProfileDoc');
    doc.src = memberData.documentUrl || DEFAULT_IMAGE;
    doc.onclick = () => showFullImage(doc.src, 'Document');

    const sign = getElement('fullProfileSign');
    sign.src = memberData.signatureUrl || DEFAULT_IMAGE;
    sign.onclick = () => showFullImage(sign.src, 'Signature');

    openModal(elements.fullProfileViewModal);
}

// --- Event Listeners & Helpers ---

function setupEventListeners(database) {
    document.body.addEventListener('click', (e) => {
        // Modal close buttons
        if (e.target.matches('.close, .close *')) {
            const modal = e.target.closest('.modal');
            if (modal) closeModal(modal);
        }
        // Modal overlay click to close
        if (e.target.matches('.modal')) {
            closeModal(e.target);
        }
        // Specific button clicks
        if (e.target.closest('#totalMembersCard')) showAllMembersModal();
        if (e.target.closest('#fullViewBtn')) {
            closeModal(elements.memberProfileModal);
            openModal(elements.passwordPromptModal);
        }
        if (e.target.closest('#submitPasswordBtn')) handlePasswordCheck(database);
        if (e.target.closest('#viewHistoryBtn')) {
            const list = getElement('penaltyHistoryList');
            list.classList.toggle('visible');
            e.target.textContent = list.classList.contains('visible') ? 'Hide History' : 'View History';
        }
        if (e.target.closest('#profileModalHeader')) {
            const imgSrc = getElement('profileModalImage').src;
            if (imgSrc) showFullImage(imgSrc, getElement('profileModalName').textContent);
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.show').forEach(closeModal);
        }
    });

    getElement('passwordInput').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handlePasswordCheck(database);
    });
}

function attachDynamicButtonListeners() {
    const sipStatusBtn = getElement('sipStatusBtn');
    const notificationBtn = getElement('notificationBtn');
    const installBtn = getElement('installAppBtn');
    const viewBalanceBtn = getElement('viewBalanceBtn');
    const viewPenaltyWalletBtn = getElement('viewPenaltyWalletBtn');

    if (sipStatusBtn) sipStatusBtn.onclick = showSipStatusModal;
    if (viewBalanceBtn) viewBalanceBtn.onclick = showBalanceModal;
    if (viewPenaltyWalletBtn) viewPenaltyWalletBtn.onclick = showPenaltyWalletModal;
    
    if (notificationBtn) notificationBtn.onclick = () => {
        displayNotifications();
        openModal(elements.notificationModal);
        const dot = getElement('notificationDot');
        if (dot) dot.style.display = 'none';
        sessionStorage.setItem(`notificationsViewed_${new Date().toISOString().split('T')[0]}`, 'true');
    };
    
    if (installBtn) installBtn.onclick = async () => {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            installBtn.style.display = 'none';
        }
    };
}

// --- Other UI Logic ---
// (Slider, PWA, Animations, etc.)

function initializeLetterSlider() { /* ... implementation from original file ... */ }
function initializeCustomCardSlider(cards) { /* ... implementation ... */ }
function startHeaderDisplayRotator(members, stats) { /* ... implementation ... */ }
function buildInfoSlider(adminSettings) { /* ... implementation ... */ }
function processTodaysTransactions() { /* ... implementation ... */ }
function displayNotifications() { /* ... implementation ... */ }
function showPopupNotification(tx) { /* ... implementation ... */ }
function setupPWA() { /* ... implementation ... */ }
function animateValue(el, start, end, duration) { /* ... implementation ... */ }
function formatDate(dateString) { return dateString ? new Date(dateString).toLocaleDateString('en-GB') : 'N/A'; }
function openModal(modal) { if (modal) { modal.classList.add('show'); document.body.style.overflow = 'hidden'; } }
function closeModal(modal) { if (modal) { modal.classList.remove('show'); document.body.style.overflow = ''; } }
function showFullImage(src, alt) { getElement('fullImageSrc').src = src; getElement('fullImageSrc').alt = alt; openModal(elements.imageModal); }
const scrollObserver = new IntersectionObserver((entries, observer) => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }); }, { threshold: 0.1 });
function observeElements(elements) { elements.forEach(el => scrollObserver.observe(el)); }

async function handlePasswordCheck(database) {
    const input = getElement('passwordInput');
    const password = input.value;
    if (!password) { return alert('Please enter password.'); }

    try {
        const snapshot = await database.ref(`members/${currentMemberForFullView}/password`).once('value');
        const correctPassword = snapshot.val();
        if (password === correctPassword) {
            closeModal(elements.passwordPromptModal);
            showFullProfileViewModal();
            input.value = '';
        } else {
            alert('Incorrect password.');
            input.value = '';
        }
    } catch (error) {
        alert('Could not verify password. Please try again.');
        console.error(error);
    }
}

