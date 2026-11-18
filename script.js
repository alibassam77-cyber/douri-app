var firebaseConfig = {
    apiKey: "AIzaSyBupRlote48_0GtaelL_a13uYUfFPhCWbE", authDomain: "douri-app-63918.firebaseapp.com",
    projectId: "douri-app-63918", storageBucket: "douri-app-63918.firebasestorage.app",
    messagingSenderId: "653080780726", appId: "1:653080780726:web:4f2b3421b905e65af9ab17"
};
firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();
var auth = firebase.auth();
var functions = firebase.app().functions('us-central1');
var bookingPollGeneration = 0;

var allDoctors = []; 
var activeTicketToDisplay = null;
var modalDoctorId = null;
var modalDoctorName = null;
var modalWorkingDays = []; 
var timerInterval = null;
var doctorMap = null;
var doctorMarker = null;
var extraClinics = []; 

function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
}
function safeJsArg(value) { return escapeHTML(JSON.stringify(String(value == null ? '' : value))); }
function getTodayString() {
    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    var dd = String(today.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
}

function saveViewState(view) {
    localStorage.setItem('douri_view_state', view);
}

function restoreViewState() {
    var state = localStorage.getItem('douri_view_state');
    if (state === 'bookings') {
        showMyBookingsView();
    } else if (state === 'main') {
        goBackToSearch();
    }
}

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

function getSmartETA(doctorData, peopleAhead, bookingDateStr) {
    try {
        var serviceTime = Math.max(1, Number(doctorData.serviceTime) || 10);
        var people = Math.max(0, Number(peopleAhead) || 0);
        var startParts = String(doctorData.startTime || '09:00').split(':');
        var endParts = String(doctorData.endTime || '17:00').split(':');
        var startMinutes = (Number(startParts[0]) || 9) * 60 + (Number(startParts[1]) || 0);
        var endMinutes = (Number(endParts[0]) || 17) * 60 + (Number(endParts[1]) || 0);
        var now = new Date();
        var target = new Date(bookingDateStr + 'T00:00:00');
        var total;
        if (bookingDateStr === getTodayString()) {
            var nowMinutes = now.getHours() * 60 + now.getMinutes();
            if (nowMinutes >= endMinutes) {
                target.setDate(target.getDate() + 1);
                total = startMinutes + people * serviceTime;
            } else {
                total = Math.max(nowMinutes, startMinutes) + people * serviceTime;
                if (total >= endMinutes && endMinutes > startMinutes) {
                    target.setDate(target.getDate() + 1);
                    total = startMinutes + (total - endMinutes);
                }
            }
        } else {
            total = startMinutes + people * serviceTime;
        }
        target.setHours(Math.floor(total / 60), total % 60, 0, 0);
        var hh = String(target.getHours()).padStart(2, '0');
        var mm = String(target.getMinutes()).padStart(2, '0');
        return target.toDateString() !== now.toDateString() && bookingDateStr === getTodayString()
            ? t('tomorrow') + hh + ':' + mm
            : (bookingDateStr === getTodayString() ? hh + ':' + mm : bookingDateStr + ' | ' + hh + ':' + mm);
    } catch (e) { return '---'; }
}

function loadDoctors() {
    var list = document.getElementById('doctorsList');
    var timeout = setTimeout(function() {
        if (list && list.innerHTML.indexOf('skeleton-card') > -1) {
            list.innerHTML = '<p style="text-align:center; color:red; padding:20px; background:#fee2e2; border-radius:10px;"><b>فشل الاتصال بقاعدة البيانات!</b></p>';
        }
    }, 10000);
    functions.httpsCallable('listPublicDoctors')({}).then(function(response) {
        clearTimeout(timeout);
        var groupedDoctors = {}, cities = {};
        (response.data || []).forEach(function(data) {
            var ownerKey = data.groupKey || data.name;
            if (!groupedDoctors[ownerKey]) groupedDoctors[ownerKey] = { name: data.name, specialty: data.specialty, clinics: [] };
            groupedDoctors[ownerKey].clinics.push({
                id: data.id, clinicName: data.clinicName || 'عيادة', address: data.address, location: data.location,
                isOpen: data.isOpen, startTime: data.startTime, endTime: data.endTime,
                serviceTime: data.serviceTime, workingDays: data.workingDays || []
            });
            if (data.address && data.address.city) cities[data.address.city] = true;
        });
        allDoctors = Object.values(groupedDoctors);
        var datalist = document.getElementById('citiesList');
        if (datalist) {
            datalist.innerHTML = '';
            Object.keys(cities).forEach(function(city) { datalist.innerHTML += '<option value="' + escapeHTML(city) + '">'; });
        }
        filterDoctors(); updateBanner();
    }).catch(function(error) {
        clearTimeout(timeout); console.error(error);
        if (list) list.innerHTML = '<p style="text-align:center; color:red; padding:20px; background:#fee2e2; border-radius:10px;"><b>تعذر جلب بيانات العيادات. حاول تحديث الصفحة.</b></p>';
    });
}

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
            var btnHTML = isClosed ? '<button class="book-btn" style="background-color:var(--text-muted);" disabled>' + t('on_break') + '</button>' : '<button class="book-btn" onclick="openBookingModal(' + safeJsArg(doc.id) + ', ' + safeJsArg(docGroup.name) + ', ' + safeJsArg(doc.clinicName) + ')">' + t('book_now') + '</button>'; 
            var landmarkText = (doc.address && doc.address.landmark) ? ' (' + escapeHTML(doc.address.landmark) + ')' : '';
            var addressText = doc.address ? escapeHTML(doc.address.city) + ' - ' + escapeHTML(doc.address.street || '') + landmarkText : '';
            var start = doc.startTime || '09:00'; var end = doc.endTime || '17:00';
            var mapBtnHTML = '';
            if (doc.location && doc.location.lat && doc.location.lng) {
                var mapLink = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(Number(doc.location.lat) + ',' + Number(doc.location.lng));
                mapBtnHTML = '<a href="' + mapLink + '" target="_blank" rel="noopener noreferrer" class="map-btn"><i class="fa-solid fa-map-location-dot"></i> ' + t('view_map') + '</a>';
            }
            list.innerHTML += '<div class="clinic-card" style="' + (isClosed ? 'opacity: 0.7;' : '') + '">' +
                '<div class="clinic-info"><h2>' + escapeHTML(docGroup.name) + '</h2>' +
                '<p class="doc-specialty" style="color:var(--warning);">🏥 ' + escapeHTML(doc.clinicName) + '</p>' +
                '<p class="doc-specialty">' + escapeHTML(docGroup.specialty) + '</p>' +
                '<p class="doc-address">📍 ' + escapeHTML(addressText) + '</p>' +
                '<p class="doc-address" style="font-size: 12px; color: var(--primary);">🕒 ' + t('hours_label') + ' ' + escapeHTML(start) + ' - ' + escapeHTML(end) + '</p>' + mapBtnHTML + '</div>' +
                '<div class="clinic-status" style="margin-top: 15px;">' + badgeHTML + '</div>' + btnHTML + '</div>';
        } else {
            list.innerHTML += '<div class="clinic-card">' +
                '<div class="clinic-info"><h2>' + escapeHTML(docGroup.name) + '</h2><p class="doc-specialty">' + escapeHTML(docGroup.specialty) + '</p>' +
                '<p class="doc-address" style="color: var(--success); font-weight:bold;">يعمل في ' + clinics.length + ' أماكن مختلفة</p></div>' +
                '<button class="book-btn" style="margin-top:15px;" onclick="openClinicSelectionModal(\'' + encodeURIComponent(JSON.stringify({name: docGroup.name, clinics: clinics})) + '\')">' + t('choose_clinic_btn') + '</button>' +
                '</div>';
        }
    }
}

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
            '<h4 style="margin: 0 0 5px 0; color: var(--primary);">' + escapeHTML(c.clinicName) + '</h4>' +
            '<p style="margin: 0 0 5px 0; font-size: 13px;">📍 ' + escapeHTML(addressText) + '</p>' +
            '<p style="margin: 0 0 10px 0; font-size: 13px; color: ' + color + ';">الحالة: ' + escapeHTML(statusText) + ' | 🕒 ' + escapeHTML(c.startTime) + ' - ' + escapeHTML(c.endTime) + '</p>' +
            '<button class="btn-primary" style="padding: 8px;" onclick="selectClinicToBook(' + safeJsArg(c.id) + ', ' + safeJsArg(data.name) + ', ' + safeJsArg(c.clinicName) + ')">' + t('book_now') + '</button>' +
            '</div>';
    }
    document.getElementById('clinicSelectionModal').classList.remove('hidden');
}

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

async function confirmBooking() {
    var name = document.getElementById('bookingName').value.trim();
    var phone = document.getElementById('bookingPhone').value.trim();
    var bookingDate = document.getElementById('bookingDate').value;
    if (!name || !phone || !bookingDate || !modalDoctorId) return alert('يرجى إدخال البيانات والتاريخ!');
    if (bookingDate < getTodayString()) return alert('لا يمكن اختيار تاريخ مضى.');
    var selectedDay = new Date(bookingDate + 'T00:00:00').getDay();
    if (modalWorkingDays.length && !modalWorkingDays.map(Number).includes(selectedDay)) return alert(t('invalid_working_day'));
    var button = document.querySelector('#bookingModal .btn-primary');
    if (button) button.disabled = true;
    try {
        var response = await functions.httpsCallable('createBooking')({
            doctorId: modalDoctorId, patientName: name, patientPhone: phone, bookingDate: bookingDate
        });
        var result = response.data;
        var myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
        var booking = {
            firebaseId: result.bookingId, patientSecret: result.patientSecret,
            ticket: result.ticketNumber, serial: result.serialNumber,
            doctorId: modalDoctorId, doctorName: modalDoctorName, name: name,
            bookingDate: bookingDate, status: 'waiting', date: new Date().toISOString()
        };
        myBookings.push(booking);
        localStorage.setItem('douri_bookings', JSON.stringify(myBookings));
        closeModal();
        alert('تم الحجز بنجاح. رقم دورك: ' + result.ticketNumber + '\nاحفظ رقم الحجز والرمز السري الظاهرين في التذكرة.');
        updateBanner(); showMyBookingsView(); openSpecificTicket(result.bookingId);
    } catch (err) {
        console.error(err);
        alert((err && err.message) || 'تعذر إتمام الحجز. حاول مرة أخرى.');
    } finally { if (button) button.disabled = false; }
}

function updateBanner() {
    var myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    var active = [];
    for (var i = 0; i < myBookings.length; i++) { if (myBookings[i].status === 'waiting' || myBookings[i].status === 'serving') active.push(myBookings[i]); }
    var banner = document.getElementById('activeBookingBanner'); var bannerText = document.getElementById('bannerText');
    if (banner && bannerText) { if (active.length > 0) { banner.classList.remove('hidden'); bannerText.innerText = t('active_booking_msg').replace('{n}', active.length); } else { banner.classList.add('hidden'); } }
}

function showMyBookingsView() {
    if (timerInterval) clearInterval(timerInterval);
    bookingPollGeneration++;
    activeTicketToDisplay = null;
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
        list.innerHTML += '<div class="clinic-card" style="border-right: 5px solid var(--primary);"><h3 style="margin:0; font-size:16px;">' + escapeHTML(b.doctorName) + '</h3><p class="muted" style="margin:5px 0;">' + t('appointment_date') + ' <b style="color:var(--primary);">' + escapeHTML(b.bookingDate) + '</b></p><p class="muted" style="margin:5px 0;">' + t('your_number') + ' <b>' + Number(b.ticket || 0) + '</b></p><button class="book-btn" style="padding:8px; font-size:14px;" onclick="openSpecificTicket(' + safeJsArg(b.firebaseId) + ')">' + t('view_ticket') + '</button></div>';
    }
}


async function restoreBookingByCode() {
    var bookingId = prompt(t('booking_ref_prompt'));
    if (!bookingId) return;
    var patientSecret = prompt(t('secret_prompt'));
    if (!patientSecret) return;
    try {
        var response = await functions.httpsCallable('getPatientBooking')({ bookingId: bookingId.trim(), patientSecret: patientSecret.trim() });
        var data = response.data;
        var bookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
        var restored = {
            firebaseId: data.bookingId, patientSecret: patientSecret.trim(), ticket: data.ticketNumber,
            serial: data.serialNumber, doctorId: data.doctorId, doctorName: data.doctorName,
            name: data.patientName, bookingDate: data.bookingDate, status: data.status
        };
        bookings = bookings.filter(function(item) { return item.firebaseId !== restored.firebaseId; });
        bookings.push(restored);
        localStorage.setItem('douri_bookings', JSON.stringify(bookings));
        updateBanner(); showMyBookingsView(); openSpecificTicket(restored.firebaseId);
    } catch (error) { alert((error && error.message) || t('invalid_booking')); }
}

function openSpecificTicket(id) {
    var bookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    var b = bookings.find(function(item) { return item.firebaseId === id; });
    if (!b) return;
    if (!b.patientSecret) return alert(t('old_booking_warning'));
    activeTicketToDisplay = b;
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('bookings-view').classList.add('hidden');
    document.getElementById('ticket-view').classList.remove('hidden');
    document.getElementById('patientNameDisplay').innerText = b.name;
    document.getElementById('ticketNumber').innerText = b.ticket;
    document.getElementById('doctorNameDisplay').innerText = t('at_doctor') + b.doctorName;
    document.getElementById('appointmentDateDisplay').innerText = t('appointment_date') + ' ' + b.bookingDate;
    document.getElementById('bookingReference').innerText = b.firebaseId;
    document.getElementById('bookingSecret').innerText = b.patientSecret;
    document.getElementById('bookingCredentials').classList.remove('hidden');
    if (timerInterval) clearInterval(timerInterval);
    var generation = ++bookingPollGeneration;
    async function refreshTicket() {
        if (generation !== bookingPollGeneration || !activeTicketToDisplay) return;
        try {
            var response = await functions.httpsCallable('getPatientBooking')({ bookingId: b.firebaseId, patientSecret: b.patientSecret });
            if (generation !== bookingPollGeneration) return;
            var data = response.data;
            var current = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
            current = current.map(function(item) { if (item.firebaseId === b.firebaseId) item.status = data.status; return item; });
            localStorage.setItem('douri_bookings', JSON.stringify(current));
            b.status = data.status;
            if (data.status === 'cancelled' || data.status === 'done') {
                document.getElementById('ticketStatus').innerText = data.status === 'done' ? t('booking_done') : t('booking_cancelled');
                document.getElementById('peopleAhead').innerText = '—';
                document.getElementById('waitTime').innerText = '—';
                document.getElementById('etaTime').innerText = '—';
                clearInterval(timerInterval); updateBanner(); return;
            }
            document.getElementById('peopleAhead').innerText = data.peopleAhead;
            document.getElementById('waitTime').innerText = '~' + (data.peopleAhead * data.serviceTime);
            document.getElementById('etaTime').innerText = getSmartETA(data, data.peopleAhead, b.bookingDate);
            var badge = document.getElementById('ticketStatus');
            if (data.status === 'serving') {
                badge.innerText = t('status_your_turn'); badge.style.backgroundColor = 'var(--success-light)'; badge.style.color = 'var(--success)';
            } else if (data.peopleAhead === 1) {
                badge.innerText = t('status_one_left'); badge.style.backgroundColor = 'var(--warning-light)'; badge.style.color = 'var(--warning)';
            } else {
                badge.innerText = t('status_waiting'); badge.style.backgroundColor = 'var(--warning-light)'; badge.style.color = 'var(--warning)';
            }
            updateBanner();
        } catch (err) { console.warn('تعذر تحديث التذكرة مؤقتاً:', err); }
    }
    refreshTicket();
    timerInterval = setInterval(refreshTicket, 15000);
}

async function cancelCurrentTicket() {
    if (!activeTicketToDisplay || !confirm('إلغاء الحجز؟')) return;
    try {
        await functions.httpsCallable('cancelBooking')({
            bookingId: activeTicketToDisplay.firebaseId,
            patientSecret: activeTicketToDisplay.patientSecret
        });
        var id = activeTicketToDisplay.firebaseId;
        var myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
        myBookings.forEach(function(item) { if (item.firebaseId === id) item.status = 'cancelled'; });
        localStorage.setItem('douri_bookings', JSON.stringify(myBookings));
        if (timerInterval) clearInterval(timerInterval);
        bookingPollGeneration++; activeTicketToDisplay = null; updateBanner(); showMyBookingsView();
        alert('تم إلغاء الحجز.');
    } catch (err) { alert((err && err.message) || 'تعذر إلغاء الحجز.'); }
}

function copyPatientCredentials() {
    if (!activeTicketToDisplay) return;
    var value = 'رقم الحجز: ' + activeTicketToDisplay.firebaseId + '\nالرمز السري: ' + activeTicketToDisplay.patientSecret;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(function() { alert(t('copy_success')); }).catch(function() { alert(value); });
    else alert(value);
}

function goBackToSearch() {
    saveViewState('main');
    if (timerInterval) clearInterval(timerInterval);
    bookingPollGeneration++;
    activeTicketToDisplay = null;
    document.getElementById('ticket-view').classList.add('hidden'); document.getElementById('bookings-view').classList.add('hidden'); document.getElementById('main-view').classList.remove('hidden');
}

function listenToMyBookings() {
    // تحديث التذكرة النشطة يتم عبر callable موثوق، ولا توجد قراءة مباشرة لوثائق المرضى.
}

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
    if (password.length < 6) return alert("كلمة المرور قصيرة");

    var clinicsToRegister = extraClinics.slice();
    functions.httpsCallable('registerDoctor')({
        email: email, password: password, activationCode: activationCode,
        name: name, specialty: specialty, phone: phone, clinics: clinicsToRegister
    }).then(function() {
        return auth.signInWithEmailAndPassword(email, password);
    }).then(function() {
        alert('تم إنشاء الحساب وحفظ العيادات بنجاح!');
        window.location.href = 'admin.html';
    }).catch(function(error) {
        console.error(error);
        alert((error && error.message) || 'تعذر إنشاء الحساب.');
    });
}

window.onload = function() {
    applyLanguage(); initTheme(); loadDoctors(); listenToMyBookings(); updateBanner(); restoreViewState();
};
