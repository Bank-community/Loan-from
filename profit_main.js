// File: profit_main.js
// This file acts as the main controller for the application.
// It handles Firebase initialization, data fetching from the new admin panel's structure,
// all UI rendering, chart creation, and event handling. It imports the core logic from profit_logic.js.

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import * as logic from './profit_logic.js'; // Import all exports from logic file

// --- GLOBAL VARIABLES ---
let allData = [], memberDataMap = new Map(), memberNames = [];
let distributionChartInstance = null, growthChartInstance = null;
let db, auth;

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => initializeAppAndAuth());

/**
 * Fetches config, initializes Firebase, and sets up authentication listener.
 */
async function initializeAppAndAuth() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Configuration failed to load from /api/config.');
        const firebaseConfig = await response.json();
        
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getDatabase(app);
        
        onAuthStateChanged(auth, user => {
            if (user) {
                document.getElementById('loader').classList.add('hidden');
                setupPasswordPrompt();
            } else {
                console.log("User not authenticated, redirecting to login...");
                // Redirect to your login page if the user is not signed in
                window.location.href = `/login.html?redirect=${window.location.pathname}`;
            }
        });

    } catch (error) {
        console.error("Initialization Error:", error);
        document.getElementById('loader').innerHTML = `<p style="color: red;">Application failed to initialize: ${error.message}</p>`;
    }
}

/**
 * Sets up the PIN prompt for authenticated users.
 */
function setupPasswordPrompt() {
    const passwordContainer = document.getElementById('passwordPromptContainer');
    const passwordInput = document.getElementById('passwordInput');
    const passwordSubmit = document.getElementById('passwordSubmit');
    passwordContainer.classList.remove('visually-hidden');
    passwordInput.focus();
    
    const checkPassword = () => {
        if (passwordInput.value === logic.CONFIG.PASSWORD) {
            passwordContainer.classList.add('visually-hidden');
            document.getElementById('loader').classList.remove('hidden');
            loadAndProcessData(); // Start data loading after successful PIN entry
        } else {
            alert("Incorrect PIN");
            passwordInput.value = "";
            passwordInput.focus();
        }
    };
    passwordSubmit.addEventListener('click', checkPassword);
    passwordInput.addEventListener('keydown', (e) => e.key === 'Enter' && checkPassword());
}

// --- DATA FETCHING AND PROCESSING (UPDATED FOR NEW ADMIN PANEL STRUCTURE) ---

/**
 * Loads data from the new Firebase structure (/members and /transactions),
 * processes it into the format expected by the logic functions, and initializes the dashboard.
 */
async function loadAndProcessData() {
    document.getElementById('loader').querySelector('span').textContent = 'Loading and processing data...';

    try {
        // 1. Fetch both members and transactions in parallel for efficiency
        const membersRef = ref(db, 'members');
        const transactionsRef = ref(db, 'transactions');
        const [membersSnapshot, transactionsSnapshot] = await Promise.all([get(membersRef), get(transactionsRef)]);

        if (!membersSnapshot.exists() || !transactionsSnapshot.exists()) {
            throw new Error('Essential data (members or transactions) not found in Firebase.');
        }

        const members = membersSnapshot.val();
        const transactions = transactionsSnapshot.val();
        
        // 2. Create a Map for quick member data lookup (name, image)
        for (const memberId in members) {
            if (members[memberId].status === 'Approved') { // Only include approved members
                 memberDataMap.set(memberId, {
                    name: members[memberId].fullName,
                    imageUrl: members[memberId].profilePicUrl,
                });
            }
        }
        
        // 3. Process transactions and map them to the required `allData` format
        const processedTransactions = [];
        let idCounter = 0;
        for (const txId in transactions) {
            const tx = transactions[txId];
            const memberInfo = memberDataMap.get(tx.memberId);

            // Skip transactions for members who are not approved or don't exist
            if (!memberInfo) continue;
            
            let record = {
                id: idCounter++,
                date: new Date(tx.date),
                name: memberInfo.name,
                imageUrl: memberInfo.imageUrl || logic.CONFIG.DEFAULT_PROFILE_PIC,
                loan: 0,
                payment: 0,
                sipPayment: 0,
                returnAmount: 0,
            };
            
            // Map new transaction types to the old format expected by the logic
            switch (tx.type) {
                case 'SIP':
                    record.sipPayment = tx.amount || 0;
                    break;
                case 'Loan Taken':
                    record.loan = tx.amount || 0;
                    break;
                case 'Loan Payment':
                    // In the new system, interest paid is the profit source ("Return amount")
                    record.payment = (tx.principalPaid || 0) + (tx.interestPaid || 0);
                    record.returnAmount = tx.interestPaid || 0;
                    break;
                case 'Extra Payment':
                    record.payment = tx.amount || 0;
                    break;
                case 'Extra Withdraw':
                    // Treat withdrawal like a loan for capital calculation purposes
                    record.loan = tx.amount || 0;
                    break;
                default:
                    continue; // Skip unknown transaction types
            }
            processedTransactions.push(record);
        }

        // 4. Finalize `allData` and `memberNames`
        allData = processedTransactions.sort((a, b) => a.date - b.date || a.id - b.id);
        memberNames = [...new Set(allData.map(row => row.name))].sort();

        // 5. Initialize the dashboard with the processed data
        initializeDashboard();

    } catch (error) {
        console.error("Error fetching or processing data:", error);
        document.body.innerHTML = `<div style="text-align:center; padding:50px; color:red;">Failed to load data. Error: ${error.message}</div>`;
    } finally {
        document.getElementById('loader').classList.add('hidden');
    }
}


// --- UI and Display Functions ---

function initializeDashboard() {
    document.getElementById('dashboardContent').classList.remove('visually-hidden');
    document.getElementById('dashboardContent').classList.add('visible');
    populateMemberFilter();
    setupEventListeners();
    updateDisplay();
}

function setupEventListeners() {
    document.getElementById('memberFilter').addEventListener('change', updateDisplay);
    document.querySelectorAll('.modal').forEach(modal => {
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('visually-hidden'));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('visually-hidden') });
    });
    document.getElementById('showReturnRankBtn').addEventListener('click', displayReturnRanking);
    document.getElementById('showScoreRankBtn').addEventListener('click', displayScoreRanking);
    document.getElementById('showEligibilityRankBtn').addEventListener('click', displayEligibilityRanking);
    document.getElementById('profileImage').addEventListener('click', () => {
        const imageModal = document.getElementById('imageModal');
        const fullImage = document.getElementById('fullProfileImage');
        if(imageModal && fullImage) {
            fullImage.src = document.getElementById('profileImage').src;
            imageModal.classList.remove('visually-hidden');
        }
    });
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', handleLanguageToggle);
    });
}

function populateMemberFilter() {
    const nameFilter = document.getElementById("memberFilter");
    memberNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        nameFilter.appendChild(option);
    });
}

function updateDisplay() {
    const selectedName = document.getElementById('memberFilter').value;
    const isCommunityView = selectedName === 'all';
    document.getElementById('growthChartSection').classList.toggle('hidden', !isCommunityView);
    document.getElementById('profitLogSection').classList.toggle('hidden', !isCommunityView);
    document.getElementById('memberSpecificStats').classList.toggle('hidden', isCommunityView);
    document.getElementById('memberHistorySection').classList.toggle('hidden', isCommunityView);
    if (isCommunityView) {
        renderGrowthChart();
        populateProfitLog();
    } else {
        populateMemberHistory(selectedName);
    }
    updateProfileCard(selectedName);
}

function updateProfileCard(name) {
    const profileImageEl = document.getElementById('profileImage');
    const profileNameEl = document.getElementById('profileName');
    let totalCapital = 0, totalLoan = 0, totalProfitEarned = 0;
    if (name === 'all') {
        allData.forEach(r => {
            totalCapital += r.sipPayment + r.payment - r.loan;
            totalLoan += r.loan;
        });
        totalProfitEarned = allData.reduce((sum, r) => sum + r.returnAmount, 0);
        profileNameEl.textContent = 'Community Overview';
        profileImageEl.src = logic.CONFIG.DEFAULT_PROFILE_PIC;
    } else {
        const dataToShow = allData.filter(r => r.name === name);
        totalCapital = dataToShow.reduce((sum, r) => sum + r.sipPayment + r.payment - r.loan, 0);
        totalLoan = dataToShow.reduce((sum, r) => sum + r.loan, 0);
        totalProfitEarned = logic.calculateTotalProfitForMember(name, allData);
        const memberScores = logic.calculatePerformanceScore(name, new Date(), allData);
        const score = memberScores.totalScore;
        const loanEligibility = logic.getLoanEligibility(name, score, allData);
        document.getElementById('profilePerformanceScore').textContent = score.toFixed(2);
        const limitEl = document.getElementById('profileLoanLimit');
        if(loanEligibility.eligible) {
            limitEl.textContent = `${loanEligibility.multiplier.toFixed(2)}x`;
            limitEl.classList.remove('negative');
        } else {
            limitEl.textContent = loanEligibility.reason;
            limitEl.classList.add('negative');
        }
        profileNameEl.textContent = name;
        const lastUserEntryWithImage = [...dataToShow].reverse().find(r => r.imageUrl);
        profileImageEl.src = lastUserEntryWithImage ? lastUserEntryWithImage.imageUrl : logic.CONFIG.DEFAULT_PROFILE_PIC;
    }
    document.getElementById('profileTotalCapital').textContent = `₹${totalCapital.toFixed(2)}`;
    document.getElementById('profileTotalLoan').textContent = `₹${totalLoan.toFixed(2)}`;
    document.getElementById('profileTotalProfit').textContent = `₹${totalProfitEarned.toFixed(2)}`;
}

function populateProfitLog() {
    const tableBody = document.querySelector("#profitLogTable tbody");
    tableBody.innerHTML = '';
    const profitEvents = allData.filter(r => r.returnAmount > 0);
    if (profitEvents.length === 0) {
        tableBody.innerHTML = `<tr class="no-data-row"><td colspan="5">No profit events found.</td></tr>`;
        return;
    }
    profitEvents.forEach(paymentRecord => {
        const result = logic.calculateProfitDistribution(paymentRecord, allData);
        if (result && result.profit > 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${logic.formatDate(paymentRecord.date)}</td><td>${paymentRecord.name}</td><td>₹${result.relevantLoan.loan.toFixed(2)}</td><td class="profit-value">₹${result.profit.toFixed(2)}</td><td><button class="details-btn">View</button></td>`;
            row.querySelector('.details-btn').addEventListener('click', () => showDistributionModal(result));
            tableBody.appendChild(row);
        }
    });
}

function populateMemberHistory(memberName) {
    const tableBody = document.querySelector("#memberHistoryTable tbody");
    tableBody.innerHTML = '';
    const memberData = allData.filter(r => r.name === memberName);
    let balance = 0;
    if (memberData.length === 0) {
        tableBody.innerHTML = `<tr class="no-data-row"><td colspan="4">No transaction history found.</td></tr>`;
        return;
    }
    memberData.forEach(r => {
        let type = '', amount = 0, sign = '';
        if (r.sipPayment > 0) { type = 'sip'; amount = r.sipPayment; balance += amount; sign = '+'; }
        else if (r.loan > 0) { type = 'loan'; amount = r.loan; balance -= amount; sign = '-'; }
        else if (r.payment > 0) { type = 'payment'; amount = r.payment; balance += amount; sign = '+'; }
        else return;
        const row = document.createElement('tr');
        row.innerHTML = `<td>${logic.formatDate(r.date)}</td><td class="transaction-type ${type}">${type.toUpperCase()}</td><td>${sign} ₹${amount.toFixed(2)}</td><td>₹${balance.toFixed(2)}</td>`;
        tableBody.appendChild(row);
    });
}

function displayReturnRanking() {
    const listEl = document.getElementById('returnRankList');
    let memberProfits = memberNames.map(name => ({ name: name, totalProfit: logic.calculateTotalProfitForMember(name, allData) }))
        .filter(member => member.totalProfit > 0).sort((a, b) => b.totalProfit - a.totalProfit);
    listEl.innerHTML = '';
    if (memberProfits.length === 0) listEl.innerHTML = '<li>No members have earned a return yet.</li>';
    else memberProfits.forEach((member, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="rank">${index + 1}.</span><span class="name">${member.name}</span><span class="share">+ ₹${member.totalProfit.toFixed(2)}</span><div class="button-group"><button class="btn-details-small">Details</button><button class="btn-ai-small"><i class="fas fa-robot"></i> AI</button></div>`;
        li.querySelector('.btn-details-small').addEventListener('click', () => showCalculationDetails({type: 'total_profit', memberName: member.name}));
        li.querySelector('.btn-ai-small').addEventListener('click', () => {
             const promptGenerator = () => {
                let profitBreakdown = '';
                allData.filter(r => r.returnAmount > 0).forEach(event => {
                    const result = logic.calculateProfitDistribution(event, allData);
                    const share = result?.distribution.find(d => d.name === member.name);
                    if (share) {
                        profitBreakdown += `\n- ${event.name} ke loan (Date: ${logic.formatDate(event.date)}) se mila profit: ₹${share.share.toFixed(2)}.`;
                    }
                });
                return `Tum ek financial advisor ho. Member '${member.name}' ko mile total profit (₹${member.totalProfit.toFixed(2)}) ko aasan Hindi me samjhao. Unhe yeh profit kahan kahan se mila, iska breakdown do: ${profitBreakdown}\n\nAnt mein, 'Salah' section mein batao ki total profit badhane ke liye unhe apna performance score hamesha accha rakhna chahiye.`;
            };
            generateAndShowExplanation(promptGenerator, 'profit_system');
        });
        listEl.appendChild(li);
    });
    document.getElementById('returnRankModal').classList.remove('visually-hidden');
}

function displayScoreRanking() {
    const tableBody = document.querySelector("#scoreRankTable tbody");
    let memberScores = memberNames.map(name => ({ name, scores: logic.calculatePerformanceScore(name, new Date(), allData) }))
        .sort((a, b) => b.scores.totalScore - a.scores.totalScore);
    tableBody.innerHTML = '';
    memberScores.forEach((member, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${index + 1}</td><td>${member.name}</td><td>${member.scores.totalScore.toFixed(2)}</td><td><div class="button-group"><button class="btn-details-small">Details</button><button class="btn-ai-small"><i class="fas fa-robot"></i> AI</button></div></td>`;
        row.querySelector('.btn-details-small').addEventListener('click', () => showCalculationDetails({type: 'score', member: member}));
        row.querySelector('.btn-ai-small').addEventListener('click', () => {
            const promptGenerator = () => {
                const { name, scores } = member;
                return `Tum ek financial advisor ho. Member '${name}' ka performance score ${scores.totalScore.toFixed(2)} hai. Is score ko aasan Hindi me samjhao. Batao ki yeh score in teen cheezon se milkar bana hai: 1. Capital Score: ${scores.capitalScore.toFixed(2)} (Weight: 40%), 2. Consistency Score: ${scores.consistencyScore.toFixed(2)} (Weight: 30%), 3. Credit Score: ${scores.creditScore.toFixed(2)} (Weight: 30%).\n\nAnt mein, 'Aapko Kya Karna Chahiye' naam ka ek section jodkar 2-3 line mein sabse zaroori kadam batao jisse ve apna score sudhar sakein.`;
            };
            generateAndShowExplanation(promptGenerator, 'profit_system');
        });
        tableBody.appendChild(row);
    });
    document.getElementById('scoreRankModal').classList.remove('visually-hidden');
}

function displayEligibilityRanking() {
    const tableBody = document.querySelector("#eligibilityRankTable tbody");
    let memberEligibility = memberNames.map(name => {
        const capital = allData.filter(r => r.name === name).reduce((sum, r) => sum + r.sipPayment + r.payment - r.loan, 0);
        const score = logic.calculatePerformanceScore(name, new Date(), allData).totalScore;
        const eligibility = logic.getLoanEligibility(name, score, allData);
        return { name, capital, score, eligibility, maxLoan: eligibility.eligible ? capital * eligibility.multiplier : 0 };
    }).sort((a, b) => b.maxLoan - a.maxLoan);
    tableBody.innerHTML = '';
    memberEligibility.forEach(member => {
        const row = document.createElement('tr');
        let eligibilityText = '';
        if (member.eligibility.eligible) eligibilityText = `${member.eligibility.multiplier.toFixed(2)}x`;
        else eligibilityText = `<span class="negative">${member.eligibility.reason}</span>`;
        row.innerHTML = `<td>${member.name}</td><td>₹${member.capital.toFixed(2)}</td><td>${eligibilityText}</td><td>₹${member.maxLoan.toFixed(2)}</td><td><div class="button-group"><button class="btn-details-small">Details</button><button class="btn-ai-small"><i class="fas fa-robot"></i> AI</button></div></td>`;
        row.querySelector('.btn-details-small').addEventListener('click', () => showCalculationDetails({type: 'eligibility', member: member}));
        row.querySelector('.btn-ai-small').addEventListener('click', () => {
            const promptGenerator = () => {
                const { name, capital, score, eligibility, maxLoan } = member;
                if (eligibility.eligible) {
                    return `Tum ek financial advisor ho. Member '${name}' ki loan eligibility ko aasan Hindi me samjhao. Data: - Capital: ₹${capital.toFixed(2)} - Performance Score: ${score.toFixed(2)} - Eligibility Multiplier: ${eligibility.multiplier.toFixed(2)}x - Max Loan Amount: ₹${maxLoan.toFixed(2)} Samjhao ki unka multiplier unke score par depend karta hai.\n\nAnt mein, 'Salah' section mein batao ki score accha banaye rakhne se unhe hamesha fayda hoga.`;
                } else {
                    return `Tum ek financial advisor ho. Member '${name}' abhi loan ke liye eligible kyun nahi hai, yeh aasan Hindi me samjhao. Karan: ${eligibility.reason}. Is karan ka matlab samjhao.\n\nAnt mein, 'Salah' section mein batao ki is samasya ko kaise theek kiya ja sakta hai.`;
                }
            };
            generateAndShowExplanation(promptGenerator, 'profit_system');
        });
        tableBody.appendChild(row);
    });
    document.getElementById('eligibilityRankModal').classList.remove('visually-hidden');
}

function showCalculationDetails(details) {
    const titleEl = document.getElementById('calculationDetailsTitle');
    const contentEl = document.getElementById('calculationDetailsContent');
    let html = '';
    if (details.type === 'score') {
        const { name, scores } = details.member;
        titleEl.textContent = `Score Calculation for ${name}`;
        html = `<div class="calc-row"><span class="calc-label">Capital Score (180-day Avg)</span> <span class="calc-value">${scores.capitalScore.toFixed(2)}</span></div>`;
        if (scores.isNewMemberRuleApplied) {
            html += `<div class="calc-row"><span class="calc-label">Consistency Score (Base)</span> <span class="calc-value">${scores.originalConsistencyScore.toFixed(2)}</span></div>`;
            html += `<div class="calc-row"><span class="calc-label" style="color:var(--negative-color);">New Member Rule (x50%)</span> <span class="calc-value">${scores.consistencyScore.toFixed(2)}</span></div>`;
            html += `<div class="calc-formula">6 mahine se kam sadasyata ke liye.</div>`;
            html += `<div class="calc-row"><span class="calc-label">Credit Behavior (Base)</span> <span class="calc-value">${scores.originalCreditScore.toFixed(2)}</span></div>`;
            html += `<div class="calc-row"><span class="calc-label" style="color:var(--negative-color);">New Member Rule (x50%)</span> <span class="calc-value">${scores.creditScore.toFixed(2)}</span></div>`;
            html += `<div class="calc-formula">6 mahine se kam sadasyata ke liye.</div>`;
        } else {
            html += `<div class="calc-row"><span class="calc-label">Consistency Score (Last 1-Yr)</span> <span class="calc-value">${scores.consistencyScore.toFixed(2)}</span></div>`;
            html += `<div class="calc-row"><span class="calc-label">Credit Behavior (Last 1-Yr)</span> <span class="calc-value">${scores.creditScore.toFixed(2)}</span></div>`;
        }
        html += `<hr><div class="calc-row"><span class="calc-label">Weighted Capital (40%)</span> <span class="calc-value">${(scores.capitalScore * logic.CONFIG.CAPITAL_WEIGHT).toFixed(2)}</span></div><div class="calc-row"><span class="calc-label">Weighted Consistency (30%)</span> <span class="calc-value">${(scores.consistencyScore * logic.CONFIG.CONSISTENCY_WEIGHT).toFixed(2)}</span></div><div class="calc-row"><span class="calc-label">Weighted Credit (30%)</span> <span class="calc-value">${(scores.creditScore * logic.CONFIG.CREDIT_BEHAVIOR_WEIGHT).toFixed(2)}</span></div><div class="calc-final">Total Score: ${scores.totalScore.toFixed(2)}</div>`;
    } else if (details.type === 'total_profit') {
        titleEl.textContent = `Total Profit for ${details.memberName}`;
        let profitBreakdownHtml = '';
        let totalProfit = 0;
        allData.filter(r => r.returnAmount > 0).forEach(event => {
            const result = logic.calculateProfitDistribution(event, allData);
            const share = result?.distribution.find(d => d.name === details.memberName);
            if (share) {
                totalProfit += share.share;
                profitBreakdownHtml += `<div class="calc-row"><span class="calc-label">From ${event.name}'s loan (${logic.formatDate(event.date)})</span> <span class="calc-value">+ ₹${share.share.toFixed(2)}</span></div>`;
            }
        });
        if (!profitBreakdownHtml) profitBreakdownHtml = '<div class="calc-row"><span class="calc-label">No profit earned yet.</span></div>';
        html = `${profitBreakdownHtml}<div class="calc-final">Total Profit: ₹${totalProfit.toFixed(2)}</div>`;
    } else if (details.type === 'eligibility') {
        const { name, score, eligibility } = details.member;
        titleEl.textContent = `Eligibility for ${name}`;
        if(eligibility.eligible) {
            html = `<div class="calc-row"><span class="calc-label">Your Performance Score</span> <span class="calc-value">${score.toFixed(2)}</span></div><hr><p style="font-size:0.9em; text-align:center; color: var(--text-light);">Aapka multiplier aapke score ke aadhar par scale hota hai.</p><div class="calc-final">Your Multiplier: ${eligibility.multiplier.toFixed(2)}x</div>`;
        } else {
             html = `<div class="calc-final" style="color:var(--negative-color);">${eligibility.reason}</div>`;
        }
    }
    contentEl.innerHTML = html;
    document.getElementById('calculationDetailsModal').classList.remove('visually-hidden');
}

function renderGrowthChart() {
    const ctx = document.getElementById('growthChart').getContext('2d');
    const { labels, capital, loans, profits } = calculateGrowthData();
    if (growthChartInstance) growthChartInstance.destroy();
    growthChartInstance = new Chart(ctx, {
        type: 'line', data: { labels, datasets: [ { label: 'Total Capital', data: capital, borderColor: 'rgba(52, 152, 219, 1)', backgroundColor: 'rgba(52, 152, 219, 0.1)', fill: true, tension: 0.1 }, { label: 'Total Loans', data: loans, borderColor: 'rgba(231, 76, 60, 1)', backgroundColor: 'rgba(231, 76, 60, 0.1)', fill: true, tension: 0.1 }, { label: 'Total Profit', data: profits, borderColor: 'rgba(39, 174, 96, 1)', backgroundColor: 'rgba(39, 174, 96, 0.1)', fill: true, tension: 0.1 } ]},
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: value => `₹${value}` } } }, plugins: { tooltip: { callbacks: { label: context => `${context.dataset.label}: ₹${context.parsed.y.toFixed(2)}` } } } }
    });
}

function calculateGrowthData() {
    const snapshots = {}; let cumulativeCapital = 0, cumulativeLoan = 0, cumulativeProfit = 0;
    allData.forEach(r => {
        cumulativeCapital += r.sipPayment + r.payment - r.loan; cumulativeLoan += r.loan; cumulativeProfit += r.returnAmount;
        const monthKey = r.date.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
        snapshots[monthKey] = { capital: cumulativeCapital, loans: cumulativeLoan, profits: cumulativeProfit, date: new Date(r.date.getFullYear(), r.date.getMonth(), 1) };
    });
    const sortedKeys = Object.keys(snapshots).sort((a,b) => snapshots[a].date - snapshots[b].date);
    return { labels: sortedKeys, capital: sortedKeys.map(key => snapshots[key].capital), loans: sortedKeys.map(key => snapshots[key].loans), profits: sortedKeys.map(key => snapshots[key].profits) };
}

function showDistributionModal(profitEvent) {
    const modal = document.getElementById('detailsModal'); const listEl = document.getElementById('distributionDetails'); listEl.innerHTML = '';
    const ctx = document.getElementById('distributionChart').getContext('2d');
    if (distributionChartInstance) distributionChartInstance.destroy();
    const { distribution, profit, relevantLoan } = profitEvent;
    if (!distribution || distribution.length === 0) { listEl.innerHTML = '<li>No beneficiaries found.</li>'; } 
    else {
        const labels = distribution.map(d => d.name); const data = distribution.map(d => d.share.toFixed(2));
        distribution.forEach((item, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="rank">${index + 1}.</span><span class="name">${item.name}</span><span class="share">+ ₹${item.share.toFixed(2)}</span><div class="button-group"><button class="btn-details-small">Details</button><button class="btn-ai-small"><i class="fas fa-robot"></i> AI</button></div>`;
            li.querySelector('.btn-details-small').addEventListener('click', () => showCalculationDetails({type: 'profit_event', member: item, profitEvent: { profit, relevantLoan }}));
            li.querySelector('.btn-ai-small').addEventListener('click', () => { /* AI logic here */ });
            listEl.appendChild(li);
        });
        distributionChartInstance = new Chart(ctx, {
            type: 'bar', data: { labels, datasets: [{ label: 'Profit Share (₹)', data, backgroundColor: 'rgba(52, 152, 219, 0.7)', borderColor: 'rgba(52, 152, 219, 1)', borderWidth: 1 }] },
            options: { responsive: true, indexAxis: 'y', scales: { x: { beginAtZero: true, title: { display: true, text: 'Amount (₹)' } } }, plugins: { legend: { display: false } } }
        });
    }
    modal.classList.remove('visually-hidden');
}


// --- AI EXPLANATION FUNCTIONS ---

async function getGeminiExplanation(promptText, source = 'default') {
    // This function remains the same, assuming you have a Vercel function for it.
    try {
        let apiEndpoint = '/api/getAiExplanation';
        if (source === 'profit_system') apiEndpoint = '/api/getProfitAiExplanation';

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ promptText: promptText })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || 'AI request failed.');
        }
        const data = await response.json();
        return data.explanation;
    } catch (error) {
        console.error("Frontend AI Error:", error);
        throw error;
    }
}

async function generateAndShowExplanation(promptGenerator, source = 'default') {
    const resultDiv = document.getElementById('aiExplanationResult');
    const langToggleContainer = document.getElementById('languageToggleContainer');
    
    resultDiv.innerHTML = `<div class="ai-loader"><div class="spinner"></div><span>AI aapke liye jankari taiyar kar raha hai...</span></div>`;
    langToggleContainer.classList.add('hidden');
    document.getElementById('aiExplainModal').classList.remove('visually-hidden');

    const initialPrompt = promptGenerator();

    try {
        const explanation = await getGeminiExplanation(initialPrompt, source);
        resultDiv.innerHTML = marked.parse(explanation);
        resultDiv.dataset.originalText = explanation;
        resultDiv.dataset.source = source;
        langToggleContainer.classList.remove('hidden');
    } catch (error) {
        resultDiv.innerHTML = `<p style="color: var(--negative-color);"><strong>Error:</strong> AI se jawab nahi mil saka.</p><p style="font-size:0.8em; color: var(--text-light);">${error.message}</p>`;
    }
}

async function handleLanguageToggle(event) {
    const targetLang = event.target.dataset.lang;
    const resultDiv = document.getElementById('aiExplanationResult');
    const textToTranslate = resultDiv.dataset.originalText;
    
    if (!textToTranslate) return;

    const langFullName = targetLang === 'hi' ? 'Hindi' : 'English';
    const translationPrompt = `Translate the following text into ${langFullName}. Provide only the translated text, without any additional formatting or introductory phrases:\n\n"${textToTranslate}"`;
    
    resultDiv.innerHTML = `<div class="ai-loader"><div class="spinner"></div></div>`;

    try {
        const sourceForTranslation = resultDiv.dataset.source || 'default';
        const translatedText = await getGeminiExplanation(translationPrompt, sourceForTranslation);
        resultDiv.innerHTML = marked.parse(translatedText);
    } catch (error) {
        resultDiv.innerHTML = `<p style="color: var(--negative-color);"><strong>Error:</strong> Translation fail ho gaya.</p>`;
    }
}

