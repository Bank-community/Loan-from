// user-ui.js
// Is file ka kaam data ko screen par dikhana (render) aur sabhi user interactions (clicks, scrolls) ko handle karna hai.

// --- Global Variables & Element Cache ---
let allMembersData = {};
let penaltyWalletData = {};
let allTransactions = [];
let communityStats = {};
let cardColors = {};
let currentMemberForFullView = null; // Yeh variable store karega ki kis member ka profile khula hai
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
    allMembersData = data.allMembersData;
    penaltyWalletData = data.penaltyWalletData;
    allTransactions = data.allTransactions;
    communityStats = data.communityStats;
    cardColors = data.adminSettings.card_colors || {};

    displayHeaderButtons(data.adminSettings.header_buttons || {});
    const approvedMembers = Object.values(allMembersData).filter(m => m.status === 'Approved').sort((a, b) => b.balance - a.balance);
    displayMembers(approvedMembers);
    displayCustomCards(data.adminSettings.custom_cards || {});
    displayCommunityLetters(data.adminSettings.community_letters || {});
    updateInfoCards(approvedMembers.length, data.communityStats.totalLoanDisbursed);
    startHeaderDisplayRotator(approvedMembers, data.communityStats);
    buildInfoSlider();
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
    const container = getElement('sipStatusListContainer');
    if (!container) return;
    container.innerHTML = '';
    
    const sortedMembers = Object.values(allMembersData).filter(m => m.status === 'Approved').sort((a, b) => 
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

    const sortedMembers = Object.values(allMembersData).filter(m => m.status === 'Approved').sort((a, b) => a.name.localeCompare(b.name));

    sortedMembers.forEach(member => {
        const item = document.createElement('div');
        item.className = 'sip-status-item';
        item.innerHTML = `
            <img src="${member.profilePicUrl || DEFAULT_IMAGE}" alt="${member.name}">
            <span class="sip-status-name">${member.name}</span>`;
        container.appendChild(item);
    });
    openModal(elements.allMembersModal);
}

function showPenaltyWalletModal() {
    const incomes = Object.values(penaltyWalletData.incomes || {}).map(i => ({...i, type: 'income'}));
    const expenses = Object.values(penaltyWalletData.expenses || {}).map(e => ({...e, type: 'expense'}));
    const history = [...incomes, ...expenses].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    getElement('penaltyBalance').textContent = `₹${communityStats.totalPenaltyBalance.toLocaleString('en-IN')}`;
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
        if (e.key === 'Escape') document.querySelectorAll('.modal.show').forEach(closeModal);
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

function initializeLetterSlider() {
    const slidesContainer = elements.communityLetterSlides;
    if (!slidesContainer || slidesContainer.children.length === 0) return;

    slidesContainer.querySelectorAll('.slide img').forEach(img => {
        img.onclick = () => showFullImage(img.src, img.alt);
    });

    let currentSlideIndex = 0;
    const slides = slidesContainer.children;
    const totalSlides = slides.length;
    const indicator = getElement('slideIndicator');
    indicator.innerHTML = '';

    for (let i = 0; i < totalSlides; i++) {
        const dot = document.createElement('span');
        dot.className = 'indicator-dot';
        dot.onclick = () => showSlide(i);
        indicator.appendChild(dot);
    }
    
    const showSlide = (index) => {
        currentSlideIndex = (index + totalSlides) % totalSlides;
        slidesContainer.style.transform = `translateX(${-currentSlideIndex * 100}%)`;
        indicator.childNodes.forEach((dot, idx) => dot.classList.toggle('active', idx === currentSlideIndex));
    };

    getElement('prevSlideBtn').onclick = () => showSlide(currentSlideIndex - 1);
    getElement('nextSlideBtn').onclick = () => showSlide(currentSlideIndex + 1);
    showSlide(0);
}

function initializeCustomCardSlider(cards) {
    const container = elements.customCardsContainer;
    const indicator = getElement('custom-cards-indicator');
    if (!container || !indicator || cards.length <= 1) {
        if (indicator) indicator.style.display = 'none';
        return;
    }
    
    indicator.style.display = 'block';
    indicator.innerHTML = '';
    cards.forEach((card, index) => {
        const dot = document.createElement('span');
        dot.className = 'indicator-dot';
        dot.style.backgroundImage = `url(${card.imageUrl})`;
        dot.onclick = () => container.children[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        indicator.appendChild(dot);
    });

    const updateActiveDot = () => {
        if (container.children.length === 0) return;
        const scrollLeft = container.scrollLeft;
        let activeIndex = Math.round(scrollLeft / container.children[0].offsetWidth);
        indicator.childNodes.forEach((dot, idx) => dot.classList.toggle('active', idx === activeIndex));
    };

    container.addEventListener('scroll', updateActiveDot, { passive: true });
    updateActiveDot();
}

function startHeaderDisplayRotator(members, stats) {
    const adContainer = elements.headerDisplay.querySelector('.ad-content');
    const ads = [];
    
    const topThree = members.slice(0, 3);
    if (topThree.length >= 3) {
        ads.push(() => {
            let topThreeHtml = topThree.map(member => `
                <div class="ad-top-three-member">
                    <img src="${member.displayImageUrl}" class="ad-top-three-img" alt="${member.name}">
                    <p class="ad-top-three-name">${member.name}</p>
                    <p class="ad-top-three-amount">${member.balance.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</p>
                </div>`).join('');
            return `<div class="ad-headline">🚀 Top 3 Wealth Creators 🚀</div><div class="ad-top-three-container">${topThreeHtml}</div>`;
        });
    }

    if (stats) {
        ads.push(() => `
            <div class="ad-bank-stats-container">
                <img src="${BANK_LOGO_URL}" alt="Bank Logo" class="ad-bank-logo">
                <ul class="ad-bank-stats">
                    <li>Established: <strong>23 June 2024</strong></li>
                    <li>Total Members: <strong>${members.length}</strong></li>
                    <li>Loan Disbursed: <strong>${stats.totalLoanDisbursed.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</strong></li>
                </ul>
            </div>`);
    }

    if (ads.length === 0) return;
    let currentAdIndex = 0;
    const showNextAd = () => {
        adContainer.innerHTML = ads[currentAdIndex]();
        currentAdIndex = (currentAdIndex + 1) % ads.length;
    };
    showNextAd();
    setInterval(showNextAd, 6000);
}

function buildInfoSlider() {
    if (!elements.infoSlider) return;
    elements.infoSlider.innerHTML = '';
    const infoCards = [
        { icon: 'dollar-sign', title: 'Fund Deposit', text: 'Sabhi sadasya milkar fund jama karte hain <strong>(Every Month SIP)</strong> ke roop mein.' },
        { icon: 'gift', title: 'Loan Provision', text: 'Zarooratmand sadasya ko usi fund se <strong>loan</strong> diya jaata hai.' },
        { icon: 'calendar', title: 'Loan Duration', text: 'Loan keval <strong>1 mahine</strong> ke liye hota hai (nyunatam byaj par).' },
        { icon: 'percent', title: 'Interest Rate', text: 'Avadhi aur rashi ke anusaar byaj darein badal sakti hain.' }
    ];
    infoCards.forEach(card => {
        elements.infoSlider.innerHTML += `<div class="info-card-slide"><h3 class="flex items-center justify-center gap-2"><i data-feather="${card.icon}"></i> ${card.title}</h3><p>${card.text}</p></div>`;
    });
    feather.replace();
}

function processTodaysTransactions() {
    const today = new Date().toISOString().split('T')[0];
    const todaysTransactions = allTransactions.filter(tx => new Date(tx.date).toISOString().split('T')[0] === today);

    if (!popupsHaveBeenShown && todaysTransactions.length > 0) {
        todaysTransactions.forEach((tx, index) => {
            setTimeout(() => showPopupNotification(tx), index * 1500);
        });
        popupsHaveBeenShown = true;
    }
    
    const viewedToday = sessionStorage.getItem(`notificationsViewed_${today}`);
    const dot = getElement('notificationDot');
    if (dot && todaysTransactions.length > 0 && !viewedToday) {
        dot.style.display = 'block';
    }
}

function displayNotifications() {
    const list = getElement('notificationList');
    list.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    const todaysTransactions = allTransactions.filter(tx => new Date(tx.date).toISOString().split('T')[0] === today).sort((a,b) => new Date(b.date) - new Date(a.date));

    if (todaysTransactions.length === 0) {
        list.innerHTML = `<li class="no-notifications">No activity today.</li>`;
        return;
    }

    todaysTransactions.forEach(tx => {
        let text = '', amount = '', typeClass = '';
        const member = allMembersData[tx.memberId];
        if(!member) return;

        switch(tx.type) {
            case 'SIP': text = `<strong>${member.name}</strong> paid their SIP.`; amount = `+ ₹${tx.amount.toLocaleString()}`; typeClass = 'sip'; break;
            case 'Loan Taken': text = `A loan was disbursed to <strong>${member.name}</strong>.`; amount = `- ₹${tx.amount.toLocaleString()}`; typeClass = 'loan'; break;
            case 'Loan Payment': text = `<strong>${member.name}</strong> made a loan payment.`; amount = `+ ₹${tx.principalPaid.toLocaleString()}`; typeClass = 'payment'; break;
        }
        
        list.innerHTML += `
            <li class="notification-item">
                <img src="${member.profilePicUrl || DEFAULT_IMAGE}" alt="${member.name}">
                <div class="notification-details">
                    <p class="notification-text">${text}</p>
                    <div class="notification-time">${new Date(tx.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <span class="notification-amount ${typeClass}">${amount}</span>
            </li>`;
    });
}

function showPopupNotification(tx) {
    const container = getElement('notification-popup-container');
    if (!container) return;
    const member = allMembersData[tx.memberId];
    if (!member) return;

    const popup = document.createElement('div');
    popup.className = 'notification-popup';
    let text = '', amount = '', typeClass = '';

    switch(tx.type) {
        case 'SIP': text = `<p><strong>${member.name}</strong> paid their SIP.</p>`; amount = `+ ₹${tx.amount.toLocaleString()}`; typeClass = 'sip'; break;
        case 'Loan Taken': text = `<p>Loan disbursed to <strong>${member.name}</strong>.</p>`; amount = `- ₹${tx.amount.toLocaleString()}`; typeClass = 'loan'; break;
        case 'Loan Payment': text = `<p><strong>${member.name}</strong> made a loan payment.</p>`; amount = `+ ₹${tx.principalPaid.toLocaleString()}`; typeClass = 'payment'; break;
        default: return;
    }

    popup.innerHTML = `
        <img src="${member.profilePicUrl}" alt="${member.name}" class="notification-popup-img">
        <div class="notification-popup-content">
            ${text}<p class="notification-popup-amount ${typeClass}">${amount}</p>
        </div>
        <button class="notification-popup-close">&times;</button>`;
    
    popup.querySelector('.notification-popup-close').onclick = () => {
        popup.classList.add('closing');
        popup.addEventListener('animationend', () => popup.remove(), { once: true });
    };
    popup.addEventListener('animationend', (e) => {
        if (e.animationName === 'fadeOutNotification') popup.remove();
    }, { once: true });
    container.appendChild(popup);
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

async function handlePasswordCheck(database) {
    const input = getElement('passwordInput');
    const password = input.value;
    if (!password) return alert('Please enter password.');

    try {
        const snapshot = await database.ref(`members/${currentMemberForFullView}/password`).once('value');
        const correctPassword = snapshot.val();
        
        if (password === correctPassword) {
            closeModal(elements.passwordPromptModal);
            window.location.href = `view.html?memberId=${currentMemberForFullView}`;
        } else {
            alert('Incorrect password.');
            input.value = '';
        }
    } catch (error) {
        alert('Could not verify password. Please try again.');
        console.error("Password check failed:", error);
    }
}

function openModal(modal) { if (modal) { modal.classList.add('show'); document.body.style.overflow = 'hidden'; } }
function closeModal(modal) { if (modal) { modal.classList.remove('show'); document.body.style.overflow = ''; } }
function showFullImage(src, alt) { getElement('fullImageSrc').src = src; getElement('fullImageSrc').alt = alt; openModal(elements.imageModal); }
const scrollObserver = new IntersectionObserver((entries) => { entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('is-visible'); }); }, { threshold: 0.1 });
function observeElements(elements) { elements.forEach(el => scrollObserver.observe(el)); }
function formatDate(dateString) { return dateString ? new Date(dateString).toLocaleDateString('en-GB') : 'N/A'; }


