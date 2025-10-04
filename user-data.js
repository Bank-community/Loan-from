// user-data.js
// Is file ka kaam sirf Firebase se data laana aur use process karna hai.
// Yeh admin panel ke data structure ke saath sync rehta hai.
// BADLAV: Balance calculation mein active loans ka outstanding amount ghataaya gaya hai.

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

        // Firebase se raw data extract karein
        const allMembersRaw = data.members || {};
        const allTransactionsRaw = data.transactions || {};
        const allActiveLoansRaw = data.activeLoans || {};
        const penaltyWalletRaw = data.penaltyWallet || {};
        const adminSettingsRaw = data.admin || {};
        const notificationsRaw = (data.admin && data.admin.notifications) || {};
        const manualNotificationsRaw = notificationsRaw.manual || {};
        const automatedQueueRaw = notificationsRaw.automatedQueue || {};
        const allProductsRaw = data.products || {};

        // Data ko process karne ka process shuru karein
        const processedMembers = {};
        const allTransactions = Object.values(allTransactionsRaw);
        const allActiveLoans = Object.values(allActiveLoansRaw);

        // Sabhi approved members par loop chalayein
        for (const memberId in allMembersRaw) {
            const member = allMembersRaw[memberId];
            if (member.status !== 'Approved' || !member.fullName) continue;

            // Har member ke liye alag se transactions filter karein
            const memberTransactions = allTransactions.filter(tx => tx.memberId === memberId);
            
            // === BADLAV START: BALANCE CALCULATION LOGIC UPDATE ===
            // 1. Kul jama rashi (deposits) ki ganana karein
            let depositBalance = 0;
            let totalReturn = 0;
            let loanCount = 0;

            memberTransactions.forEach(tx => {
                if (tx.type === 'SIP' || tx.type === 'Extra Payment') {
                    depositBalance += parseFloat(tx.amount || 0);
                } else if (tx.type === 'Extra Withdraw') {
                    depositBalance -= parseFloat(tx.amount || 0);
                }
                if (tx.type === 'Loan Payment') {
                    totalReturn += parseFloat(tx.interestPaid || 0);
                }
                if (tx.type === 'Loan Taken') {
                    loanCount++;
                }
            });

            // 2. Sadasya ke sabhi active loans ka kul bakaya (outstanding) nikalein
            const memberActiveLoans = allActiveLoans.filter(loan => loan.memberId === memberId && loan.status === 'Active');
            const totalOutstandingLoan = memberActiveLoans.reduce((sum, loan) => sum + parseFloat(loan.outstandingAmount || 0), 0);
            
            // 3. Antim balance (Total Deposit - Total Outstanding Loan)
            const finalBalance = depositBalance - totalOutstandingLoan;
            // === BADLAV END ===


            const now = new Date();
            const currentMonthSip = memberTransactions.find(tx => 
                tx.type === 'SIP' &&
                new Date(tx.date).getMonth() === now.getMonth() &&
                new Date(tx.date).getFullYear() === now.getFullYear()
            );

            // Processed data ko object mein save karein
            processedMembers[memberId] = {
                ...member,
                id: memberId,
                name: member.fullName,
                balance: finalBalance, // Yahan naya balance set kiya gaya hai
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

        // Poore community ke liye stats calculate karein
        const communityStats = calculateCommunityStats(Object.values(processedMembers), allTransactions, allActiveLoansRaw, penaltyWalletRaw);

        // Sab kuch ek object mein return karein
        return {
            processedMembers: Object.values(processedMembers).sort((a, b) => b.balance - a.balance),
            allTransactions,
            penaltyWalletData: penaltyWalletRaw,
            adminSettings: adminSettingsRaw,
            communityStats,
            manualNotifications: manualNotificationsRaw,
            automatedQueue: automatedQueueRaw,
            allProducts: allProductsRaw,
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
    let totalSipAmount = 0;
    allTransactions.forEach(tx => {
        if (tx.type === 'SIP' || tx.type === 'Extra Payment') {
            totalSipAmount += parseFloat(tx.amount || 0);
        } else if (tx.type === 'Extra Withdraw') {
            totalSipAmount -= parseFloat(tx.amount || 0);
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
    const totalPenaltyExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    return {
        totalSipAmount,
        totalCurrentLoanAmount,
        netReturnAmount: totalInterestReceived - penaltyFromInterest,
        availableCommunityBalance: totalSipAmount - totalCurrentLoanAmount,
        totalPenaltyBalance: totalPenaltyIncomes - totalPenaltyExpenses,
        totalLoanDisbursed: allTransactions.filter(tx => tx.type === 'Loan Taken').reduce((sum, tx) => sum + tx.amount, 0)
    };
}

