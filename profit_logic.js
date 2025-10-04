// File: profit_logic.js
// This file contains all the core calculation and business logic for the profit analytics system.
// It is responsible for calculating scores, eligibility, and profit distributions without touching the DOM.

// --- CONFIGURATION & NIYAM (RULES) ---
// All business rules are defined here.
export const CONFIG = {
    PASSWORD: "7536",
    DEFAULT_PROFILE_PIC: 'https://i.postimg.cc/XNpR3cN1/20241030-065157.png',
    
    // Performance Score Weights
    CAPITAL_WEIGHT: 0.40, 
    CONSISTENCY_WEIGHT: 0.30, 
    CREDIT_BEHAVIOR_WEIGHT: 0.30,

    // Capital Score Calculation Window
    CAPITAL_SCORE_DAYS: 180,

    // Loan Eligibility Tiers
    LOAN_LIMIT_TIER1_SCORE: 50, LOAN_LIMIT_TIER2_SCORE: 60, LOAN_LIMIT_TIER3_SCORE: 80,
    LOAN_LIMIT_TIER1_MAX: 1.0, LOAN_LIMIT_TIER2_MAX: 1.5, LOAN_LIMIT_TIER3_MAX: 1.8, LOAN_LIMIT_TIER4_MAX: 2.0,
    
    // Credit Behavior & Membership Rules
    MINIMUM_MEMBERSHIP_DAYS: 60,
    MINIMUM_MEMBERSHIP_FOR_CREDIT_SCORE: 30,
    SIP_ON_TIME_LIMIT: 10,
    LOAN_FORMALITY_DAYS_LIMIT: 15,
    LOAN_TERM_BEST: 30,
    LOAN_TERM_BETTER: 60,
    LOAN_TERM_GOOD: 90,
    LOAN_TERM_LATE_FEE: 100,

    // Probation period for new members
    NEW_MEMBER_PROBATION_DAYS: 180, // Approx 6 months

    // Inactive Policy Tiers
    INACTIVE_DAYS_LEVEL_1: 180,
    INACTIVE_PROFIT_MULTIPLIER_LEVEL_1: 0.90, // 10% penalty
    INACTIVE_DAYS_LEVEL_2: 365,
    INACTIVE_PROFIT_MULTIPLIER_LEVEL_2: 0.75, // 25% penalty
};


// --- CORE SCORE CALCULATION ENGINE ---

/**
 * Calculates a member's complete performance score based on capital, consistency, and credit behavior.
 * Applies a 50% score reduction on consistency and credit for members within their probation period.
 * @param {string} memberName - The name of the member.
 * @param {Date} untilDate - The date until which to calculate the score.
 * @param {Array} allData - The complete transaction dataset.
 * @returns {object} An object containing the total score and its components.
 */
export function calculatePerformanceScore(memberName, untilDate, allData) {
    const memberData = allData.filter(r => r.name === memberName);
    if (memberData.length === 0) {
        return { totalScore: 0, capitalScore: 0, consistencyScore: 0, creditScore: 0, isNewMemberRuleApplied: false, originalConsistencyScore: 0, originalCreditScore: 0 };
    }
    
    const firstTransactionDate = memberData[0]?.date;
    const membershipDays = firstTransactionDate ? (untilDate - firstTransactionDate) / (1000 * 3600 * 24) : 0;
    const isNewMemberRuleApplied = membershipDays < CONFIG.NEW_MEMBER_PROBATION_DAYS;

    const capitalScore = calculateCapitalScore(memberName, untilDate, allData);
    let consistencyScore = calculateConsistencyScore(memberData, untilDate);
    let creditScore = calculateCreditBehaviorScore(memberName, untilDate, allData);

    const originalConsistencyScore = consistencyScore;
    const originalCreditScore = creditScore;

    // Apply 50% score reduction for new members
    if (isNewMemberRuleApplied) {
        consistencyScore *= 0.50;
        creditScore *= 0.50;
    }

    const totalScore = (capitalScore * CONFIG.CAPITAL_WEIGHT) + 
                       (consistencyScore * CONFIG.CONSISTENCY_WEIGHT) + 
                       (creditScore * CONFIG.CREDIT_BEHAVIOR_WEIGHT);

    return { 
        totalScore, 
        capitalScore, 
        consistencyScore, 
        creditScore, 
        isNewMemberRuleApplied, 
        originalConsistencyScore, 
        originalCreditScore 
    };
}

/**
 * Calculates the capital score based on the average daily balance over the last 180 days.
 * @param {string} memberName - The name of the member.
 * @param {Date} untilDate - The date until which to calculate.
 * @param {Array} allData - The complete transaction dataset.
 * @returns {number} The calculated capital score (0-100).
 */
function calculateCapitalScore(memberName, untilDate, allData) {
    const daysToReview = CONFIG.CAPITAL_SCORE_DAYS;
    const startDate = new Date(untilDate.getTime() - daysToReview * 24 * 3600 * 1000);
    
    const data = allData.filter(r => r.date <= untilDate);
    const memberData = data.filter(r => r.name === memberName);

    let balanceAtStart = 0;
    memberData.filter(r => r.date < startDate).forEach(r => {
        balanceAtStart += r.sipPayment + r.payment - r.loan;
    });

    let weightedCapitalSum = 0;
    let currentBalance = balanceAtStart;
    let lastDate = startDate;

    const relevantTransactions = memberData.filter(r => r.date >= startDate);
    
    relevantTransactions.forEach(t => {
        const daysDifference = (t.date - lastDate) / (1000 * 3600 * 24);
        weightedCapitalSum += currentBalance * daysDifference;
        currentBalance += t.sipPayment + t.payment - t.loan;
        lastDate = t.date;
    });

    weightedCapitalSum += currentBalance * ((untilDate - lastDate) / (1000 * 3600 * 24));
    
    const averageDailyBalance = weightedCapitalSum / daysToReview;
    const normalizedScore = Math.min(100, (averageDailyBalance / 50000) * 100);
    return Math.max(0, normalizedScore);
}

/**
 * Calculates consistency score based on on-time SIP payments in the last year.
 * @param {Array} memberData - The transaction data for a single member.
 * @param {Date} untilDate - The date until which to calculate.
 * @returns {number} The calculated consistency score (0-100).
 */
function calculateConsistencyScore(memberData, untilDate) {
    const oneYearAgo = new Date(untilDate);
    oneYearAgo.setFullYear(untilDate.getFullYear() - 1);
    
    const recentMemberData = memberData.filter(r => r.date >= oneYearAgo);
    
    if (recentMemberData.length === 0) return 0;

    const sipHistory = {};
    recentMemberData.filter(r => r.sipPayment > 0).forEach(r => {
        const monthKey = `${r.date.getFullYear()}-${r.date.getMonth()}`;
        if (!sipHistory[monthKey]) {
            sipHistory[monthKey] = r.date.getDate() <= CONFIG.SIP_ON_TIME_LIMIT ? 10 : 5;
        }
    });

    if (Object.keys(sipHistory).length === 0) return 0;

    const consistencyPoints = Object.values(sipHistory).reduce((a, b) => a + b, 0);
    const monthsConsidered = Math.max(1, Object.keys(sipHistory).length);
    return (consistencyPoints / (monthsConsidered * 10)) * 100;
}

/**
 * Calculates credit behavior score based on loan repayment history in the last year.
 * @param {string} memberName - The name of the member.
 * @param {Date} untilDate - The date until which to calculate.
 * @param {Array} allData - The complete transaction dataset.
 * @returns {number} The calculated credit behavior score (0-100).
 */
function calculateCreditBehaviorScore(memberName, untilDate, allData) {
    const memberData = allData.filter(r => r.name === memberName && r.date <= untilDate);
    
    const oneYearAgo = new Date(untilDate);
    oneYearAgo.setFullYear(untilDate.getFullYear() - 1);

    const memberLoans = memberData.filter(r => r.loan > 0 && r.date >= oneYearAgo);

    const firstTransactionDate = memberData[0]?.date;
    if (!firstTransactionDate) return 0;

    const membershipDays = (untilDate - firstTransactionDate) / (1000 * 3600 * 24);

    if (memberLoans.length === 0) {
        if (membershipDays < CONFIG.MINIMUM_MEMBERSHIP_FOR_CREDIT_SCORE) return 40; 
        const sipData = memberData.filter(r => r.sipPayment > 0);
        if (sipData.length === 0) return 40; 
        if (sipData.length === 1) return 60;
        const sipsForAvg = sipData.slice(1);
        const avgSipDay = sipsForAvg.reduce((sum, r) => sum + r.date.getDate(), 0) / sipsForAvg.length;
        const dayScore = Math.max(0, (15 - avgSipDay) * 5 + 40);
        return Math.min(100, dayScore);
    }

    let totalPoints = 0;
    let loansProcessed = 0;
    for (const loanRecord of memberLoans) {
        let loanAmount = loanRecord.loan;
        let paymentsAfterLoan = memberData.filter(r => r.date > loanRecord.date && (r.payment > 0 || r.sipPayment > 0));
        let amountRepaid = 0;
        let repaymentDate = null;
        for (const p of paymentsAfterLoan) {
            amountRepaid += p.payment + p.sipPayment;
            if (amountRepaid >= loanAmount) {
                repaymentDate = p.date;
                break;
            }
        }
        loansProcessed++;
        if (repaymentDate) {
            const daysToRepay = (repaymentDate - loanRecord.date) / (1000 * 3600 * 24);
            if (daysToRepay < CONFIG.LOAN_FORMALITY_DAYS_LIMIT) totalPoints += 5; 
            else {
                if (daysToRepay <= CONFIG.LOAN_TERM_BEST) totalPoints += 25; 
                else if (daysToRepay <= CONFIG.LOAN_TERM_BETTER) totalPoints += 20;
                else if (daysToRepay <= CONFIG.LOAN_TERM_GOOD) totalPoints += 15;
                else if (daysToRepay <= CONFIG.LOAN_TERM_LATE_FEE) totalPoints -= 5;
                else totalPoints -= 20;
            }
            if(loanAmount > 5000) totalPoints += 5;
            if(loanAmount > 10000) totalPoints += 5;
        } else {
            totalPoints -= 40;
        }
    }
    if (loansProcessed === 0) return 40;
    const maxPossiblePoints = loansProcessed * 35; 
    const normalizedScore = (totalPoints / maxPossiblePoints) * 100;
    return Math.max(0, Math.min(100, normalizedScore));
}


// --- OTHER CORE LOGIC FUNCTIONS ---

/**
 * Determines a member's loan eligibility and multiplier based on their score and account status.
 * @param {string} memberName - The name of the member.
 * @param {number} score - The member's performance score.
 * @param {Array} allData - The complete transaction dataset.
 * @returns {object} An object indicating eligibility, multiplier, and reason if not eligible.
 */
export function getLoanEligibility(memberName, score, allData) {
    const memberData = allData.filter(r => r.name === memberName);
    
    let totalLoan = 0, totalPayment = 0;
    memberData.forEach(r => {
        totalLoan += r.loan;
        totalPayment += r.payment + r.sipPayment;
    });
    
    if (totalLoan > totalPayment) return { eligible: false, reason: 'Outstanding Loan' };

    const firstSip = memberData.find(r => r.sipPayment > 0);
    if (!firstSip) return { eligible: false, reason: 'No SIP yet' };
    const daysSinceFirstSip = (new Date() - firstSip.date) / (1000 * 3600 * 24);
    if (daysSinceFirstSip < CONFIG.MINIMUM_MEMBERSHIP_DAYS) {
        const daysLeft = Math.ceil(CONFIG.MINIMUM_MEMBERSHIP_DAYS - daysSinceFirstSip);
        return { eligible: false, reason: `${daysLeft} days left` };
    }
    const { LOAN_LIMIT_TIER1_SCORE, LOAN_LIMIT_TIER2_SCORE, LOAN_LIMIT_TIER3_SCORE, LOAN_LIMIT_TIER1_MAX, LOAN_LIMIT_TIER2_MAX, LOAN_LIMIT_TIER3_MAX, LOAN_LIMIT_TIER4_MAX } = CONFIG;
    let multiplier = LOAN_LIMIT_TIER1_MAX;
    if (score < LOAN_LIMIT_TIER1_SCORE) multiplier = LOAN_LIMIT_TIER1_MAX;
    else if (score < LOAN_LIMIT_TIER2_SCORE) multiplier = LOAN_LIMIT_TIER1_MAX + ((score - LOAN_LIMIT_TIER1_SCORE) / (LOAN_LIMIT_TIER2_SCORE - LOAN_LIMIT_TIER1_SCORE)) * (LOAN_LIMIT_TIER2_MAX - LOAN_LIMIT_TIER1_MAX);
    else if (score < LOAN_LIMIT_TIER3_SCORE) multiplier = LOAN_LIMIT_TIER2_MAX + ((score - LOAN_LIMIT_TIER2_SCORE) / (LOAN_LIMIT_TIER3_SCORE - LOAN_LIMIT_TIER2_SCORE)) * (LOAN_LIMIT_TIER3_MAX - LOAN_LIMIT_TIER2_MAX);
    else multiplier = LOAN_LIMIT_TIER3_MAX + ((score - LOAN_LIMIT_TIER3_SCORE) / (100 - LOAN_LIMIT_TIER3_SCORE)) * (LOAN_LIMIT_TIER4_MAX - LOAN_LIMIT_TIER3_MAX);
    return { eligible: true, multiplier: Math.max(LOAN_LIMIT_TIER1_MAX, multiplier) };
}

/**
 * Calculates how the profit from a single loan payment event is distributed among members.
 * @param {object} paymentRecord - The transaction record for the loan payment.
 * @param {Array} allData - The complete transaction dataset.
 * @returns {object|null} The distribution details or null if not applicable.
 */
export function calculateProfitDistribution(paymentRecord, allData) {
    const profit = paymentRecord.returnAmount * 0.90; 
    if (profit <= 0) return null;

    const userLoansBeforePayment = allData.filter(r => r.name === paymentRecord.name && r.loan > 0 && r.date < paymentRecord.date);
    if (userLoansBeforePayment.length === 0) return null; 
    const relevantLoan = userLoansBeforePayment[userLoansBeforePayment.length - 1];
    const loanDate = relevantLoan.date;
    const snapshotScores = {};
    let totalScoreInSnapshot = 0;
    const membersInSystemAtLoanDate = [...new Set(allData.filter(r => r.date <= loanDate).map(r => r.name))];
    
    membersInSystemAtLoanDate.forEach(name => {
        const scoreObject = calculatePerformanceScore(name, loanDate, allData);
        if (scoreObject.totalScore > 0) {
            snapshotScores[name] = scoreObject;
            totalScoreInSnapshot += scoreObject.totalScore;
        }
    });

    if (totalScoreInSnapshot <= 0) return null;
    const distribution = [];
    for (const memberName in snapshotScores) {
        let memberShare = (snapshotScores[memberName].totalScore / totalScoreInSnapshot) * profit;
        
        const lastLoanDate = allData.filter(r => r.name === memberName && r.loan > 0 && r.date <= loanDate).pop()?.date;
        const daysSinceLastLoan = lastLoanDate ? (loanDate - lastLoanDate) / (1000 * 3600 * 24) : Infinity;
        
        let appliedMultiplier = 1.0;
        if (daysSinceLastLoan > CONFIG.INACTIVE_DAYS_LEVEL_2) {
            appliedMultiplier = CONFIG.INACTIVE_PROFIT_MULTIPLIER_LEVEL_2;
        } else if (daysSinceLastLoan > CONFIG.INACTIVE_DAYS_LEVEL_1) {
            appliedMultiplier = CONFIG.INACTIVE_PROFIT_MULTIPLIER_LEVEL_1;
        }
        memberShare *= appliedMultiplier;

        if (memberShare > 0) distribution.push({ 
            name: memberName, share: memberShare,
            snapshotScore: snapshotScores[memberName].totalScore,
            totalSnapshotScore: totalScoreInSnapshot,
            multiplier: appliedMultiplier
        });
    }
    return { profit, relevantLoan, distribution: distribution.sort((a,b) => b.share - a.share) };
}

/**
 * Calculates the total profit earned by a single member across all events.
 * @param {string} memberName - The name of the member.
 * @param {Array} allData - The complete transaction dataset.
 * @returns {number} The total profit earned.
 */
export function calculateTotalProfitForMember(memberName, allData) {
    return allData.reduce((totalProfit, transaction) => {
        if (transaction.returnAmount > 0) {
            const result = calculateProfitDistribution(transaction, allData);
            const memberShare = result?.distribution.find(d => d.name === memberName);
            if (memberShare) totalProfit += memberShare.share;
        }
        return totalProfit;
    }, 0);
}


// --- UTILITY FUNCTIONS ---

/**
 * Formats a Date object into a readable string (e.g., "04 Oct 2025").
 * @param {Date} date - The date to format.
 * @returns {string} The formatted date string.
 */
export function formatDate(date) { 
    if (!(date instanceof Date) || isNaN(date)) return "N/A"; 
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); 
}

