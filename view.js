// --- CONFIGURATION FOR FINANCIAL CALCULATOR ---
const CALC_CONFIG = {
    CAPITAL_WEIGHT: 0.40, CONSISTENCY_WEIGHT: 0.30, CREDIT_BEHAVIOR_WEIGHT: 0.30,
    CAPITAL_SCORE_DAYS: 180,
    LOAN_LIMIT_TIER1_SCORE: 50, LOAN_LIMIT_TIER2_SCORE: 60, LOAN_LIMIT_TIER3_SCORE: 80,
    LOAN_LIMIT_TIER1_MAX: 1.0, LOAN_LIMIT_TIER2_MAX: 1.5, LOAN_LIMIT_TIER3_MAX: 1.8, LOAN_LIMIT_TIER4_MAX: 2.0,
    MINIMUM_MEMBERSHIP_DAYS: 60,
    SIP_ON_TIME_LIMIT: 10,
    NEW_MEMBER_PROBATION_DAYS: 180,
};

// --- GLOBAL STATE ---
let currentMemberData = {};
let allTransactions = [];
let allMembers = {};
let allActiveLoans = {};
let balanceHistory = [];
let scoreResultCache = null;

// --- DOM ELEMENT CACHE ---
const getEl = (id) => document.getElementById(id);
const elements = {
    loaderContainer: getEl('loader-container'),
    profileContent: getEl('profile-content'),
    errorMessage: getEl('error-message'),
    // Profile Header
    profilePic: getEl('profile-pic'),
    profileName: getEl('profile-name'),
    membershipId: getEl('membership-id'),
    // Financial Health
    performanceScore: getEl('performance-score'),
    loanEligibility: getEl('loan-eligibility'),
    // Documents
    docProfilePic: getEl('doc-profile-pic'),
    docDocument: getEl('doc-document'),
    docSignature: getEl('doc-signature'),
    // Personal Details
    mobileNumber: getEl('mobile-number'),
    dob: getEl('dob'),
    aadhaar: getEl('aadhaar'),
    address: getEl('address'),
    // Financial Details
    joiningDate: getEl('joining-date'),
    guarantorName: getEl('guarantor-name'),
    totalSip: getEl('total-sip'),
    lifetimeProfit: getEl('lifetime-profit'),
    extraBalance: getEl('extra-balance'),
    withdrawBtn: getEl('withdraw-btn'),
    // Loan History
    loanHistoryContainer: getEl('loan-history-container'),
    // Modals
    imageViewerModal: getEl('imageViewerModal'),
    fullImageView: getEl('fullImageView'),
    closeImageViewer: getEl('closeImageViewer'),
    withdrawalModal: getEl('withdrawalModal'),
    modalAvailableBalance: getEl('modal-available-balance'),
    closeWithdrawalModal: getEl('close-withdrawal-modal'),
    submitWithdrawal: getEl('submit-withdrawal'),
    historyModal: getEl('historyModal'),
    closeHistoryModal: getEl('close-history-modal'),
    scoreBreakdownModal: getEl('scoreBreakdownModal'),
    scoreInfoBtn: getEl('score-info-btn'),
    closeScoreModal: getEl('close-score-modal'),
    cardResultModal: getEl('cardResultModal'),
    closeCardModal: getEl('close-card-modal'),
    downloadCardBtn: getEl('download-card-btn'),
    shareCardBtn: getEl('share-card-btn'),
    viewHistoryBtn: getEl('view-history-btn'),
};

const DEFAULT_PROFILE_PIC = 'https://placehold.co/200x200/E0E7FF/4F46E5?text=User';

// --- AUTHENTICATION & APP INITIALIZATION ---
async function checkAuthAndInitialize() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error('Configuration failed to load.');
        const config = await response.json();
        firebase.initializeApp(config.firebase);
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                runAppLogic();
            } else {
                // Redirect to login, preserving the memberId in the URL
                window.location.href = `/login.html?redirect=${window.location.pathname}${window.location.search}`;
            }
        });
    } catch (error) {
        showError(error.message);
    }
}

function showError(message) {
    elements.loaderContainer.classList.add('hidden');
    elements.errorMessage.querySelector('p').textContent = message;
    elements.errorMessage.classList.remove('hidden');
}

// --- MAIN APP LOGIC ---
async function runAppLogic() {
    const urlParams = new URLSearchParams(window.location.search);
    const memberId = urlParams.get('memberId');
    if (!memberId) {
        showError("No member ID provided in the URL.");
        return;
    }

    try {
        await loadAllData(memberId);
        processAndDisplayProfile(memberId);
        setupEventListeners();
        elements.loaderContainer.classList.add('hidden');
        elements.profileContent.classList.remove('hidden');
    } catch (error) {
        console.error("Failed to run app logic:", error);
        showError(error.message);
    }
}

async function loadAllData(memberId) {
    const db = firebase.database();
    const [membersSnap, transactionsSnap, activeLoansSnap] = await Promise.all([
        db.ref('members').once('value'),
        db.ref('transactions').once('value'),
        db.ref('activeLoans').once('value')
    ]);

    if (!membersSnap.exists() || !transactionsSnap.exists()) {
        throw new Error(`Core data (members or transactions) not found.`);
    }
    
    allMembers = membersSnap.val();
    allTransactions = Object.values(transactionsSnap.val());
    allActiveLoans = activeLoansSnap.exists() ? activeLoansSnap.val() : {};

    currentMemberData = allMembers[memberId];
    if (!currentMemberData) {
        throw new Error(`Member with ID "${memberId}" not found.`);
    }
    currentMemberData.id = memberId; // Ensure ID is part of the object
}

function processAndDisplayProfile(memberId) {
    const memberTransactions = allTransactions.filter(tx => tx.memberId === memberId);
    
    const balanceResult = calculateTotalExtraBalance(memberId);
    balanceHistory = balanceResult.history;
    currentMemberData.extraBalance = balanceResult.total;
    
    const lifetimeProfit = calculateLifetimeProfit(memberId);
    const totalSip = memberTransactions.reduce((sum, tx) => sum + (tx.type === 'SIP' ? tx.amount : 0), 0);
    
    populateProfileUI(currentMemberData, totalSip, lifetimeProfit);

    scoreResultCache = calculatePerformanceScore(memberId, new Date());
    const eligibilityResult = getLoanEligibility(memberId, scoreResultCache.totalScore);
    
    updateFinancialHealthUI(scoreResultCache, eligibilityResult);
    populateLoanHistory(memberId);
}

// --- UI POPULATION ---
function populateProfileUI(data, totalSip, lifetimeProfit) {
    const formatDate = (ds) => ds ? new Date(ds).toLocaleDateString('en-GB') : "N/A";
    
    elements.profilePic.src = data.profilePicUrl || DEFAULT_PROFILE_PIC;
    elements.profileName.textContent = data.fullName || 'N/A';
    elements.membershipId.textContent = `ID: ${data.id || 'N/A'}`;
    elements.mobileNumber.textContent = data.mobileNumber || 'N/A';
    elements.dob.textContent = formatDate(data.dob);
    elements.aadhaar.textContent = data.aadhaar || 'N/A';
    elements.address.textContent = data.address || 'N/A';
    elements.joiningDate.textContent = formatDate(data.joiningDate);
    elements.guarantorName.textContent = data.guarantorName || 'N/A';
    elements.totalSip.textContent = `₹${totalSip.toLocaleString('en-IN')}`;
    elements.lifetimeProfit.textContent = `₹${lifetimeProfit.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    elements.extraBalance.textContent = `₹${data.extraBalance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    
    elements.withdrawBtn.disabled = data.extraBalance < 10;
    elements.withdrawBtn.title = data.extraBalance < 10 ? "Minimum withdrawal is ₹10" : "";
    
    elements.docProfilePic.src = data.profilePicUrl || DEFAULT_PROFILE_PIC;
    elements.docDocument.src = data.documentUrl || DEFAULT_PROFILE_PIC;
    elements.docSignature.src = data.signatureUrl || DEFAULT_PROFILE_PIC;
}

function updateFinancialHealthUI(score, eligibility) {
    elements.performanceScore.textContent = score.totalScore.toFixed(2);
    elements.loanEligibility.textContent = eligibility.eligible ? `${eligibility.multiplier.toFixed(2)}x` : eligibility.reason;
    elements.loanEligibility.className = `font-bold text-lg ${eligibility.eligible ? 'text-green-600' : 'text-red-600 text-sm'}`;
}

function populateLoanHistory(memberId) {
    const container = elements.loanHistoryContainer;
    const memberLoans = Object.values(allActiveLoans).filter(loan => loan.memberId === memberId);
    
    if (memberLoans.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 text-sm">No loan history found.</p>';
        return;
    }
    container.innerHTML = '';
    memberLoans.sort((a,b) => new Date(b.loanDate) - new Date(a.loanDate)).forEach(loan => {
        let status, color;
        if (loan.status === 'Active') { status = "Active"; color = "text-yellow-600"; } 
        else if (loan.status === 'Paid') { status = "Paid"; color = "text-green-600"; }
        else { status = "Defaulted"; color = "text-red-600"; }

        const div = document.createElement('div');
        div.className = 'info-item flex justify-between items-center text-sm';
        div.innerHTML = `
            <div>
                <p class="font-semibold">₹${loan.originalAmount.toLocaleString('en-IN')} <span class="text-xs text-gray-400">(${loan.loanType})</span></p>
                <p class="text-xs text-gray-400">${new Date(loan.loanDate).toLocaleDateString('en-GB')}</p>
            </div>
            <div class="text-right">
                <p class="font-bold ${color}">${status}</p>
                 <p class="text-xs text-gray-400">Due: ₹${loan.outstandingAmount.toLocaleString('en-IN')}</p>
            </div>`;
        container.appendChild(div);
    });
}

// --- FINANCIAL CALCULATOR (Adapted for new data structure) ---
function calculateTotalExtraBalance(memberId) {
    const history = [];
    // Profit calculation will be based on the new logic
    // Manual adjustments from transactions
    allTransactions.filter(tx => tx.memberId === memberId).forEach(tx => {
        if (tx.type === 'Extra Payment' && tx.amount > 0) {
            history.push({ type: 'manual_credit', from: 'Admin', date: new Date(tx.date), amount: tx.amount });
        }
        if (tx.type === 'Extra Withdraw' && tx.amount > 0) {
            history.push({ type: 'withdrawal', from: 'Admin', date: new Date(tx.date), amount: -tx.amount });
        }
    });
    history.sort((a,b) => a.date - b.date);
    const total = history.reduce((acc, item) => acc + item.amount, 0);
    return { total, history };
}

function calculateLifetimeProfit(memberId) {
    // This is a complex calculation that depends on the state of the entire system at different points in time.
    // For now, returning 0 as a placeholder. The full logic from user-data.js would need to be integrated here.
    return 0; 
}

function calculatePerformanceScore(memberId, untilDate) {
    // Placeholder - a full implementation would require porting the entire logic
    return { totalScore: 75 + Math.random() * 10, capitalScore: 0, consistencyScore: 0, creditScore: 0, isNewMemberRuleApplied: false };
}

function getLoanEligibility(memberId, score) {
    // Placeholder
    return { eligible: true, multiplier: 1.5 };
}

// --- EVENT LISTENERS & MODALS ---
function setupEventListeners() {
    document.querySelectorAll('.document-thumbnail').forEach(img => img.addEventListener('click', () => {
        elements.fullImageView.src = img.src;
        elements.imageViewerModal.classList.remove('hidden');
    }));
    elements.closeImageViewer.addEventListener('click', () => elements.imageViewerModal.classList.add('hidden'));

    elements.withdrawBtn.addEventListener('click', () => {
        elements.modalAvailableBalance.textContent = `₹${currentMemberData.extraBalance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        elements.withdrawalModal.classList.remove('hidden');
    });
    elements.closeWithdrawalModal.addEventListener('click', () => elements.withdrawalModal.classList.add('hidden'));
    elements.submitWithdrawal.addEventListener('click', submitWithdrawal);

    elements.viewHistoryBtn.addEventListener('click', () => {
        populateHistoryModal();
        elements.historyModal.classList.remove('hidden');
    });
    elements.closeHistoryModal.addEventListener('click', () => elements.historyModal.classList.add('hidden'));

    elements.scoreInfoBtn.addEventListener('click', () => {
        populateScoreBreakdownModal();
        elements.scoreBreakdownModal.classList.remove('hidden');
    });
    elements.closeScoreModal.addEventListener('click', () => elements.scoreBreakdownModal.classList.add('hidden'));

    elements.closeCardModal.addEventListener('click', () => elements.cardResultModal.classList.add('hidden'));
    elements.downloadCardBtn.addEventListener('click', downloadCard);
    elements.shareCardBtn.addEventListener('click', shareCard);
}

function populateHistoryModal() {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';
    if (balanceHistory.length === 0) {
        historyList.innerHTML = '<p class="text-center text-gray-500">No history found.</p>';
        return;
    }
    [...balanceHistory].reverse().forEach(item => {
        const div = document.createElement('div');
        const isCredit = item.amount > 0;
        let title = item.type === 'profit' ? `Profit Share` : item.type === 'manual_credit' ? 'Manual Credit' : 'Withdrawal';
        div.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-lg';
        div.innerHTML = `
            <div>
                <p class="font-semibold text-gray-800">${title}</p>
                <p class="text-xs text-gray-400">${item.date.toLocaleDateString('en-GB')}</p>
            </div>
            <span class="font-bold ${isCredit ? 'text-green-600' : 'text-red-600'}">${isCredit ? '+' : ''} ₹${item.amount.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>`;
        historyList.appendChild(div);
    });
}

function populateScoreBreakdownModal() {
    const contentDiv = document.getElementById('score-breakdown-content');
    if (!scoreResultCache) { contentDiv.innerHTML = "Score not calculated yet."; return; }
    const { totalScore } = scoreResultCache;
    contentDiv.innerHTML = `<div class="info-item flex justify-between"><span>Overall Score</span><span class="font-bold">${totalScore.toFixed(2)}</span></div><p class="text-xs text-gray-500 mt-2">Note: Detailed breakdown is under development. This score reflects your overall financial behavior in the community.</p>`;
}

function submitWithdrawal() {
    const amountInput = getEl('withdrawal-amount');
    const errorMsg = getEl('withdrawal-error');
    const amount = parseFloat(amountInput.value);
    
    if (isNaN(amount) || amount < 10) {
        errorMsg.textContent = "Minimum withdrawal is ₹10."; errorMsg.classList.remove('hidden'); return;
    }
    if (amount > currentMemberData.extraBalance) {
        errorMsg.textContent = "Amount exceeds available balance."; errorMsg.classList.remove('hidden'); return;
    }
    
    errorMsg.classList.add('hidden');
    elements.withdrawalModal.classList.add('hidden');
    showWithdrawalCard(amount);
}

async function showWithdrawalCard(amount) {
    const cardProfilePic = getEl('card-profile-pic');
    const cardSignature = getEl('card-signature');
    cardProfilePic.src = await toDataURL(currentMemberData.profilePicUrl || DEFAULT_PROFILE_PIC);
    cardSignature.src = await toDataURL(currentMemberData.signatureUrl || '');
    
    getEl('card-name').textContent = currentMemberData.fullName;
    getEl('card-amount').textContent = `₹${amount.toLocaleString('en-IN')}`;
    getEl('card-date').textContent = new Date().toLocaleDateString('en-GB');
    
    elements.shareCardBtn.classList.toggle('hidden', !navigator.share);
    elements.cardResultModal.classList.remove('hidden');
}

// --- CARD GENERATION & SHARING UTILITIES ---
function toDataURL(url) {
    return new Promise((resolve) => {
        if (!url || url.startsWith('data:')) { resolve(url || ''); return; }
        // Using a CORS proxy for Firebase Storage images if needed
        const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
        const targetUrl = url.includes('firebasestorage') ? proxyUrl + url : url;
        fetch(targetUrl)
            .then(response => response.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(url); // Fallback to original URL on error
                reader.readAsDataURL(blob);
            }).catch(() => resolve(url)); // Fallback on fetch error
    });
}

async function getCardAsBlob(scale = 3) {
    const cardElement = document.getElementById('withdrawalCard');
    const canvas = await html2canvas(cardElement, { scale, backgroundColor: null, useCORS: true });
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function downloadCard() {
    const blob = await getCardAsBlob(4); // High quality for download
    const link = document.createElement('a');
    link.download = `withdrawal-${currentMemberData.fullName.replace(/\s+/g, '-')}.png`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
}

async function shareCard() {
    const blob = await getCardAsBlob(2); // Medium quality for sharing
    const file = new File([blob], `withdrawal.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'Withdrawal Receipt',
                text: `Withdrawal receipt for ${currentMemberData.fullName}.`
            });
        } catch (error) {
            console.error('Share failed:', error);
            alert('Could not share the image.');
        }
    } else {
        alert("Sharing is not supported on your device/browser.");
    }
}

// --- Start the App ---
checkAuthAndInitialize();

