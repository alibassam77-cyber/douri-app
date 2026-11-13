var firebaseConfig = {
    apiKey: "AIzaSyBupRlote48_0GtaelL_a13uYUfFPhCWbE", authDomain: "douri-app-63918.firebaseapp.com",
    projectId: "douri-app-63918", storageBucket: "douri-app-63918.firebasestorage.app",
    messagingSenderId: "653080780726", appId: "1:653080780726:web:4f2b3421b905e65af9ab17"
};
firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();
var auth = firebase.auth();

var ADMIN_SECRET_CODE = "DOCTOR2024";
var allDoctors = []; 
var activeTicketToDisplay = null;
var modalDoctorId = null;
var modalDoctorName = null;
var modalWorkingDays = []; 
var timerInterval = null;
var doctorMap = null;
var doctorMarker = null;
var extraClinics = []; // مصفوفة لتخزين العيادات الإضافية أثناء التسجيل

// دالة مساعدة لمعرفة اليوم
function getTodayString() {
    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    var dd = String(today.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
}

// دالة لحفظ الصفحة الحالية
function saveViewState(view) {
    localStorage.setItem('douri_view_state', view);
}

// دالة لاستعادة الصفحة الحالية
function restoreViewState() {
    var state = localStorage.getItem('douri_view_state');
    if (state === 'bookings') {
        showMyBookingsView();
    } else if (state === 'main') {
        goBackToSearch();
    }
}

// Theme & Translate (لا تغيير)
function initTheme() {
    var savedTheme = localStorage.getItem('douri_theme');
    var themeBtn = document.getElementById('themeToggle');
    if (!themeBtn) return;
    if (savedTheme === 'dark') { document.documentElement.setAttribute('data-theme', 'dark'); themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>'; }
    else { document.documentElement.removeAttribute('data-theme'); themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>'; }
}
function toggleTheme() {
    var currentTheme = document.documentElement.getAttribute('data-theme');
    var themeBtn = document.getElementById('themeToggle');
    if (currentTheme === 'dark') { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('douri_theme', 'light'); themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>'; }
    else { document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('douri_theme', 'dark'); themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>'; }
}

// getSmartETA (لا تغيير)
function getSmartETA(doctorData, peopleAhead, bookingDateStr) {
    try {
        var serviceTime = Number(doctorData.serviceTime) || 10;
        var people = Number(peopleAhead) || 0;
        var startStr = doctorData.startTime || "09:00";
        var startParts = startStr.split(':');
        var startH = parseInt(startParts[0], 10);
        var startM = parseInt(startParts[1], 10);
        if (isNaN(startH)) startH = 9; if (isNaN(startM)) startM = 0;
        var todayStr = getTodayString();

        if (bookingDateStr === todayStr) {
            var now = new Date();
            var endStr = doctorData.endTime || "17:00";
            var endParts = endStr.split(':');
            var endH = parseInt(endParts[0], 10);
            var endM = parseInt(endParts[1], 10);
            if (isNaN(endH)) endH = 17; if (isNaN(endM)) endM = 0;
            var nowM = now.getHours() * 60 + now.getMinutes();
            var startMins = startH * 60 + startM;
            var endMins = endH * 60 + endM;
            var eta = new Date(now.getTime());
            if (nowM < startMins) { eta.setHours(startH, startM, 0, 0); }
            else if (nowM >= endMins) { eta.setDate(eta.getDate() + 1); eta.setHours(startH, startM, 0, 0); }
            eta.setMinutes(eta.getMinutes() + (people * serviceTime));
            var etaMins = eta.getHours() * 60 + eta.getMinutes();
            if (etaMins >= endMins && people > 0) {
                var overflow = etaMins - endMins;
                eta.setDate(eta.getDate() + 1); eta.setHours(startH, startM, 0, 0); eta.setMinutes(eta.getMinutes() + overflow);
            }
            var hh = eta.getHours(); var mm = eta.getMinutes();
            var timeStr = (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
            if (eta.getDate() !== now.getDate()) { return t('tomorrow') + timeStr; }
            return timeStr;
        } else {
            var totalMins = startMins + (people * serviceTime);
            var hh2 = Math.floor(totalMins / 60); var mm2 = totalMins % 60;
            return bookingDateStr + " | " + (hh2 < 10 ? "0" : "") + hh2 + ":" + (mm2 < 10 ? "0" : "") + mm2;
        }
    } catch (e) { return "---"; }
}

// Load Doctors & Cities
function loadDoctors() {
    var list = document.getElementById('doctorsList');
    var timeout = setTimeout(function() {
        if (list.innerHTML.indexOf('skeleton-card') > -1) {
            list.innerHTML = '<p style="text-align:center; color:red; padding:20px; background:#fee2e2; border-radius:10px;"><b>فشل الاتصال بقاعدة البيانات!</b></p>';
        }
    }, 5000);

    db.collection("doctors").onSnapshot(function(snapshot) {
        clearTimeout(timeout);
        var groupedDoctors = {};
        var cities = {};
        
        snapshot.forEach(function(doc) {
            var data = doc.data();
            var ownerKey = data.ownerUid || data.email || data.name;
            if (!groupedDoctors[ownerKey]) {
                groupedDoctors[ownerKey] = { name: data.name, specialty: data.specialty, clinics: [] };
            }
            groupedDoctors[ownerKey].clinics.push({
                id: doc.id, clinicName: data.clinicName || 'عيادة', address: data.address, location: data.location,
                isOpen: data.isOpen, startTime: data.startTime, endTime: data.endTime, serviceTime: data.serviceTime,
                workingDays: data.workingDays || []
            });
            if (data.address && data.address.city) { cities[data.address.city] = true; }
        });
        
        allDoctors = Object.values(groupedDoctors);
        
        // تعبئة قائمة الـ Datalist
        var datalist = document.getElementById('citiesList');
        if (datalist) {
            datalist.innerHTML = '';
            for (var city in cities) { datalist.innerHTML += '<option value="' + city + '">'; }
        }

        filterDoctors();
        updateBanner();
    }, function(error) {
        clearTimeout(timeout);
        list.innerHTML = '<p style="text-align:center; color:red; padding:20px; background:#fee2e2; border-radius:10px;"><b>خطأ في جلب البيانات</b></p>';
    });
}

// renderDoctors (لا تغيير)
function renderDoctors(doctorsToRender) {
    var list = document.getElementById('doctorsList');
    list.innerHTML = '';
    if (doctorsToRender.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--text-muted); margin-top:20px;">' + t('no_results') + '</p>';
        return;
    }
    
    for (var i = 0; i < doctorsToRender.length; i++) {
        var docGroup = doctorsToRender[i];
        var clinics = docGroup.clinics;
        
        if (clinics.length === 1) {
            var doc = clinics[0];
            var isClosed = doc.isOpen === false;
            var badgeHTML = isClosed ? '<span class="badge red">' + t('closed_temp') + '</span>' : '<span class="badge green">' + t('available') + '</span>';
            var btnHTML = isClosed ? '<button class="book-btn" style="background-color:var(--text-muted);" disabled>' + t('on_break') + '</button>' : '<button class="book-btn" onclick="openBookingModal(\'' + doc.id + '\', \'' + docGroup.name + '\', \'' + doc.clinicName + '\')">' + t('book_now') + '</button>';
            var landmarkText = (doc.address && doc.address.landmark) ? ' (' + doc.address.landmark + ')' : '';
            var addressText = doc.address ? doc.address.city + ' - ' + (doc.address.street || '') + landmarkText : '';
            var start = doc.startTime || '09:00'; var end = doc.endTime || '17:00';
            var mapBtnHTML = '';
            if (doc.location && doc.location.lat && doc.location.lng) {
                var mapLink = 'https://www.google.com/maps/search/?api=1&query=' + doc.location.lat + ',' + doc.location.lng;
                mapBtnHTML = '<a href="' + mapLink + '" target="_blank" class="map-btn"><i class="fa-solid fa-map-location-dot"></i> ' + t('view_map') + '</a>';
            }
            list.innerHTML += '<div class="clinic-card" style="' + (isClosed ? 'opacity: 0.7;' : '') + '">' +
                '<div class="clinic-info"><h2>' + docGroup.name + '</h2>' +
                '<p class="doc-specialty" style="color:var(--warning);">🏥 ' + doc.clinicName + '</p>' +
                '<p class="doc-specialty">' + docGroup.specialty + '</p>' +
                '<p class="doc-address">📍 ' + addressText + '</p>' +
                '<p class="doc-address" style="font-size: 12px; color: var(--primary);">🕒 ' + t('hours_label') + ' ' + start + ' - ' + end + '</p>' + mapBtnHTML + '</div>' +
                '<div class="clinic-status" style="margin-top: 15px;">' + badgeHTML + '</div>' + btnHTML + '</div>';
        } else {
            list.innerHTML += '<div class="clinic-card">' +
                '<div class="clinic-info"><h2>' + docGroup.name + '</h2><p class="doc-specialty">' + docGroup.specialty + '</p>' +
                '<p class="doc-address" style="color: var(--success); font-weight:bold;">يعمل في ' + clinics.length + ' أماكن مختلفة</p></div>' +
                '<button class="book-btn" style="margin-top:15px;" onclick="openClinicSelectionModal(\'' + encodeURIComponent(JSON.stringify({name: docGroup.name, clinics: clinics})) + '\')">' + t('choose_clinic_btn') + '</button>' +
                '</div>';
        }
    }
}

// Filter Doctors (تحديث للبحث بالمدينة النصي)
function filterDoctors() {
    var cityFilter = document.getElementById('cityFilter');
    var searchInput = document.getElementById('searchInput');
    if (!cityFilter || !searchInput) return;
    var selectedCity = cityFilter.value.trim().toLowerCase();
    var textQuery = searchInput.value.toLowerCase();
    var filtered = [];
    
    for (var i = 0; i < allDoctors.length; i++) {
        var docGroup = allDoctors[i];
        var matchesNameOrSpecialty = (docGroup.name || '').toLowerCase().indexOf(textQuery) > -1 || (docGroup.specialty || '').toLowerCase().indexOf(textQuery) > -1;
        
        if (matchesNameOrSpecialty) {
            if (selectedCity === "") {
                filtered.push(docGroup);
            } else {
                var hasCity = false;
                for (var j = 0; j < docGroup.clinics.length; j++) {
                    if (docGroup.clinics[j].address && docGroup.clinics[j].address.city && docGroup.clinics[j].address.city.toLowerCase().indexOf(selectedCity) > -1) {
                        hasCity = true; break;
                    }
                }
                if (hasCity) filtered.push(docGroup);
            }
        }
    }
    renderDoctors(filtered);
}

// Clinic Selection Modal (لا تغيير)
function openClinicSelectionModal(encodedData) {
    var data = JSON.parse(decodeURIComponent(encodedData));
    var listDiv = document.getElementById('clinicSelectionList');
    listDiv.innerHTML = '';
    for (var i = 0; i < data.clinics.length; i++) {
        var c = data.clinics[i];
        var addressText = c.address ? c.address.city + ' - ' + (c.address.street || '') : '';
        var statusText = c.isOpen ? t('available') : t('closed_temp');
        var color = c.isOpen ? 'var(--success)' : 'var(--danger)';
        listDiv.innerHTML += '<div style="border: 1px solid var(--border-color); padding: 10px; border-radius: 8px; margin-bottom: 10px;">' +
            '<h4 style="margin: 0 0 5px 0; color: var(--primary);">' + c.clinicName + '</h4>' +
            '<p style="margin: 0 0 5px 0; font-size: 13px;">📍 ' + addressText + '</p>' +
            '<p style="margin: 0 0 10px 0; font-size: 13px; color: ' + color + ';">الحالة: ' + statusText + ' | 🕒 ' + c.startTime + ' - ' + c.endTime + '</p>' +
            '<button class="btn-primary" style="padding: 8px;" onclick="selectClinicToBook(\'' + c.id + '\', \'' + data.name + '\', \'' + c.clinicName + '\')">' + t('book_now') + '</button>' +
            '</div>';
    }
    document.getElementById('clinicSelectionModal').classList.remove('hidden');
}

// Booking, Bookings View, Ticket View, Cancel, Listen, Login (لا تغيير جوهري)
function selectClinicToBook(clinicId, doctorName, clinicName) {
    closeClinicSelectionModal();
    openBookingModal(clinicId, doctorName, clinicName);
}

function closeClinicSelectionModal() { document.getElementById('clinicSelectionModal').classList.add('hidden'); }

function openBookingModal(doctorId, doctorName, clinicName) {
    modalDoctorId = doctorId; modalDoctorName = doctorName;
    modalWorkingDays = [];
    for (var i = 0; i < allDoctors.length; i++) {
        for (var j = 0; j < allDoctors[i].clinics.length; j++) {
            if (allDoctors[i].clinics[j].id === doctorId) { modalWorkingDays = allDoctors[i].clinics[j].workingDays || []; break; }
        }
    }
    document.getElementById('modalDoctorName').innerText = t('at_doctor') + doctorName + ' (' + clinicName + ')';
    document.getElementById('bookingName').value = '';
    document.getElementById('bookingPhone').value = '';
    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    var dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('bookingDate').value = yyyy + '-' + mm + '-' + dd;
    document.getElementById('bookingModal').classList.remove('hidden');
}

function closeModal() { document.getElementById('bookingModal').classList.add('hidden'); modalDoctorId = null; modalDoctorName = null; }

function confirmBooking() {
    var name = document.getElementById('bookingName').value.trim();
    var phone = document.getElementById('bookingPhone').value.trim();
    var bookingDate = document.getElementById('bookingDate').value;
    if (!name || !phone || !bookingDate) return alert("يرجى إدخال البيانات والتاريخ!");
    var selectedDay = new Date(bookingDate).getDay();
    var isWorkingDay = false;
    if (modalWorkingDays.length === 0) { isWorkingDay = true; } 
    else { for (var i = 0; i < modalWorkingDays.length; i++) { if (Number(modalWorkingDays[i]) === selectedDay) { isWorkingDay = true; break; } } }
    if (!isWorkingDay) return alert(t('invalid_working_day'));
    
    var dayDocId = modalDoctorId + "_" + bookingDate;
    var docDayRef = db.collection("doctor_days").doc(dayDocId);
    
    docDayRef.get().then(function(daySnap) {
        var lastTicket = 1;
        if (daySnap.exists) { lastTicket = (daySnap.data().lastTicket || 0) + 1; }
        docDayRef.set({ doctorId: modalDoctorId, date: bookingDate, lastTicket: lastTicket, currentServing: daySnap.exists ? (daySnap.data().currentServing || 1) : 1 }, { merge: true }).then(function() {
            db.collection("bookings").add({ doctorId: modalDoctorId, doctorName: modalDoctorName, patientName: name, patientPhone: phone, bookingDate: bookingDate, ticketNumber: lastTicket, status: 'waiting', createdAt: firebase.firestore.FieldValue.serverTimestamp() }).then(function(bookingRef) {
                var myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
                myBookings.push({ firebaseId: bookingRef.id, ticket: lastTicket, doctorId: modalDoctorId, doctorName: modalDoctorName, name: name, phone: phone, bookingDate: bookingDate, status: 'waiting', date: new Date().toISOString() });
                localStorage.setItem('douri_bookings', JSON.stringify(myBookings));
                closeModal(); alert("تم الحجز! رقم دورك: " + lastTicket);
                updateBanner(); listenToMyBookings(); showMyBookingsView();
            });
        });
    });
}

function updateBanner() {
    var myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    var active = [];
    for (var i = 0; i < myBookings.length; i++) { if (myBookings[i].status === 'waiting' || myBookings[i].status === 'serving') active.push(myBookings[i]); }
    var banner = document.getElementById('activeBookingBanner'); var bannerText = document.getElementById('bannerText');
    if (banner && bannerText) { if (active.length > 0) { banner.classList.remove('hidden'); bannerText.innerText = t('active_booking_msg').replace('{n}', active.length); } else { banner.classList.add('hidden'); } }
}

function showMyBookingsView() {
    saveViewState('bookings');
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('ticket-view').classList.add('hidden');
    document.getElementById('bookings-view').classList.remove('hidden');
    var myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    var active = [];
    for (var i = 0; i < myBookings.length; i++) { if (myBookings[i].status === 'waiting' || myBookings[i].status === 'serving') active.push(myBookings[i]); }
    var list = document.getElementById('myBookingsList'); list.innerHTML = '';
    if (active.length === 0) { list.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + t('no_bookings') + '</p>'; return; }
    for (var j = 0; j < active.length; j++) {
        var b = active[j];
        list.innerHTML += '<div class="clinic-card" style="border-right: 5px solid var(--primary);"><h3 style="margin:0; font-size:16px;">' + b.doctorName + '</h3><p class="muted" style="margin:5px 0;">' + t('appointment_date') + ' <b style="color:var(--primary);">' + b.bookingDate + '</b></p><p class="muted" style="margin:5px 0;">' + t('your_number') + ' <b>' + b.ticket + '</b></p><button class="book-btn" style="padding:8px; font-size:14px;" onclick="openSpecificTicket(\'' + b.firebaseId + '\')">' + t('view_ticket') + '</button></div>';
    }
}

function openSpecificTicket(id) {
    var bookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    var b = null;
    for (var i = 0; i < bookings.length; i++) { if (bookings[i].firebaseId === id) b = bookings[i]; }
    if (!b) return;
    activeTicketToDisplay = b;
    document.getElementById('main-view').classList.add('hidden'); document.getElementById('bookings-view').classList.add('hidden'); document.getElementById('ticket-view').classList.remove('hidden');
    document.getElementById('patientNameDisplay').innerText = b.name; document.getElementById('ticketNumber').innerText = b.ticket; document.getElementById('doctorNameDisplay').innerText = t('at_doctor') + b.doctorName; document.getElementById('appointmentDateDisplay').innerText = t('appointment_date') + ' ' + b.bookingDate;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(function() {
        var currentBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
        var currentB = null;
        for (var k = 0; k < currentBookings.length; k++) { if (currentBookings[k].firebaseId === id) currentB = currentBookings[k]; }
        if (!currentB || currentB.status === 'cancelled') { clearInterval(timerInterval); alert("تم إلغاء الحجز."); goBackToSearch(); return; }
        var dayDocId = b.doctorId + "_" + b.bookingDate;
        db.collection("doctor_days").doc(dayDocId).get().then(function(daySnap) {
            if (daySnap.exists) {
                var dayData = daySnap.data();
                db.collection("doctors").doc(b.doctorId).get().then(function(docSnap) {
                    if (docSnap.exists) {
                        var docData = docSnap.data();
                        var peopleAhead = b.ticket - dayData.currentServing - 1; if (peopleAhead < 0) peopleAhead = 0;
                        document.getElementById('peopleAhead').innerText = peopleAhead;
                        document.getElementById('etaTime').innerText = getSmartETA(docData, peopleAhead, b.bookingDate);
                        document.getElementById('waitTime').innerText = "~" + (peopleAhead * docData.serviceTime);
                        var badge = document.getElementById('ticketStatus');
                        if (peopleAhead === 0 && b.ticket == dayData.currentServing) { badge.innerText = t('status_your_turn'); badge.style.backgroundColor = "var(--success-light)"; badge.style.color = "var(--success)"; }
                        else if (peopleAhead === 1) { badge.innerText = t('status_one_left'); badge.style.backgroundColor = "var(--warning-light)"; badge.style.color = "var(--warning)"; }
                        else { badge.innerText = t('status_waiting'); badge.style.backgroundColor = "var(--warning-light)"; badge.style.color = "var(--warning)"; }
                    }
                });
            }
        });
    }, 3000);
}

function cancelCurrentTicket() {
    if(!activeTicketToDisplay) return; if(!confirm("إلغاء الحجز؟")) return;
    db.collection("bookings").doc(activeTicketToDisplay.firebaseId).update({ status: 'cancelled' });
    var myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]'); var updated = [];
    for (var i = 0; i < myBookings.length; i++) { if (myBookings[i].firebaseId === activeTicketToDisplay.firebaseId) myBookings[i].status = 'cancelled'; updated.push(myBookings[i]); }
    localStorage.setItem('douri_bookings', JSON.stringify(updated));
    if (timerInterval) clearInterval(timerInterval); activeTicketToDisplay = null; updateBanner(); showMyBookingsView();
}

function goBackToSearch() {
    saveViewState('main');
    if (timerInterval) clearInterval(timerInterval);
    document.getElementById('ticket-view').classList.add('hidden'); document.getElementById('bookings-view').classList.add('hidden'); document.getElementById('main-view').classList.remove('hidden');
}

function listenToMyBookings() {
    var myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    for (var i = 0; i < myBookings.length; i++) {
        var b = myBookings[i];
        if (b.firebaseId && b.status !== 'done' && b.status !== 'cancelled') {
            (function(booking) {
                db.collection("bookings").doc(booking.firebaseId).onSnapshot(function(doc) {
                    if (doc.exists) {
                        var status = doc.data().status;
                        if (status === 'serving' || status === 'done' || status === 'cancelled') {
                            var current = JSON.parse(localStorage.getItem('douri_bookings') || '[]'); var upd = [];
                            for (var j = 0; j < current.length; j++) { if (current[j].firebaseId === booking.firebaseId) current[j].status = status; upd.push(current[j]); }
                            localStorage.setItem('douri_bookings', JSON.stringify(upd)); updateBanner();
                            if (!document.getElementById('bookings-view').classList.contains('hidden')) showMyBookingsView();
                            if (activeTicketToDisplay && activeTicketToDisplay.firebaseId === booking.firebaseId && status === 'serving') { alert("حان دورك الآن!"); goBackToSearch(); }
                        }
                    }
                });
            })(b);
        }
    }
}

// --- Doctor Registration with Multiple Clinics ---
function openDoctorModal() { document.getElementById('doctorModal').classList.remove('hidden'); }
function closeDoctorModal() { document.getElementById('doctorModal').classList.add('hidden'); }

function switchAuthTab(tab) {
    if (tab === 'login') { document.getElementById('tabLogin').classList.add('active'); document.getElementById('tabRegister').classList.remove('active'); document.getElementById('loginSection').classList.remove('hidden'); document.getElementById('registerSection').classList.add('hidden'); }
    else { document.getElementById('tabRegister').classList.add('active'); document.getElementById('tabLogin').classList.remove('active'); document.getElementById('registerSection').classList.remove('hidden'); document.getElementById('loginSection').classList.add('hidden'); setTimeout(initDoctorMap, 300); }
}

function initDoctorMap() {
    if (!document.getElementById('reg-map')) return;
    if (doctorMap) { doctorMap.invalidateSize(); return; }
    var defaultLat = 15.3694; var defaultLng = 44.1910;
    doctorMap = L.map('reg-map').setView([defaultLat, defaultLng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(doctorMap);
    doctorMap.on('click', function(e) {
        document.getElementById('docLat').value = e.latlng.lat; document.getElementById('docLng').value = e.latlng.lng;
        if (doctorMarker) doctorMarker.setLatLng(e.latlng); else doctorMarker = L.marker(e.latlng).addTo(doctorMap);
    });
}

function loginDoctor() {
    var email = document.getElementById('loginEmail').value.trim(); var password = document.getElementById('loginPassword').value;
    if (!email || !password) return alert("أدخل البيانات");
    auth.signInWithEmailAndPassword(email, password).then(function() { window.location.href = 'admin.html'; }).catch(function(e) { alert("Error: " + e.message); });
}

function collectClinicData() {
    var clinicName = document.getElementById('docClinicName').value.trim();
    var city = document.getElementById('docCity').value.trim();
    var street = document.getElementById('docStreet').value.trim();
    var landmark = document.getElementById('docLandmark').value.trim();
    var startTime = document.getElementById('docStartTime').value;
    var endTime = document.getElementById('docEndTime').value;
    var serviceTime = document.getElementById('docServiceTime').value;
    var lat = document.getElementById('docLat').value;
    var lng = document.getElementById('docLng').value;
    var workingDays = [];
    for (var i = 0; i <= 6; i++) { var cb = document.getElementById('day_' + i); if (cb && cb.checked) workingDays.push(i); }

    if (!clinicName || !city || !lat || !lng) return null;
    if (workingDays.length === 0) return null;

    return { clinicName: clinicName, address: { city: city, street: street, landmark: landmark }, location: { lat: Number(lat), lng: Number(lng) }, serviceTime: Number(serviceTime), startTime: startTime, endTime: endTime, workingDays: workingDays };
}

function addAnotherClinicField() {
    var data = collectClinicData();
    if (!data) return alert("الرجاء تعبئة بيانات العيادة الحالية وتحديد الموقع وأيام العمل أولاً قبل إضافة عيادة جديدة.");
    extraClinics.push(data);
    alert("تم حفظ العيادة في القائمة، يمكنك الآن تعبئة بيانات العيادة الجديدة.");
    
    // مسح الحقول لإضافة عيادة جديدة
    document.getElementById('docClinicName').value = '';
    document.getElementById('docCity').value = '';
    document.getElementById('docStreet').value = '';
    document.getElementById('docLandmark').value = '';
    document.getElementById('docLat').value = '';
    document.getElementById('docLng').value = '';
    if (doctorMarker) { doctorMap.removeLayer(doctorMarker); doctorMarker = null; }
    for (var i = 0; i <= 6; i++) { var cb = document.getElementById('day_' + i); if (cb) cb.checked = false; }
}

function registerAndSaveDoctor() {
    var email = document.getElementById('regEmail').value.trim(); var password = document.getElementById('regPassword').value;
    var activationCode = document.getElementById('regActivationCode').value.trim();
    var name = document.getElementById('docName').value.trim(); var specialty = document.getElementById('docSpecialty').value.trim(); var phone = document.getElementById('docPhone').value.trim();
    
    var currentClinicData = collectClinicData();
    if (!currentClinicData && extraClinics.length === 0) return alert("أكمل بيانات العيادة وحدد الموقع!");
    if (currentClinicData) extraClinics.push(currentClinicData);
    
    if (!email || !password || !name || !specialty || !activationCode) return alert("أكمل البيانات الأساسية!");
    if (activationCode !== ADMIN_SECRET_CODE) return alert(t('invalid_code'));
    if (password.length < 6) return alert("كلمة المرور قصيرة");

    auth.createUserWithEmailAndPassword(email, password).then(function(userCredential) {
        var user = userCredential.user;
        var promises = [];
        
        for (var i = 0; i < extraClinics.length; i++) {
            var c = extraClinics[i];
            var p = db.collection("doctors").add({ 
                ownerUid: user.uid, email: user.email, name: name, specialty: specialty, phone: phone, 
                clinicName: c.clinicName, address: c.address, location: c.location,
                serviceTime: c.serviceTime, startTime: c.startTime, endTime: c.endTime, workingDays: c.workingDays,
                createdAt: new Date().toISOString() 
            });
            promises.push(p);
        }
        
        Promise.all(promises).then(function() {
            alert("تم حفظ الحساب وجميع العيادات بنجاح!"); 
            window.location.href = 'admin.html';
        });
    }).catch(function(error) { alert("Error: " + error.message); });
}

window.onload = function() {
    applyLanguage(); initTheme(); loadDoctors(); listenToMyBookings(); updateBanner(); restoreViewState();
};
