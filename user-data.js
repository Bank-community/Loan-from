// user-data.js
// FINAL BADLAV: "Community Funds" modal mein "Total SIP Amount" ki calculation theek kar di gayi hai.
// Ab yeh sirf SIP amount ko jodega, Extra Payment/Withdraw ko nahi.

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const PRIME_MEMBERS = ["Prince rama", "Amit kumar", "Mithilesh Sahni"];

/**
 * Firebase se saara data fetch karta hai aur use process karta hai.
 * @param {firebase.database.Database} database - Firebase database ka instance.
 * @returns {Promise<object>} - Processed data ka object.
 */
export async function fetchAndProcessData(database) {
    try {
        const snapshot = await database.ref().once('value');
        const data = snapshot.val();
        if (!data) {
            throw new Error("Database is empty or could not be read.");
        }

        const allMembersRaw = data.members || {};
        const allTransactionsRaw = data.transactions || {};
        const allActiveLoansRaw = data.activeLoans || {};
        const penaltyWalletRaw = data.penaltyWallet || {};
        const adminSettingsRaw = data.admin || {};
        const notificationsRaw = adminSettingsRaw.notifications || {};
        const manualNotificationsRaw = notificationsRaw.manual || {};
        const automatedQueueRaw = notificationsRaw.automatedQueue || {};
        const allProductsRaw = data.products || {};
        const headerButtonsRaw = adminSettingsRaw.header_buttons || {};

        const processedMembers = {};
        const allTransactions = Object.values(allTransactionsRaw);
        const allActiveLoans = Object.values(allActiveLoansRaw);

        for (const memberId in allMembersRaw) {
            const member = allMembersRaw[memberId];
            if (member.status !== 'Approved' || !member.fullName) continue;

            const memberTransactions = allTransactions.filter(tx => tx.memberId === memberId);
            
            let totalSipAmount = 0;
            let totalReturn = 0;
            let loanCount = 0;

            memberTransactions.forEach(tx => {
                if (tx.type === 'SIP') {
                    totalSipAmount += parseFloat(tx.amount || 0);
                }
                
                if (tx.type === 'Loan Payment') {
                    totalReturn += parseFloat(tx.interestPaid || 0);
                }
                if (tx.type === 'Loan Taken') {
                    loanCount++;
                }
            });

            const memberActiveLoans = allActiveLoans.filter(loan => loan.memberId === memberId && loan.status === 'Active');
            const totalOutstandingLoan = memberActiveLoans.reduce((sum, loan) => sum + parseFloat(loan.outstandingAmount || 0), 0);
            
            const displayBalanceOnCard = totalSipAmount - totalOutstandingLoan;

            const now = new Date();
            const currentMonthSip = memberTransactions.find(tx => 
                tx.type === 'SIP' &&
                new Date(tx.date).getMonth() === now.getMonth() &&
                new Date(tx.date).getFullYear() === now.getFullYear()
            );

            processedMembers[memberId] = {
                ...member,
                id: memberId,
                name: member.fullName,
                balance: displayBalanceOnCard,
                totalReturn: totalReturn,
                loanCount: loanCount,
                displayImageUrl: member.profilePicUrl || DEFAULT_IMAGE,
                isPrime: PRIME_MEMBERS.some(p => p.trim().toLowerCase() === member.fullName.trim().toLowerCase()),
                sipStatus: { 
                    paid: !!currentMonthSip, 
                    amount: currentMonthSip ? parseFloat(currentMonthSip.amount) : 0 
                }
            };
        }

        const communityStats = calculateCommunityStats(Object.values(processedMembers), allTransactions, allActiveLoansRaw, penaltyWalletRaw);

        return {
            processedMembers: Object.values(processedMembers).sort((a, b) => b.balance - a.balance),
            allTransactions,
            penaltyWalletData: penaltyWalletRaw,
            adminSettings: adminSettingsRaw,
            communityStats,
            manualNotifications: manualNotificationsRaw,
            automatedQueue: automatedQueueRaw,
            allProducts: allProductsRaw,
            headerButtons: headerButtonsRaw,
        };

    } catch (error) {
        console.error('Data processing failed:', error);
        throw error;
    }
}

/**
 * Poore community ke liye aarthik (financial) stats calculate karta hai.
 */
function calculateCommunityStats(processedMembers, allTransactions, allActiveLoans, penaltyWallet) {
    // === YAHAN BADLAV KIYA GAYA HAI ===
    let totalPureSipAmount = 0; // Yeh sirf SIP ko jodega
    let totalCommunityDeposits = 0; // Yeh SIP, Extra Payment, aur Extra Withdraw sabko jodega/ghatayega

    allTransactions.forEach(tx => {
        // Sirf SIP amount ke liye alag se calculation
        if (tx.type === 'SIP') {
            totalPureSipAmount += parseFloat(tx.amount || 0);
        }
        
        // Community balance ke liye sabhi deposit/withdraw ka calculation
        if (tx.type === 'SIP' || tx.type === 'Extra Payment') {
            totalCommunityDeposits += parseFloat(tx.amount || 0);
        } else if (tx.type === 'Extra Withdraw') {
            totalCommunityDeposits -= parseFloat(tx.amount || 0);
        }
    });

    const totalCurrentLoanAmount = Object.values(allActiveLoans)
        .filter(loan => loan.status === 'Active')
        .reduce((sum, loan) => sum + parseFloat(loan.outstandingAmount || 0), 0);

    const totalInterestReceived = allTransactions
        .filter(tx => tx.type === 'Loan Payment')
        .reduce((sum, tx) => sum + parseFloat(tx.interestPaid || 0), 0);
        
    const penaltyFromInterest = totalInterestReceived * 0.10;

    const penaltyIncomes = Object.values(penaltyWallet.incomes || {});
    const penaltyExpenses = Object.values(penaltyWallet.expenses || {});
    const totalPenaltyIncomes = penaltyIncomes.reduce((sum, income) => sum + income.amount, 0);
    const totalPenaltyExpenses = penaltyExpenses.reduce((sum, expense) => sum + expense.amount, 0);

    return {
        totalSipAmount: totalPureSipAmount, // UI ko ab sirf SIP ka total bheja jayega
        totalCurrentLoanAmount,
        netReturnAmount: totalInterestReceived - penaltyFromInterest,
        availableCommunityBalance: totalCommunityDeposits - totalCurrentLoanAmount, // Available balance pehle ki tarah sahi calculate hoga
        totalPenaltyBalance: totalPenaltyIncomes - totalPenaltyExpenses,
        totalLoanDisbursed: allTransactions.filter(tx => tx.type === 'Loan Taken').reduce((sum, tx) => sum + tx.amount, 0)
    };
    // === BADLAV SAMAPT ===
}


