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

let allDoctors = []; 
let patientDirectory = {}; 
let currentListener = null; 
let activeTicketToDisplay = null;
let modalDoctorId = null;
let modalDoctorName = null;
let doctorMap = null;
let doctorMarker = null;

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

// --- 2. تحميل البيانات (أطباء ومرضى) ---
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
            citySelect.innerHTML = '<option value="">كل المدن</option>';
            cities.forEach(city => {
                citySelect.innerHTML += `<option value="${city}">${city}</option>`;
            });
            if (currentSelection) citySelect.value = currentSelection;
        }
        filterDoctors();
        updateBanner();
    });
}

// --- 3. عرض الأطباء والفلترة ---
function renderDoctors(doctorsToRender) {
    const list = document.getElementById('doctorsList');
    if (!list) return;
    list.innerHTML = '';
    if (doctorsToRender.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--text-muted); margin-top:20px;">لا يوجد أطباء يطابقون بحثك.</p>';
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
            ? `<span class="badge red" style="background:var(--danger-light); color:var(--danger);"><i class="fa-solid fa-lock"></i> مغلق مؤقتاً</span>` 
            : `<span class="badge green">متاح للحجز</span>`;
        let btnHTML = isClosed
            ? `<button class="book-btn" style="background-color:var(--text-muted); cursor:not-allowed;" disabled><i class="fa-solid fa-ban"></i> الطبيب في استراحة</button>`
            : `<button class="book-btn" onclick="openBookingModal('${doc.id}', '${doc.name}')"><i class="fa-solid fa-calendar-check"></i> احجز الآن</button>`;

        list.innerHTML += `
            <div class="clinic-card" style="${isClosed ? 'opacity: 0.7;' : ''}">
                <div class="clinic-info">
                    <h2>${doc.name}</h2>
                    <p class="doc-specialty">${doc.specialty}</p>
                    <p class="doc-address"><i class="fa-solid fa-location-dot"></i> ${addressText}</p>
                    <a href="${mapLink}" target="_blank" class="map-btn"><i class="fa-solid fa-map-location-dot"></i> موقع العيادة</a>
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
        let matchesText = doc.name.toLowerCase().includes(textQuery) || doc.specialty.toLowerCase().includes(textQuery);
        return matchesCity && matchesText;
    });
    renderDoctors(filtered);
}

// --- 4. نافذة حجز المريض ---
function openBookingModal(doctorId, doctorName) {
    modalDoctorId = doctorId;
    modalDoctorName = doctorName;
    document.getElementById('modalDoctorName').innerText = "عند: " + doctorName;
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
    if (!name || !phone) return alert("يرجى إدخال الاسم ورقم الهاتف!");
    try {
        const docRef = db.collection("doctors").doc(modalDoctorId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            if (docSnap.data().isOpen === false) return alert("عذراً، العيادة مغلقة مؤقتاً.");
            let currentTicket = (docSnap.data().lastTicket || 0) + 1;
            await docRef.update({ lastTicket: currentTicket });
            await db.collection("patients").doc(phone).set({
                name: name, phone: phone, lastVisit: firebase.firestore.FieldValue.serverTimestamp()
            });
            await db.collection("bookings").add({
                doctorId: modalDoctorId, doctorName: modalDoctorName, patientName: name, patientPhone: phone,
                ticketNumber: currentTicket, status: 'waiting', createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            let myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
            myBookings.push({ ticket: currentTicket, doctorId: modalDoctorId, doctorName: modalDoctorName, name: name, phone: phone, date: new Date().toISOString() });
            localStorage.setItem('douri_bookings', JSON.stringify(myBookings));
            closeModal();
            alert("تم الحجز بنجاح!\nرقم دورك: " + currentTicket);
            updateBanner();
            showMyBookingsView();
        }
    } catch (error) { console.error(error); alert("حدث خطأ."); }
}

// --- 5. إدارة الحجوزات (العرض والإلغاء) ---
function updateBanner() {
    let myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    let banner = document.getElementById('activeBookingBanner');
    let bannerText = document.getElementById('bannerText');
    if (banner && bannerText) {
        if (myBookings.length > 0) { banner.classList.remove('hidden'); bannerText.innerText = `لديك ${myBookings.length} حجز نشط! اضغط هنا لعرضها`; } 
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
    if (myBookings.length === 0) return list.innerHTML = '<p style="text-align:center; color:var(--text-muted);">لا يوجد لديك حجوزات حالياً.</p>';
    myBookings.forEach((b, index) => {
        list.innerHTML += `
            <div class="clinic-card" style="border-right: 5px solid var(--primary);">
                <h3 style="margin:0; font-size:16px; color:var(--text-main);">${b.doctorName}</h3>
                <p class="muted" style="margin:5px 0;">رقم دورك: <b>${b.ticket}</b></p>
                <button class="book-btn" style="padding:8px; font-size:14px;" onclick="openSpecificTicket(${index})"><i class="fa-solid fa-ticket"></i> عرض التذكرة</button>
            </div>`;
    });
}

// --- 6. عرض التذكرة ومتابعة الطابور + الإشعارات ---
function openSpecificTicket(index) {
    let b = JSON.parse(localStorage.getItem('douri_bookings') || '[]')[index];
    activeTicketToDisplay = b;
    document.getElementById('bookings-view').classList.add('hidden');
    document.getElementById('ticket-view').classList.remove('hidden');
    document.getElementById('patientNameDisplay').innerText = b.name;
    document.getElementById('ticketNumber').innerText = b.ticket;
    document.getElementById('doctorNameDisplay').innerText = "عند: " + b.doctorName;

    // طلب إذن الإشعارات من المريض
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
            const serviceTime = data.serviceTime || 10;
            
            let peopleAhead = b.ticket - currentServing - 1;
            if (peopleAhead < 0) peopleAhead = 0;
            
            let waitTime = peopleAhead * serviceTime;
            
            document.getElementById('peopleAhead').innerText = peopleAhead;
            document.getElementById('waitTime').innerText = "~" + waitTime;
            
            let now = new Date(); now.setMinutes(now.getMinutes() + waitTime);
            document.getElementById('etaTime').innerText = String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');

            let badge = document.querySelector('.status-badge');

            // تحديث الحالة وإرسال الإشعارات
            if (peopleAhead === 0 && b.ticket == currentServing) {
                badge.innerText = "حان دورك الآن!"; 
                badge.style.backgroundColor = "var(--success-light)"; 
                badge.style.color = "var(--success)";
                
                if (currentNotificationState !== 'turn' && Notification.permission === "granted") {
                    new Notification("حان دورك الآن! 🎉", { body: "توجه إلى غرفة الطبيب " + b.doctorName });
                    currentNotificationState = 'turn';
                }
            } else if (peopleAhead === 1) {
                badge.innerText = "بقي مريض واحد"; 
                badge.style.backgroundColor = "var(--warning-light)"; 
                badge.style.color = "var(--warning)";
                
                if (currentNotificationState !== 'near' && Notification.permission === "granted") {
                    new Notification("اقترب دورك ⏳", { body: "بقي مريض واحد قبلك عند " + b.doctorName + ". يفضل التوجه الآن." });
                    currentNotificationState = 'near';
                }
            } else {
                badge.innerText = "في الانتظار"; 
                badge.style.backgroundColor = "var(--warning-light)"; 
                badge.style.color = "var(--warning)";
            }
        }
    });
}

function cancelCurrentTicket() {
    if(!activeTicketToDisplay) return;
    if(!confirm(`هل أنت متأكد من إلغاء حجزك عند ${activeTicketToDisplay.doctorName}؟`)) return;
    let myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    let updatedBookings = myBookings.filter(b => !(b.doctorId === activeTicketToDisplay.doctorId && b.ticket === activeTicketToDisplay.ticket));
    localStorage.setItem('douri_bookings', JSON.stringify(updatedBookings));
    if (currentListener) currentListener();
    activeTicketToDisplay = null;
    updateBanner(); showMyBookingsView();
}

function goBackToSearch() {
    document.getElementById('ticket-view').classList.add('hidden');
    document.getElementById('bookings-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('hidden');
    if (currentListener) currentListener(); 
}

// --- 7. نافذة الأطباء (الدخول والتسجيل) ---
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

// 8. دالة تسجيل دخول الطبيب
function loginDoctor() {
    let email = document.getElementById('loginEmail').value.trim();
    let password = document.getElementById('loginPassword').value;
    let remember = document.getElementById('rememberMe').checked;
    let btn = document.querySelector('#loginSection .btn-primary'); 

    if (!email || !password) return alert("يرجى إدخال البريد الإلكتروني وكلمة المرور");

    let originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الدخول...';
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
            alert("لم يتم الدخول. السبب:\n" + error.message);
        });
}

// 9. دالة إنشاء حساب طبيب جديد وحفظ العيادة
async function registerAndSaveDoctor() {
    let email = document.getElementById('regEmail').value.trim();
    let password = document.getElementById('regPassword').value;
    let name = document.getElementById('docName').value.trim();
    let specialty = document.getElementById('docSpecialty').value.trim();
    let phone = document.getElementById('docPhone').value.trim();
    let city = document.getElementById('docCity').value.trim();
    let street = document.getElementById('docStreet').value.trim();
    let lat = document.getElementById('docLat').value;
    let lng = document.getElementById('docLng').value;

    if (!email || !password || !name || !specialty || !city) {
        return alert("يرجى تعبئة جميع الحقول الأساسية (الإيميل، كلمة المرور، الاسم، التخصص، المدينة)!");
    }
    if (password.length < 6) return alert("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    if (!lat || !lng) return alert("الرجاء تحديد موقع العيادة على الخريطة!");

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        await db.collection("doctors").add({
            ownerUid: user.uid, email: user.email, name: name,
            specialty: specialty, phone: phone, address: { city: city, street: street },
            location: { lat: Number(lat), lng: Number(lng) },
            serviceTime: 10, currentServing: 1, lastTicket: 0, isOpen: true, createdAt: new Date().toISOString()
        });
        alert("تم إنشاء الحساب وحفظ العيادة بنجاح!");
        window.location.href = 'admin.html'; 
    } catch (error) {
        console.error("خطأ: ", error);
        alert("حدث خطأ: " + error.message);
    }
}

// --- التشغيل عند فتح الصفحة ---
window.onload = function() { 
    initTheme(); 
    loadDoctors(); 
    loadPatients(); 
    updateBanner(); 
    
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
