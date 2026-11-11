const firebaseConfig = {
  apiKey: "AIzaSyBupRlote48_0GtaelL_a13uYUfFPhCWbE",
  authDomain: "douri-app-63918.firebaseapp.com",
  projectId: "douri-app-63918",
  storageBucket: "douri-app-63918.firebasestorage.app",
  messagingSenderId: "653080780726",
  appId: "1:653080780726:web:4f2b3421b905e65af9ab17"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

const adminSecretCode = "DOCTOR2024"; // الكود السري

let allDoctors = []; 
let patientDirectory = {}; 
let currentListener = null; 
let activeTicketToDisplay = null;
let modalDoctorId = null;
let modalDoctorName = null;
let doctorMap = null;
let doctorMarker = null;
let myBookingsListeners = []; 

function t(key) {
    const lang = typeof currentLang !== 'undefined' ? currentLang : 'ar';
    return translations[lang] && translations[lang][key] ? translations[lang][key] : key;
}

// --- 1. الوضع الليلي ---
function initTheme() {
    let savedTheme = localStorage.getItem('douri_theme');
    let themeBtn = document.getElementById('themeToggle');
    if (!themeBtn) return; 
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
        document.documentElement.removeAttribute('data-theme');
        themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
}

function toggleTheme() {
    let currentTheme = document.documentElement.getAttribute('data-theme');
    let themeBtn = document.getElementById('themeToggle');
    if (currentTheme === 'dark') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('douri_theme', 'light');
        themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('douri_theme', 'dark');
        themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
}

// --- 2. حساب الوقت المتوقع بذكاء (بناءً على ساعات عمل العيادة) ---
function getSmartETA(doctorData, peopleAhead) {
    const now = new Date();
    const startStr = doctorData.startTime || "08:00";
    const endStr = doctorData.endTime || "22:00";
    const serviceTime = doctorData.serviceTime || 10;

    let [startH, startM] = startStr.split(':').map(Number);
    let [endH, endM] = endStr.split(':').map(Number);

    let nowM = now.getHours() * 60 + now.getMinutes();
    let startM = startH * 60 + startM;
    let endM = endH * 60 + endM;

    let eta = new Date(now);

    // إذا كان الوقت الحالي قبل فتح العيادة
    if (nowM < startM) {
        eta.setHours(startH, startM, 0, 0);
    } 
    // إذا كان الوقت الحالي بعد إغلاق العيادة
    else if (nowM >= endM) {
        eta.setDate(eta.getDate() + 1); // ننقله لليوم التالي
        eta.setHours(startH, startM, 0, 0);
    }

    // إضافة وقت الانتظار (عدد المرضى × وقت الكشف)
    eta.setMinutes(eta.getMinutes() + (peopleAhead * serviceTime));

    // التحقق: هل تجاوزنا وقت الإغلاق بعد إضافة وقت الانتظار؟
    let etaM = eta.getHours() * 60 + eta.getMinutes();
    if (etaM >= endM && peopleAhead > 0) {
        let overflow = etaM - endM;
        eta.setDate(eta.getDate() + 1);
        eta.setHours(startH, startM, 0, 0);
        eta.setMinutes(eta.getMinutes() + overflow);
    }

    let timeStr = String(eta.getHours()).padStart(2, '0') + ":" + String(eta.getMinutes()).padStart(2, '0');
    
    // التحقق مما إذا كان الموعد في يوم مختلف (غداً)
    if (eta.getDate() !== now.getDate()) {
        return (currentLang === 'ar' ? "غداً " : "Tmrw ") + timeStr;
    }
    return timeStr;
}

// --- 3. تحميل البيانات ---
function loadPatients() {
    db.collection("patients").onSnapshot((snapshot) => {
        patientDirectory = {};
        let datalist = document.getElementById('patientNames');
        if(!datalist) return;
        datalist.innerHTML = ''; 
        snapshot.forEach((doc) => {
            let data = doc.data();
            patientDirectory[data.name] = data.phone;
            datalist.innerHTML += `<option value="${data.name}">`;
        });
    });
}

function loadDoctors() {
    db.collection("doctors").onSnapshot((snapshot) => {
        allDoctors = [];
        let cities = new Set(); 
        snapshot.forEach((doc) => {
            let data = doc.data();
            allDoctors.push({ id: doc.id, ...data });
            if (data.address && data.address.city) {
                cities.add(data.address.city);
            }
        });
        let citySelect = document.getElementById('cityFilter');
        if (citySelect) {
            let currentSelection = citySelect.value; 
            citySelect.innerHTML = `<option value="">${t('all_cities')}</option>`;
            cities.forEach(city => {
                citySelect.innerHTML += `<option value="${city}">${city}</option>`;
            });
            if (currentSelection) citySelect.value = currentSelection;
        }
        filterDoctors();
        updateBanner();
    });
}

// --- 4. عرض الأطباء ---
function renderDoctors(doctorsToRender) {
    const list = document.getElementById('doctorsList');
    if (!list) return;
    list.innerHTML = '';
    if (doctorsToRender.length === 0) {
        list.innerHTML = `<p style="text-align:center; color:var(--text-muted); margin-top:20px;">${t('no_results')}</p>`;
        return;
    }
    doctorsToRender.forEach(doc => {
        let addressText = `${doc.address.city} - ${doc.address.street || ''}`;
        let mapLink = "";
        if (doc.location && doc.location.lat && doc.location.lng) {
            mapLink = `https://www.google.com/maps/search/?api=1&query=${doc.location.lat},${doc.location.lng}`;
        } else {
            let fullAddressForMap = `${doc.address.city} ${doc.address.street || ''}`;
            mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddressForMap)}`;
        }
        let isClosed = doc.isOpen === false; 
        
        let badgeHTML = isClosed 
            ? `<span class="badge red" style="background:var(--danger-light); color:var(--danger);"><i class="fa-solid fa-lock"></i> ${t('closed_temp')}</span>` 
            : `<span class="badge green">${t('available')}</span>`;
            
        let btnHTML = isClosed
            ? `<button class="book-btn" style="background-color:var(--text-muted); cursor:not-allowed;" disabled><i class="fa-solid fa-ban"></i> ${t('on_break')}</button>`
            : `<button class="book-btn" onclick="openBookingModal('${doc.id}', '${doc.name}')"><i class="fa-solid fa-calendar-check"></i> ${t('book_now')}</button>`;

        list.innerHTML += `
            <div class="clinic-card" style="${isClosed ? 'opacity: 0.7;' : ''}">
                <div class="clinic-info">
                    <h2>${doc.name || (currentLang === 'ar' ? 'طبيب غير معروف' : 'Unknown Doctor')}</h2>
                    <p class="doc-specialty">${doc.specialty || ''}</p>
                    <p class="doc-address"><i class="fa-solid fa-location-dot"></i> ${addressText}</p>
                    <a href="${mapLink}" target="_blank" class="map-btn"><i class="fa-solid fa-map-location-dot"></i> ${t('clinic_location')}</a>
                </div>
                <div class="clinic-status" style="margin-top: 15px;">${badgeHTML}</div>
                ${btnHTML}
            </div>
        `;
    });
}

function filterDoctors() {
    let citySelect = document.getElementById('cityFilter');
    let searchInput = document.getElementById('searchInput');
    if (!citySelect || !searchInput) return;
    let selectedCity = citySelect.value;
    let textQuery = searchInput.value.toLowerCase();
    let filtered = allDoctors.filter(doc => {
        let matchesCity = selectedCity === "" || (doc.address && doc.address.city === selectedCity);
        let matchesText = (doc.name || '').toLowerCase().includes(textQuery) || (doc.specialty || '').toLowerCase().includes(textQuery);
        return matchesCity && matchesText;
    });
    renderDoctors(filtered);
}

// --- 5. حجز المريض ---
function openBookingModal(doctorId, doctorName) {
    modalDoctorId = doctorId;
    modalDoctorName = doctorName || (currentLang === 'ar' ? 'طبيب' : 'Doctor');
    document.getElementById('modalDoctorName').innerText = t('at_doctor') + modalDoctorName;
    document.getElementById('bookingName').value = '';
    document.getElementById('bookingPhone').value = '';
    document.getElementById('bookingModal').classList.remove('hidden');
}

function autofillPhone() {
    let currentInput = document.getElementById('bookingName').value.trim();
    if (patientDirectory[currentInput]) {
        document.getElementById('bookingPhone').value = patientDirectory[currentInput];
    }
}

function closeModal() {
    document.getElementById('bookingModal').classList.add('hidden');
    modalDoctorId = null;
    modalDoctorName = null;
}

async function confirmBooking() {
    let name = document.getElementById('bookingName').value.trim();
    let phone = document.getElementById('bookingPhone').value.trim();
    if (!name || !phone) return alert(currentLang === 'ar' ? "يرجى إدخال الاسم ورقم الهاتف!" : "Please enter name and phone!");
    try {
        const docRef = db.collection("doctors").doc(modalDoctorId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            if (docSnap.data().isOpen === false) return alert(t('closed_temp'));
            let currentTicket = (docSnap.data().lastTicket || 0) + 1;
            await docRef.update({ lastTicket: currentTicket });
            await db.collection("patients").doc(phone).set({
                name: name, phone: phone, lastVisit: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            const bookingRef = await db.collection("bookings").add({
                doctorId: modalDoctorId, 
                doctorName: modalDoctorName, 
                patientName: name, 
                patientPhone: phone,
                ticketNumber: currentTicket, 
                status: 'waiting', 
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            let myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
            myBookings.push({ 
                firebaseId: bookingRef.id, 
                ticket: currentTicket, 
                doctorId: modalDoctorId, 
                doctorName: modalDoctorName, 
                name: name, 
                phone: phone, 
                date: new Date().toISOString() 
            });
            localStorage.setItem('douri_bookings', JSON.stringify(myBookings));
            
            closeModal();
            alert((currentLang === 'ar' ? "تم الحجز بنجاح!\nرقم دورك: " : "Booked successfully!\nYour number: ") + currentTicket);
            updateBanner();
            listenToMyBookings(); 
            showMyBookingsView();
        }
    } catch (error) { console.error(error); alert("Error."); }
}

// --- 6. إدارة الحجوزات ---
function updateBanner() {
    let myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    let banner = document.getElementById('activeBookingBanner');
    let bannerText = document.getElementById('bannerText');
    if (banner && bannerText) {
        if (myBookings.length > 0) { 
            banner.classList.remove('hidden'); 
            bannerText.innerText = t('active_booking_msg').replace('{n}', myBookings.length); 
        } 
        else { banner.classList.add('hidden'); }
    }
}

function showMyBookingsView() {
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('ticket-view').classList.add('hidden');
    document.getElementById('bookings-view').classList.remove('hidden');
    let myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    let list = document.getElementById('myBookingsList');
    list.innerHTML = '';
    if (myBookings.length === 0) return list.innerHTML = `<p style="text-align:center; color:var(--text-muted);">${t('no_bookings')}</p>`;
    
    myBookings.forEach((b, index) => {
        list.innerHTML += `
            <div class="clinic-card" style="border-right: 5px solid var(--primary);">
                <h3 style="margin:0; font-size:16px; color:var(--text-main);">${b.doctorName}</h3>
                <p class="muted" style="margin:5px 0;">${t('your_number')} <b>${b.ticket}</b></p>
                <button class="book-btn" style="padding:8px; font-size:14px;" onclick="openSpecificTicket(${index})"><i class="fa-solid fa-ticket"></i> ${t('view_ticket')}</button>
            </div>`;
    });
}

function listenToMyBookings() {
    myBookingsListeners.forEach(unsubscribe => unsubscribe());
    myBookingsListeners = [];

    let myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    
    myBookings.forEach((b) => {
        if (b.firebaseId) {
            const unsubscribe = db.collection("bookings").doc(b.firebaseId).onSnapshot((doc) => {
                if (doc.exists) {
                    const status = doc.data().status;
                    if (status === 'serving' || status === 'done' || status === 'cancelled') {
                        let currentBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
                        let updated = currentBookings.filter(x => x.firebaseId !== b.firebaseId);
                        localStorage.setItem('douri_bookings', JSON.stringify(updated));
                        
                        updateBanner();
                        if (!document.getElementById('bookings-view').classList.contains('hidden')) {
                            showMyBookingsView();
                        }
                        if (activeTicketToDisplay && activeTicketToDisplay.firebaseId === b.firebaseId && status === 'serving') {
                            alert(currentLang === 'ar' ? "حان دورك الآن! لقد قام الطبيب بندائك." : "It's your turn! The doctor has called you.");
                            goBackToSearch();
                        }
                    }
                }
            });
            myBookingsListeners.push(unsubscribe);
        }
    });
}

function openSpecificTicket(index) {
    let b = JSON.parse(localStorage.getItem('douri_bookings') || '[]')[index];
    activeTicketToDisplay = b;
    document.getElementById('bookings-view').classList.add('hidden');
    document.getElementById('ticket-view').classList.remove('hidden');
    document.getElementById('patientNameDisplay').innerText = b.name;
    document.getElementById('ticketNumber').innerText = b.ticket;
    document.getElementById('doctorNameDisplay').innerText = t('at_doctor') + b.doctorName;

    if ("Notification" in window) {
        if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission();
        }
    }

    if (currentListener) currentListener();
    const docRef = db.collection("doctors").doc(b.doctorId);
    
    let currentNotificationState = "";

    currentListener = docRef.onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            const currentServing = data.currentServing || 1;
            
            let peopleAhead = b.ticket - currentServing - 1;
            if (peopleAhead < 0) peopleAhead = 0;
            
            document.getElementById('peopleAhead').innerText = peopleAhead;
            
            // استخدام الدالة الذكية لحساب الوقت المتوقع
            const smartTime = getSmartETA(data, peopleAhead);
            document.getElementById('etaTime').innerText = smartTime;
            
            // إخفاء "دقيقة انتظار" إذا كان الموعد غداً، لأنها ستكون مربكة
            if(smartTime.includes('غداً') || smartTime.includes('Tmrw')) {
                document.getElementById('waitTime').innerText = "-";
            } else {
                const serviceTime = data.serviceTime || 10;
                document.getElementById('waitTime').innerText = "~" + (peopleAhead * serviceTime);
            }

            let badge = document.querySelector('.status-badge');

            if (peopleAhead === 0 && b.ticket == currentServing) {
                badge.innerText = t('status_your_turn'); 
                badge.style.backgroundColor = "var(--success-light)"; 
                badge.style.color = "var(--success)";
                
                if (currentNotificationState !== 'turn' && Notification.permission === "granted") {
                    new Notification(t('status_your_turn') + " 🎉", { body: t('at_doctor') + b.doctorName });
                    currentNotificationState = 'turn';
                }
            } else if (peopleAhead === 1) {
                badge.innerText = t('status_one_left'); 
                badge.style.backgroundColor = "var(--warning-light)"; 
                badge.style.color = "var(--warning)";
                
                if (currentNotificationState !== 'near' && Notification.permission === "granted") {
                    new Notification(t('status_one_left') + " ⏳", { body: t('at_doctor') + b.doctorName });
                    currentNotificationState = 'near';
                }
            } else {
                badge.innerText = t('status_waiting'); 
                badge.style.backgroundColor = "var(--warning-light)"; 
                badge.style.color = "var(--warning)";
            }
        }
    });
}

function cancelCurrentTicket() {
    if(!activeTicketToDisplay) return;
    if(!confirm(currentLang === 'ar' ? `هل أنت متأكد من إلغاء حجزك؟` : `Are you sure you want to cancel?`)) return;
    
    if(activeTicketToDisplay.firebaseId) {
        db.collection("bookings").doc(activeTicketToDisplay.firebaseId).update({ status: 'cancelled' });
    }

    let myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    let updatedBookings = myBookings.filter(b => !(b.doctorId === activeTicketToDisplay.doctorId && b.ticket === activeTicketToDisplay.ticket));
    localStorage.setItem('douri_bookings', JSON.stringify(updatedBookings));
    
    if (currentListener) currentListener();
    activeTicketToDisplay = null;
    updateBanner(); 
    listenToMyBookings(); 
    showMyBookingsView();
}

function goBackToSearch() {
    document.getElementById('ticket-view').classList.add('hidden');
    document.getElementById('bookings-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('hidden');
    if (currentListener) currentListener(); 
}

// --- 7. بوابة الأطباء ---
function openDoctorModal() {
    document.getElementById('doctorModal').classList.remove('hidden');
    setTimeout(() => {
        if (!doctorMap) initDoctorMap();
        else doctorMap.invalidateSize();
    }, 300);
}

function closeDoctorModal() {
    document.getElementById('doctorModal').classList.add('hidden');
}

function switchAuthTab(tab) {
    if (tab === 'login') {
        document.getElementById('tabLogin').classList.add('active');
        document.getElementById('tabRegister').classList.remove('active');
        document.getElementById('loginSection').classList.remove('hidden');
        document.getElementById('registerSection').classList.add('hidden');
    } else {
        document.getElementById('tabRegister').classList.add('active');
        document.getElementById('tabLogin').classList.remove('active');
        document.getElementById('registerSection').classList.remove('hidden');
        document.getElementById('loginSection').classList.add('hidden');
        setTimeout(() => { if (doctorMap) doctorMap.invalidateSize(); }, 200);
    }
}

function initDoctorMap() {
    let defaultLat = 15.3694;
    let defaultLng = 44.1910;
    doctorMap = L.map('reg-map').setView([defaultLat, defaultLng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(doctorMap);
    doctorMap.on('click', function(e) {
        document.getElementById('docLat').value = e.latlng.lat;
        document.getElementById('docLng').value = e.latlng.lng;
        if (doctorMarker) doctorMarker.setLatLng(e.latlng);
        else doctorMarker = L.marker(e.latlng).addTo(doctorMap);
    });
}

function loginDoctor() {
    let email = document.getElementById('loginEmail').value.trim();
    let password = document.getElementById('loginPassword').value;
    let remember = document.getElementById('rememberMe').checked;
    let btn = document.querySelector('#loginSection .btn-primary'); 

    if (!email || !password) return alert(currentLang === 'ar' ? "يرجى إدخال البريد الإلكتروني وكلمة المرور" : "Please enter email and password");

    let originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${currentLang === 'ar' ? 'جاري الدخول...' : 'Logging in...'}`;
    btn.disabled = true;

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            if (remember) localStorage.setItem('douri_saved_email', email);
            else localStorage.removeItem('douri_saved_email');
            window.location.href = 'admin.html';
        })
        .catch((error) => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            alert((currentLang === 'ar' ? "لم يتم الدخول. السبب:\n" : "Login failed. Reason:\n") + error.message);
        });
}

async function registerAndSaveDoctor() {
    let email = document.getElementById('regEmail').value.trim();
    let password = document.getElementById('regPassword').value;
    let activationCode = document.getElementById('regActivationCode').value.trim(); 
    let name = document.getElementById('docName').value.trim();
    let specialty = document.getElementById('docSpecialty').value.trim();
    let phone = document.getElementById('docPhone').value.trim();
    let city = document.getElementById('docCity').value.trim();
    let street = document.getElementById('docStreet').value.trim();
    let startTime = document.getElementById('docStartTime').value; // قراءة وقت الفتح
    let endTime = document.getElementById('docEndTime').value;     // قراءة وقت الإغلاق
    let lat = document.getElementById('docLat').value;
    let lng = document.getElementById('docLng').value;

    if (!email || !password || !name || !specialty || !city || !activationCode) {
        return alert(currentLang === 'ar' ? "يرجى تعبئة جميع الحقول الأساسية بما فيها كود التفعيل!" : "Please fill all required fields including activation code!");
    }
    
    if (activationCode !== adminSecretCode) {
        return alert(currentLang === 'ar' ? "كود التفعيل غير صحيح! يرجى التواصل مع إدارة التطبيق." : "Invalid activation code! Please contact app administration.");
    }

    if (password.length < 6) return alert(currentLang === 'ar' ? "كلمة المرور يجب أن تكون 6 أحرف على الأقل" : "Password must be at least 6 characters");
    if (!lat || !lng) return alert(currentLang === 'ar' ? "الرجاء تحديد موقع العيادة على الخريطة!" : "Please select clinic location on map!");

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        await db.collection("doctors").add({
            ownerUid: user.uid, 
            email: user.email, 
            name: name,
            specialty: specialty, 
            phone: phone, 
            address: { city: city, street: street },
            location: { lat: Number(lat), lng: Number(lng) },
            serviceTime: 10, 
            startTime: startTime, // حفظ وقت الفتح
            endTime: endTime,     // حفظ وقت الإغلاق
            currentServing: 1, 
            lastTicket: 0, 
            isOpen: true, 
            createdAt: new Date().toISOString()
        });
        alert(currentLang === 'ar' ? "تم إنشاء الحساب وحفظ العيادة بنجاح!" : "Account created and clinic saved successfully!");
        window.location.href = 'admin.html'; 
    } catch (error) {
        console.error("خطأ: ", error);
        alert((currentLang === 'ar' ? "حدث خطأ: " : "Error: ") + error.message);
    }
}

// --- التشغيل عند فتح الصفحة ---
window.onload = function() { 
    if (typeof applyLanguage === 'function') applyLanguage();
    initTheme(); 
    loadDoctors(); 
    loadPatients(); 
    updateBanner(); 
    
    let oldBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    let cleanBookings = oldBookings.filter(b => b.firebaseId); 
    localStorage.setItem('douri_bookings', JSON.stringify(cleanBookings));

    listenToMyBookings(); 

    let savedEmail = localStorage.getItem('douri_saved_email');
    if (savedEmail) {
        let emailInput = document.getElementById('loginEmail');
        let rememberCheckbox = document.getElementById('rememberMe');
        if (emailInput && rememberCheckbox) {
            emailInput.value = savedEmail;
            rememberCheckbox.checked = true;
        }
    }
}
