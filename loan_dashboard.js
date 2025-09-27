document.addEventListener("DOMContentLoaded", () => {
    
    // Function to fetch Firebase config and initialize the app
    async function checkAuthAndInitialize() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Configuration failed to load.');
            const config = await response.json();
            
            firebase.initializeApp(config.firebase);
            
            // Check user authentication status
            firebase.auth().onAuthStateChanged(user => {
                if (user) {
                    runAppLogic(); // If logged in, run the main app logic
                } else {
                    // If not logged in, redirect to login page
                    window.location.href = `/login.html?redirect=${window.location.pathname}`;
                }
            });

        } catch (error) {
            console.error("Initialization Error:", error);
            const loader = document.getElementById('loader');
            loader.innerHTML = `<p style="color: red;">Application failed to initialize: ${error.message}</p>`;
        }
    }

    // Main function that contains all the dashboard logic
    function runAppLogic() {
        // SVG Icons used in the UI
        const ICONS = {
            calendar: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18" /></svg>`,
            money: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125-1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V8.25c0-.621.504-1.125 1.125-1.125h1.5" /></svg>`,
            tag: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>`,
            download: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>`,
            clock: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`,
        };

        // State object to hold all data and UI elements
        const state = {
            allActiveLoans: [],
            membersData: {},
            ui: {
                loader: document.getElementById('loader'),
                container: document.getElementById('outstanding-loans-container'),
                totalCountEl: document.getElementById('total-outstanding-count'),
                totalAmountEl: document.getElementById('total-outstanding-amount'),
                searchInput: document.getElementById('search-input'),
                modal: document.getElementById('credit-modal'),
                modalTitle: document.getElementById('modal-title'),
                openModalBtn: document.getElementById('generate-credit-btn'),
                closeModalBtn: document.querySelector('.close-modal-btn'),
                memberSelect: document.getElementById('member-select'),
                rechargeToggle: document.getElementById('recharge-toggle'),
                creditFields: document.getElementById('credit-fields'),
                rechargeFields: document.getElementById('recharge-fields'),
                creditAmountInput: document.getElementById('credit-amount'),
                telecomSelect: document.getElementById('telecom-select'),
                rechargeAmountInput: document.getElementById('recharge-amount'),
                generateCardBtn: document.getElementById('generate-card-btn'),
                generatedCardContainer: document.getElementById('generated-card-container'),
                modalStatus: document.getElementById('modal-status'),
            },
        };

        // Fetches all required data from Firebase and processes it
        async function fetchAndProcessData() {
            state.ui.loader.innerHTML = '<div class="spinner"></div>Loading active loans...';
            state.ui.loader.classList.remove('hidden');
            state.ui.container.innerHTML = '';
            try {
                const db = firebase.database();
                const activeLoansRef = db.ref('activeLoans');
                const membersRef = db.ref('members');

                // Fetch both active loans and members data simultaneously
                const [loansSnapshot, membersSnapshot] = await Promise.all([
                    activeLoansRef.once('value'),
                    membersRef.once('value')
                ]);

                if (!loansSnapshot.exists() || !membersSnapshot.exists()) {
                    throw new Error('No active loans or member data found.');
                }
                
                state.membersData = membersSnapshot.val();
                const activeLoansData = loansSnapshot.val();

                // Process the active loans data
                state.allActiveLoans = Object.values(activeLoansData)
                    .filter(loan => loan.status === 'Active') // Only show active loans
                    .map(loan => {
                        // Combine loan data with corresponding member data
                        const memberInfo = state.membersData[loan.memberId] || {};
                        return {
                            ...loan,
                            memberName: memberInfo.fullName || 'Unknown Member',
                            profilePicUrl: memberInfo.profilePicUrl || null,
                        };
                    })
                    .sort((a, b) => new Date(b.loanDate) - new Date(a.loanDate));
                
                populateMembersDropdown(); 
                displayAllData();

            } catch (error) {
                console.error("Data fetch failed:", error);
                state.ui.container.innerHTML = `<p style="color: red; text-align: center;">Data could not be loaded: ${error.message}</p>`;
            } finally {
                state.ui.loader.classList.add('hidden');
            }
        }
        
        // Main function to update the entire UI
        function displayAllData() {
            displaySummary(state.allActiveLoans);
            displayLoanCards(state.allActiveLoans);
        }

        // Updates the summary cards at the top
        function displaySummary(loans) {
            const { totalCountEl, totalAmountEl } = state.ui;
            const totalAmount = loans.reduce((sum, loan) => sum + parseFloat(loan.outstandingAmount), 0);
            totalCountEl.textContent = loans.length;
            totalAmountEl.textContent = `₹${totalAmount.toLocaleString('en-IN')}`;
        }
        
        // Renders all the loan cards on the screen
        function displayLoanCards(loans) {
            const { container } = state.ui;
            container.innerHTML = '';
            if (loans.length === 0) {
                container.innerHTML = `<div class="message-box"><h2>All Clear!</h2><p>There are no outstanding loans.</p></div>`;
                return;
            }
            loans.forEach(loan => {
                const card = document.createElement('div');
                const cardId = `loan-card-${loan.loanId}`;
                card.id = cardId;
                const defaultPic = `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.memberName)}&background=4f46e5&color=fff&size=50`;
                const profilePic = loan.profilePicUrl || defaultPic;
                const loanDate = new Date(loan.loanDate);
                const daysAgo = Math.floor((new Date() - loanDate) / (1000 * 3600 * 24));

                // Logic for 10-Day Credit and Recharge cards
                if (loan.loanType === '10 Days Credit' || loan.loanType === 'Recharge') {
                    card.className = 'credit-card-wrapper';
                    const isRecharge = loan.loanType === 'Recharge';
                    const cardImageUrl = isRecharge ? "https://i.ibb.co/p7pVDLx/IMG-20250922-104425.jpg" : "https://i.ibb.co/bjWtdV0L/1757738358948.jpg";
                    const bannerClass = isRecharge ? 'warning' : 'green';
                    
                    let bannerText;
                    if (isRecharge) {
                         bannerText = `Recharge taken ${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago`;
                    } else {
                        const dueDate = new Date(loanDate);
                        dueDate.setDate(dueDate.getDate() + 10);
                        const daysRemaining = Math.max(0, Math.ceil((dueDate - new Date()) / (1000 * 3600 * 24)));
                        bannerText = `Free period ends in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}`;
                    }

                    card.innerHTML = `
                        <div class="credit-card-image-bg" style="background-image: url('${cardImageUrl}')">
                            <div class="cc-content">
                                <div class="cc-profile-pic"><img src="${profilePic}" alt="${loan.memberName}"></div>
                                ${isRecharge ? `<div class="cc-telecom-logo">${loan.telecomCompany || ''}</div>` : ''}
                                <div class="cc-member-name">${loan.memberName}</div>
                                <div class="cc-amount-group"><div class="cc-value">₹${parseFloat(loan.outstandingAmount).toLocaleString('en-IN')}</div></div>
                            </div>
                        </div>
                        <div class="pending-banner ${bannerClass}">${ICONS.clock}<span>${bannerText}</span></div>`;
                } else { 
                    // Logic for standard loan cards (Personal, Business etc.)
                    card.className = 'loan-card';
                    const formattedDate = loanDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                    const bannerClass = daysAgo > 60 ? 'danger' : (daysAgo > 30 ? 'warning' : 'green');
                    const bannerText = `Loan taken ${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago`;
                    
                    card.innerHTML = `
                        <div class="card-main-content">
                            <button class="card-download-btn" data-card-id="${cardId}" title="Download Card">${ICONS.download}</button>
                            <div class="card-top">
                                <div class="profile-picture"><img src="${profilePic}" alt="${loan.memberName}"></div>
                                <div class="user-details">
                                    <h3>${loan.memberName}</h3>
                                    <div class="loan-date">${ICONS.calendar} Loan Date: ${formattedDate}</div>
                                </div>
                            </div>
                            <div class="card-middle">
                                <div class="detail-row">
                                    <span class="detail-label">${ICONS.money} Outstanding Amount:</span>
                                    <span class="detail-value amount">₹${parseFloat(loan.outstandingAmount).toLocaleString('en-IN')}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">${ICONS.tag} Loan Type:</span>
                                    <span class="detail-value loan-type-value">${loan.loanType}</span>
                                </div>
                            </div>
                        </div>
                        <div class="pending-banner ${bannerClass}">${ICONS.clock}<span>${bannerText}</span></div>`;
                }
                container.appendChild(card);
            });
        }
        
        // Populates the member dropdown in the modal
        function populateMembersDropdown() {
            const { memberSelect } = state.ui;
            memberSelect.innerHTML = '<option value="">-- Choose a member --</option>';
            for (const memberId in state.membersData) {
                const member = state.membersData[memberId];
                if(member.status === 'Approved') {
                    const option = document.createElement('option');
                    option.value = memberId;
                    option.textContent = member.fullName;
                    option.dataset.profilePic = member.profilePicUrl || '';
                    memberSelect.appendChild(option);
                }
            }
        }

        // Sets up all event listeners for the modal
        function setupModalEventListeners() {
            const { modal, openModalBtn, closeModalBtn, memberSelect, creditAmountInput, generateCardBtn, modalStatus, generatedCardContainer, rechargeToggle, creditFields, rechargeFields, modalTitle, telecomSelect, rechargeAmountInput } = state.ui;

            openModalBtn.addEventListener('click', () => {
                rechargeToggle.checked = false;
                rechargeToggle.dispatchEvent(new Event('change')); // Trigger change to reset UI
                memberSelect.value = '';
                creditAmountInput.value = '';
                rechargeAmountInput.value = '';
                creditAmountInput.disabled = true;
                generatedCardContainer.innerHTML = '';
                modalStatus.textContent = '';
                modal.classList.add('visible');
            });
            
            closeModalBtn.addEventListener('click', () => modal.classList.remove('visible'));
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('visible'); });

            memberSelect.addEventListener('change', () => {
                creditAmountInput.disabled = !memberSelect.value;
                creditAmountInput.placeholder = memberSelect.value ? 'Enter amount' : 'Select a member first';
            });
            
            rechargeToggle.addEventListener('change', () => {
                const isRecharge = rechargeToggle.checked;
                creditFields.style.display = isRecharge ? 'none' : 'block';
                rechargeFields.style.display = isRecharge ? 'block' : 'none';
                modalTitle.textContent = isRecharge ? 'Generate Recharge Card' : 'Generate 10-Day Credit';
                generateCardBtn.textContent = isRecharge ? 'Generate Recharge Card' : 'Generate Card';
            });

            // This is the main function for generating the card AND saving to Firebase
            generateCardBtn.addEventListener('click', async () => {
                const isRecharge = rechargeToggle.checked;
                const memberId = memberSelect.value;
                const selectedOption = memberSelect.options[memberSelect.selectedIndex];

                if (!memberId) {
                    modalStatus.textContent = 'Please select a member.';
                    modalStatus.style.color = 'red';
                    return;
                }
                
                const amount = parseFloat(isRecharge ? rechargeAmountInput.value : creditAmountInput.value);
                if (isNaN(amount) || amount <= 0) {
                    modalStatus.textContent = 'Please enter a valid amount.';
                    modalStatus.style.color = 'red';
                    return;
                }

                modalStatus.textContent = 'Saving to database...';
                modalStatus.style.color = 'var(--text-light)';
                generateCardBtn.disabled = true;

                try {
                    const db = firebase.database();
                    const updates = {};
                    const timestamp = firebase.database.ServerValue.TIMESTAMP;
                    const loanDate = new Date().toISOString();

                    const newLoanRef = db.ref('activeLoans').push();
                    const loanId = newLoanRef.key;

                    const newTxRef = db.ref('transactions').push();
                    const transactionId = newTxRef.key;
                    
                    const loanType = isRecharge ? 'Recharge' : '10 Days Credit';

                    // Prepare the active loan data
                    const loanData = {
                        loanId, memberId,
                        memberName: selectedOption.textContent,
                        loanType, loanDate,
                        originalAmount: amount,
                        outstandingAmount: amount,
                        status: 'Active',
                        timestamp
                    };
                    if (isRecharge) {
                        loanData.telecomCompany = telecomSelect.value;
                    }

                    // Prepare the transaction data
                    const transactionData = {
                        transactionId, memberId, date: loanDate,
                        type: 'Loan Taken',
                        amount, loanType,
                        linkedLoanId: loanId,
                        timestamp,
                        imageUrl: "" // No image for these types of loans
                    };

                    updates[`/activeLoans/${loanId}`] = loanData;
                    updates[`/transactions/${transactionId}`] = transactionData;

                    // Save to Firebase
                    await db.ref().update(updates);
                    
                    modalStatus.textContent = 'Loan saved! Generating card...';
                    modalStatus.style.color = 'var(--success-color)';

                    // Now, generate the visual card for sharing
                    generateVisualCard(loanData, selectedOption.dataset.profilePic);
                    
                    // Refresh the main dashboard data
                    fetchAndProcessData();

                } catch (error) {
                    console.error("Error saving loan:", error);
                    modalStatus.textContent = `Error: ${error.message}`;
                    modalStatus.style.color = 'red';
                } finally {
                    generateCardBtn.disabled = false;
                }
            });
        }
        
        // Generates the visual representation of the card in the modal
        function generateVisualCard(loanData, profilePicUrl) {
            const { generatedCardContainer } = state.ui;
            const isRecharge = loanData.loanType === 'Recharge';
            const cardImageUrl = isRecharge ? "https://i.ibb.co/p7pVDLx/IMG-20250922-104425.jpg" : "https://i.ibb.co/bjWtdV0L/1757738358948.jpg";
            const defaultPic = `https://ui-avatars.com/api/?name=${encodeURIComponent(loanData.memberName)}&background=4f46e5&color=fff&size=50`;
            const profilePic = profilePicUrl || defaultPic;

            let cardContentHtml = `
                <div class="cc-profile-pic"><img src="${profilePic}" alt="${loanData.memberName}"></div>
                <div class="cc-member-name">${loanData.memberName}</div>
                <div class="cc-amount-group"><div class="cc-value">₹${loanData.originalAmount.toLocaleString('en-IN')}</div></div>
            `;
            if (isRecharge) {
                cardContentHtml += `<div class="cc-telecom-logo">${loanData.telecomCompany}</div>`;
            }

            generatedCardContainer.innerHTML = `
                <div id="card-to-share" class="credit-card-wrapper" style="margin: 0 auto;">
                   <div class="credit-card-image-bg" style="background-image: url('${cardImageUrl}');">
                      <div class="cc-content">${cardContentHtml}</div>
                   </div>
                </div>
                <div class="action-buttons">
                    <button class="modal-btn" id="download-btn">Download Card</button>
                    <button class="modal-btn" id="share-btn">Share on WhatsApp</button>
                </div>`;
            
            document.getElementById('download-btn').addEventListener('click', () => handleCardAction('download'));
            document.getElementById('share-btn').addEventListener('click', () => handleCardAction('share'));
        }

        // Handles downloading or sharing the generated card image
        async function handleCardAction(action) {
            const cardElement = document.getElementById('card-to-share');
            const statusEl = state.ui.modalStatus;
            statusEl.textContent = "Preparing image...";
            statusEl.style.color = 'var(--text-light)';

            try {
                const canvas = await html2canvas(cardElement, { useCORS: true, scale: 3, backgroundColor: null });
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                
                if (action === 'download') {
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `card-${Date.now()}.png`;
                    link.click();
                    URL.revokeObjectURL(link.href);
                    statusEl.textContent = "Image downloaded!";
                    statusEl.style.color = 'var(--success-color)';
                } else if (action === 'share') {
                    const file = new File([blob], 'card.png', { type: 'image/png' });
                    if (navigator.share && navigator.canShare({ files: [file] })) {
                         await navigator.share({ files: [file], title: 'Generated Card' });
                         statusEl.textContent = "Shared successfully!";
                         statusEl.style.color = 'var(--success-color)';
                    } else {
                        statusEl.textContent = 'Sharing not supported. Please download.';
                        statusEl.style.color = 'var(--warning-color)';
                    }
                }
            } catch (err) {
                console.error('Action failed:', err);
                statusEl.textContent = 'Could not generate image.';
                statusEl.style.color = 'red';
            }
        }
        
        // Handles downloading individual loan cards from the dashboard
        function downloadCardAsImage(cardId) {
            const cardElement = document.getElementById(cardId);
            if (!cardElement) return;

            html2canvas(cardElement, { 
                useCORS: true,
                scale: 4,
                onclone: (document) => {
                    const button = document.querySelector(`#${cardId} .card-download-btn`);
                    if(button) button.style.display = 'none';
                }
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = `${cardId}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
            });
        }

        // Sets up general event listeners for search and card downloads
        function setupEventListeners() {
             state.ui.searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().trim();
                const filteredLoans = state.allActiveLoans.filter(loan => 
                    loan.memberName.toLowerCase().includes(searchTerm)
                );
                displayLoanCards(filteredLoans);
            });
            
            state.ui.container.addEventListener('click', function(event) {
                const downloadButton = event.target.closest('.card-download-btn');
                if (downloadButton) {
                    const cardId = downloadButton.dataset.cardId;
                    downloadCardAsImage(cardId);
                }
            });
        }
        
        // Initial function calls when the app is ready
        fetchAndProcessData();
        setupEventListeners();
        setupModalEventListeners();
    }
    
    // Start the application
    checkAuthAndInitialize();
});

