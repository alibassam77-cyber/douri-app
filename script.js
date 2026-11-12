var firebaseConfig = {
    apiKey: "AIzaSyBupRlote48_0GtaelL_a13uYUfFPhCWbE", authDomain: "douri-app-63918.firebaseapp.com",
    projectId: "douri-app-63918", storageBucket: "douri-app-63918.firebasestorage.app",
    messagingSenderId: "653080780726", appId: "1:653080780726:web:4f2b3421b905e65af9ab17"
};
firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();
var auth = firebase.auth();

var translations = {
    ar: { app_title: "عيادة", doctors_btn: "الأطباء", all_cities: "كل المدن", search_placeholder: "اسم الطبيب أو التخصص...", no_results: "لا يوجد أطباء.", available: "متاح للحجز", closed_temp: "مغلق مؤقتاً", on_break: "استراحة", book_now: "احجز الآن", clinic_location: "موقع العيادة", at_doctor: "عند: ", my_bookings_title: "حجوزاتي", no_bookings: "لا يوجد حجوزات.", your_number: "رقم دورك:", view_ticket: "عرض التذكرة", back_to_search: "العودة للبحث", your_ticket_number: "رقم دورك", status_waiting: "في الانتظار", status_your_turn: "حان دورك!", status_one_left: "بقي مريض واحد", ahead_label: "أمامك", wait_time_label: "دقيقة", eta_label: "الوقت المتوقع", welcome_msg: "أهلاً", ticket_hint: "تتحدث تلقائياً.", back_to_bookings: "العودة", cancel_booking_btn: "إلغاء", confirm_booking_title: "تأكيد الحجز", full_name_label: "الاسم:", name_placeholder: "الاسم", phone_label: "الهاتف:", phone_placeholder: "77...", confirm_btn: "تأكيد", cancel_btn: "إلغاء", doctor_portal_title: "بوابة الأطباء", login_tab: "دخول", register_tab: "جديد", email_label: "الإيميل:", password_label: "المرور:", password_min_label: "كلمة المرور:", remember_me: "تذكرني", login_btn: "دخول", doctor_name_label: "الاسم:", doc_name_ph: "د. أحمد", specialty_label: "التخصص:", specialty_ph: "باطنية", city_label: "المدينة:", city_ph: "صنعاء", street_label: "الشارع:", street_ph: "حدة", start_time_label: "وقت الفتح:", end_time_label: "وقت الإغلاق:", service_time_label: "مدة الكشف (دقيقة):", create_account_btn: "حفظ", active_booking_msg: "لديك {n} حجز", tomorrow: "غداً " },
    en: { app_title: "Clinic", doctors_btn: "Doctors", all_cities: "All Cities", search_placeholder: "Doctor...", no_results: "No doctors.", available: "Available", closed_temp: "Closed", on_break: "Break", book_now: "Book Now", clinic_location: "Location", at_doctor: "At: ", my_bookings_title: "Bookings", no_bookings: "No bookings.", your_number: "Number:", view_ticket: "View", back_to_search: "Back", your_ticket_number: "Your Number", status_waiting: "Waiting", status_your_turn: "Your Turn!", status_one_left: "One left", ahead_label: "Ahead", wait_time_label: "Min", eta_label: "ETA", welcome_msg: "Welcome", ticket_hint: "Updates automatically.", back_to_bookings: "Back", cancel_booking_btn: "Cancel", confirm_booking_title: "Confirm", full_name_label: "Name:", name_placeholder: "Name", phone_label: "Phone:", phone_placeholder: "77...", confirm_btn: "Confirm", cancel_btn: "Cancel", doctor_portal_title: "Doctor Portal", login_tab: "Login", register_tab: "New", email_label: "Email:", password_label: "Pass:", password_min_label: "Pass (6):", remember_me: "Remember me", login_btn: "Login", doctor_name_label: "Name:", doc_name_ph: "Dr. A", specialty_label: "Specialty:", specialty_ph: "Internal", city_label: "City:", city_ph: "Sanaa", street_label: "Street:", street_ph: "Hadda", start_time_label: "Open:", end_time_label: "Close:", service_time_label: "Service (min):", create_account_btn: "Save", active_booking_msg: "You have {n} booking(s)", tomorrow: "Tmrw " }
};

var currentLang = localStorage.getItem('douri_lang') || 'ar';

function applyLanguage() {
    var dict = translations[currentLang];
    if (currentLang === 'ar') { document.documentElement.setAttribute('dir', 'rtl'); if(document.getElementById('langToggleBtn')) document.getElementById('langToggleBtn').innerText = 'EN'; }
    else { document.documentElement.setAttribute('dir', 'ltr'); if(document.getElementById('langToggleBtn')) document.getElementById('langToggleBtn').innerText = 'عربي'; }
    
    var elements = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < elements.length; i++) {
        var key = elements[i].getAttribute('data-i18n');
        if (dict[key]) elements[i].innerText = dict[key];
    }
    var placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < placeholders.length; j++) {
        var pKey = placeholders[j].getAttribute('data-i18n-placeholder');
        if (dict[pKey]) placeholders[j].setAttribute('placeholder', dict[pKey]);
    }
    document.title = dict.app_title;
}

function toggleLanguage() { currentLang = currentLang === 'ar' ? 'en' : 'ar'; localStorage.setItem('douri_lang', currentLang); window.location.reload(); }
function t(key) { return translations[currentLang] && translations[currentLang][key] ? translations[currentLang][key] : key; }

var allDoctors = [];
var currentListener = null;
var activeTicketToDisplay = null;
var modalDoctorId = null;
var modalDoctorName = null;
var timerInterval = null;

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

function getSmartETA(doctorData, peopleAhead) {
    try {
        var now = new Date();
        var startStr = doctorData.startTime || "09:00";
        var endStr = doctorData.endTime || "17:00";
        var serviceTime = Number(doctorData.serviceTime) || 10;
        var people = Number(peopleAhead) || 0;

        var startParts = startStr.split(':');
        var startH = parseInt(startParts[0], 10);
        var startM = parseInt(startParts[1], 10);
        
        var endParts = endStr.split(':');
        var endH = parseInt(endParts[0], 10);
        var endM = parseInt(endParts[1], 10);

        if (isNaN(startH)) startH = 9; if (isNaN(startM)) startM = 0;
        if (isNaN(endH)) endH = 17; if (isNaN(endM)) endM = 0;

        var nowM = now.getHours() * 60 + now.getMinutes();
        var startMins = startH * 60 + startM;
        var endMins = endH * 60 + endM;

        var eta = new Date(now.getTime());

        if (nowM < startMins) {
            eta.setHours(startH, startM, 0, 0);
        } else if (nowM >= endMins) {
            eta.setDate(eta.getDate() + 1);
            eta.setHours(startH, startM, 0, 0);
        }

        eta.setMinutes(eta.getMinutes() + (people * serviceTime));

        var etaMins = eta.getHours() * 60 + eta.getMinutes();
        if (etaMins >= endMins && people > 0) {
            var overflow = etaMins - endMins;
            eta.setDate(eta.getDate() + 1);
            eta.setHours(startH, startM, 0, 0);
            eta.setMinutes(eta.getMinutes() + overflow);
        }

        var hh = eta.getHours();
        var mm = eta.getMinutes();
        var timeStr = (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;

        if (eta.getDate() !== now.getDate()) {
            return t('tomorrow') + timeStr;
        }
        return timeStr;
    } catch (e) {
        var fallbackNow = new Date();
        fallbackNow.setMinutes(fallbackNow.getMinutes() + (peopleAhead * 10));
        var fh = fallbackNow.getHours();
        var fm = fallbackNow.getMinutes();
        return (fh < 10 ? "0" : "") + fh + ":" + (fm < 10 ? "0" : "") + fm;
    }
}

function loadDoctors() {
    var list = document.getElementById('doctorsList');
    var timeout = setTimeout(function() {
        if (list.innerHTML.indexOf('skeleton-card') > -1) {
            list.innerHTML = '<p style="text-align:center; color:red; padding:20px; background:#fee2e2; border-radius:10px;"><b>فشل الاتصال بقاعدة البيانات!</b></p>';
        }
    }, 5000);

    db.collection("doctors").onSnapshot(function(snapshot) {
        clearTimeout(timeout);
        allDoctors = [];
        var cities = {};
        snapshot.forEach(function(doc) {
            var data = doc.data();
            var d = { id: doc.id, name: data.name, specialty: data.specialty, address: data.address, location: data.location, isOpen: data.isOpen, currentServing: data.currentServing, lastTicket: data.lastTicket, startTime: data.startTime, endTime: data.endTime, serviceTime: data.serviceTime };
            allDoctors.push(d);
            if (d.address && d.address.city) { cities[d.address.city] = true; }
        });
        
        var citySelect = document.getElementById('cityFilter');
        var currentSelection = citySelect.value;
        citySelect.innerHTML = '<option value="">' + t('all_cities') + '</option>';
        for (var c in cities) { citySelect.innerHTML += '<option value="' + c + '">' + c + '</option>'; }
        if (currentSelection) citySelect.value = currentSelection;

        filterDoctors();
        updateBanner();
    }, function(error) {
        clearTimeout(timeout);
        list.innerHTML = '<p style="text-align:center; color:red; padding:20px; background:#fee2e2; border-radius:10px;"><b>خطأ في جلب البيانات</b><br>' + error.message + '</p>';
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
        var doc = doctorsToRender[i];
        var isClosed = doc.isOpen === false;
        var badgeHTML = isClosed ? '<span class="badge red">' + t('closed_temp') + '</span>' : '<span class="badge green">' + t('available') + '</span>';
        var btnHTML = isClosed ? '<button class="book-btn" style="background-color:var(--text-muted);" disabled>' + t('on_break') + '</button>' : '<button class="book-btn" onclick="openBookingModal(\'' + doc.id + '\', \'' + doc.name + '\')">' + t('book_now') + '</button>';
        var addressText = doc.address ? doc.address.city + ' - ' + (doc.address.street || '') : '';
        var start = doc.startTime || '09:00';
        var end = doc.endTime || '17:00';

        list.innerHTML += '<div class="clinic-card" style="' + (isClosed ? 'opacity: 0.7;' : '') + '">' +
            '<div class="clinic-info">' +
            '<h2>' + doc.name + '</h2>' +
            '<p class="doc-specialty">' + doc.specialty + '</p>' +
            '<p class="doc-address">📍 ' + addressText + '</p>' +
            '<p class="doc-address" style="font-size: 12px; color: var(--primary);">🕒 ' + start + ' - ' + end + '</p>' +
            '</div>' +
            '<div class="clinic-status" style="margin-top: 15px;">' + badgeHTML + '</div>' +
            btnHTML +
            '</div>';
    }
}

function filterDoctors() {
    var citySelect = document.getElementById('cityFilter');
    var searchInput = document.getElementById('searchInput');
    if (!citySelect || !searchInput) return;
    var selectedCity = citySelect.value;
    var textQuery = searchInput.value.toLowerCase();
    var filtered = [];
    for (var i = 0; i < allDoctors.length; i++) {
        var doc = allDoctors[i];
        var matchesCity = selectedCity === "" || (doc.address && doc.address.city === selectedCity);
        var matchesText = (doc.name || '').toLowerCase().indexOf(textQuery) > -1 || (doc.specialty || '').toLowerCase().indexOf(textQuery) > -1;
        if (matchesCity && matchesText) filtered.push(doc);
    }
    renderDoctors(filtered);
}

function openBookingModal(doctorId, doctorName) {
    modalDoctorId = doctorId;
    modalDoctorName = doctorName;
    document.getElementById('modalDoctorName').innerText = t('at_doctor') + doctorName;
    document.getElementById('bookingName').value = '';
    document.getElementById('bookingPhone').value = '';
    document.getElementById('bookingModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('bookingModal').classList.add('hidden');
    modalDoctorId = null;
    modalDoctorName = null;
}

function confirmBooking() {
    var name = document.getElementById('bookingName').value.trim();
    var phone = document.getElementById('bookingPhone').value.trim();
    if (!name || !phone) return alert("يرجى إدخال البيانات!");
    
    var docRef = db.collection("doctors").doc(modalDoctorId);
    docRef.get().then(function(docSnap) {
        if (docSnap.exists) {
            if (docSnap.data().isOpen === false) return alert(t('closed_temp'));
            var currentTicket = (docSnap.data().lastTicket || 0) + 1;
            docRef.update({ lastTicket: currentTicket }).then(function() {
                db.collection("patients").doc(phone).set({ name: name, phone: phone, lastVisit: firebase.firestore.FieldValue.serverTimestamp() });
                db.collection("bookings").add({ doctorId: modalDoctorId, doctorName: modalDoctorName, patientName: name, patientPhone: phone, ticketNumber: currentTicket, status: 'waiting', createdAt: firebase.firestore.FieldValue.serverTimestamp() }).then(function(bookingRef) {
                    var myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
                    myBookings.push({ firebaseId: bookingRef.id, ticket: currentTicket, doctorId: modalDoctorId, doctorName: modalDoctorName, name: name, phone: phone, date: new Date().toISOString() });
                    localStorage.setItem('douri_bookings', JSON.stringify(myBookings));
                    closeModal();
                    alert((currentLang === 'ar' ? "تم الحجز! رقم دورك: " : "Booked! Your number: ") + currentTicket);
                    updateBanner();
                    listenToMyBookings();
                    showMyBookingsView();
                });
            });
        }
    }).catch(function(err) { alert("Error: " + err.message); });
}

function updateBanner() {
    var myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    var active = [];
    for (var i = 0; i < myBookings.length; i++) {
        if (myBookings[i].status === 'waiting' || myBookings[i].status === 'serving') active.push(myBookings[i]);
    }
    var banner = document.getElementById('activeBookingBanner');
    var bannerText = document.getElementById('bannerText');
    if (banner && bannerText) {
        if (active.length > 0) { banner.classList.remove('hidden'); bannerText.innerText = t('active_booking_msg').replace('{n}', active.length); }
        else { banner.classList.add('hidden'); }
    }
}

function showMyBookingsView() {
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('ticket-view').classList.add('hidden');
    document.getElementById('bookings-view').classList.remove('hidden');
    var myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    var active = [];
    for (var i = 0; i < myBookings.length; i++) {
        if (myBookings[i].status === 'waiting' || myBookings[i].status === 'serving') active.push(myBookings[i]);
    }
    var list = document.getElementById('myBookingsList');
    list.innerHTML = '';
    if (active.length === 0) { list.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + t('no_bookings') + '</p>'; return; }
    
    for (var j = 0; j < active.length; j++) {
        var b = active[j];
        list.innerHTML += '<div class="clinic-card" style="border-right: 5px solid var(--primary);">' +
            '<h3 style="margin:0; font-size:16px;">' + b.doctorName + '</h3>' +
            '<p class="muted" style="margin:5px 0;">' + t('your_number') + ' <b>' + b.ticket + '</b></p>' +
            '<button class="book-btn" style="padding:8px; font-size:14px;" onclick="openSpecificTicket(\'' + b.firebaseId + '\')">' + t('view_ticket') + '</button>' +
            '</div>';
    }
}

function openSpecificTicket(id) {
    var bookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    var b = null;
    for (var i = 0; i < bookings.length; i++) { if (bookings[i].firebaseId === id) b = bookings[i]; }
    if (!b) return;
    
    activeTicketToDisplay = b;
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('bookings-view').classList.add('hidden');
    document.getElementById('ticket-view').classList.remove('hidden');
    document.getElementById('patientNameDisplay').innerText = b.name;
    document.getElementById('ticketNumber').innerText = b.ticket;
    document.getElementById('doctorNameDisplay').innerText = t('at_doctor') + b.doctorName;
    
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(function() {
        var currentBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
        var currentB = null;
        for (var k = 0; k < currentBookings.length; k++) { if (currentBookings[k].firebaseId === id) currentB = currentBookings[k]; }
        
        if (!currentB || currentB.status === 'cancelled') {
            clearInterval(timerInterval);
            alert("تم إلغاء الحجز.");
            goBackToSearch();
            return;
        }
        
        db.collection("doctors").doc(b.doctorId).get().then(function(doc) {
            if (doc.exists) {
                var docData = doc.data();
                var peopleAhead = b.ticket - docData.currentServing - 1;
                if (peopleAhead < 0) peopleAhead = 0;
                
                document.getElementById('peopleAhead').innerText = peopleAhead;
                var smartTime = getSmartETA(docData, peopleAhead);
                document.getElementById('etaTime').innerText = smartTime;

                if(smartTime.indexOf(t('tomorrow')) > -1) { document.getElementById('waitTime').innerText = "-"; }
                else { document.getElementById('waitTime').innerText = "~" + (peopleAhead * docData.serviceTime); }

                var badge = document.getElementById('ticketStatus');
                if (peopleAhead === 0 && b.ticket == docData.currentServing) {
                    badge.innerText = t('status_your_turn'); badge.style.backgroundColor = "var(--success-light)"; badge.style.color = "var(--success)";
                } else if (peopleAhead === 1) {
                    badge.innerText = t('status_one_left'); badge.style.backgroundColor = "var(--warning-light)"; badge.style.color = "var(--warning)";
                } else {
                    badge.innerText = t('status_waiting'); badge.style.backgroundColor = "var(--warning-light)"; badge.style.color = "var(--warning)";
                }
            }
        });
    }, 3000);
}

function cancelCurrentTicket() {
    if(!activeTicketToDisplay) return;
    if(!confirm("إلغاء الحجز؟")) return;
    
    db.collection("bookings").doc(activeTicketToDisplay.firebaseId).update({ status: 'cancelled' });
    
    var myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
    var updated = [];
    for (var i = 0; i < myBookings.length; i++) {
        if (myBookings[i].firebaseId === activeTicketToDisplay.firebaseId) myBookings[i].status = 'cancelled';
        updated.push(myBookings[i]);
    }
    localStorage.setItem('douri_bookings', JSON.stringify(updated));
    
    if (timerInterval) clearInterval(timerInterval);
    activeTicketToDisplay = null;
    updateBanner();
    showMyBookingsView();
}

function goBackToSearch() {
    if (timerInterval) clearInterval(timerInterval);
    document.getElementById('ticket-view').classList.add('hidden');
    document.getElementById('bookings-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('hidden');
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
                            var current = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
                            var upd = [];
                            for (var j = 0; j < current.length; j++) {
                                if (current[j].firebaseId === booking.firebaseId) current[j].status = status;
                                upd.push(current[j]);
                            }
                            localStorage.setItem('douri_bookings', JSON.stringify(upd));
                            updateBanner();
                            if (!document.getElementById('bookings-view').classList.contains('hidden')) showMyBookingsView();
                            if (activeTicketToDisplay && activeTicketToDisplay.firebaseId === booking.firebaseId && status === 'serving') {
                                alert(currentLang === 'ar' ? "حان دورك الآن!" : "It's your turn!");
                                goBackToSearch();
                            }
                        }
                    }
                });
            })(b);
        }
    }
}

function openDoctorModal() { document.getElementById('doctorModal').classList.remove('hidden'); }
function closeDoctorModal() { document.getElementById('doctorModal').classList.add('hidden'); }
function switchAuthTab(tab) {
    if (tab === 'login') { document.getElementById('tabLogin').classList.add('active'); document.getElementById('tabRegister').classList.remove('active'); document.getElementById('loginSection').classList.remove('hidden'); document.getElementById('registerSection').classList.add('hidden'); }
    else { document.getElementById('tabRegister').classList.add('active'); document.getElementById('tabLogin').classList.remove('active'); document.getElementById('registerSection').classList.remove('hidden'); document.getElementById('loginSection').classList.add('hidden'); }
}

function loginDoctor() {
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    if (!email || !password) return alert("أدخل البيانات");
    auth.signInWithEmailAndPassword(email, password).then(function() { window.location.href = 'admin.html'; }).catch(function(e) { alert("خطأ: " + e.message); });
}

function registerAndSaveDoctor() {
    var email = document.getElementById('regEmail').value.trim();
    var password = document.getElementById('regPassword').value;
    var name = document.getElementById('docName').value.trim();
    var specialty = document.getElementById('docSpecialty').value.trim();
    var phone = document.getElementById('docPhone').value.trim();
    var city = document.getElementById('docCity').value.trim();
    var street = document.getElementById('docStreet').value.trim();
    var startTime = document.getElementById('docStartTime').value;
    var endTime = document.getElementById('docEndTime').value;
    var serviceTime = document.getElementById('docServiceTime').value;

    if (!email || !password || !name || !specialty || !city) return alert("أكمل البيانات!");
    if (password.length < 6) return alert("كلمة المرور قصيرة");

    auth.createUserWithEmailAndPassword(email, password).then(function(userCredential) {
        var user = userCredential.user;
        db.collection("doctors").add({ ownerUid: user.uid, email: user.email, name: name, specialty: specialty, phone: phone, address: { city: city, street: street }, serviceTime: Number(serviceTime), startTime: startTime, endTime: endTime, currentServing: 0, lastTicket: 0, isOpen: true, createdAt: new Date().toISOString() }).then(function() {
            alert("تم الحفظ!"); window.location.href = 'admin.html';
        });
    }).catch(function(error) { alert("خطأ: " + error.message); });
}

window.onload = function() {
    applyLanguage();
    initTheme();
    loadDoctors();
    listenToMyBookings();
};
