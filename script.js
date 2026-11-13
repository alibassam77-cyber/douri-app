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
var modalWorkingDays = []; // لحفظ أيام عمل العيادة المختارة
var timerInterval = null;
var doctorMap = null;
var doctorMarker = null;

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

function getTodayString() {
    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    var dd = String(today.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
}

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
        } else {
            var totalMins = startMins + (people * serviceTime);
            var hh2 = Math.floor(totalMins / 60);
            var mm2 = totalMins % 60;
            var timeStr2 = (hh2 < 10 ? "0" : "") + hh2 + ":" + (mm2 < 10 ? "0" : "") + mm2;
            return bookingDateStr + " | " + timeStr2;
        }
    } catch (e) {
        return "---";
    }
}

function loadDoctors() {
    var list = document.getElementById('doctorsList');
    var timeout = setTimeout(function() {
        if (list.innerHTML.indexOf('skeleton-card') > -1) {
            list.innerHTML = '<p style="text-align:center; color:red; padding:20px; background:#fee2e2; border-radius:10px;"><b>' + (currentLang === 'ar' ? 'فشل الاتصال بقاعدة البيانات!' : 'Connection failed!') + '</b></p>';
        }
    }, 5000);

    db.collection("doctors").onSnapshot(function(snapshot) {
        clearTimeout(timeout);
        allDoctors = [];
        var cities = {};
        snapshot.forEach(function(doc) {
            var data = doc.data();
            var d = { 
                id: doc.id, name: data.name, specialty: data.specialty, 
                clinicName: data.clinicName || 'عيادة', 
                address: data.address, location: data.location, isOpen: data.isOpen, 
                startTime: data.startTime, endTime: data.endTime, serviceTime: data.serviceTime,
                workingDays: data.workingDays || []
            };
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
        list.innerHTML = '<p style="text-align:center; color:red; padding:20px; background:#fee2e2; border-radius:10px;"><b>' + (currentLang === 'ar' ? 'خطأ في جلب البيانات' : 'Fetch error') + '</b><br>' + error.message + '</p>';
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
        var btnHTML = isClosed ? '<button class="book-btn" style="background-color:var(--text-muted);" disabled>' + t('on_break') + '</button>' : '<button class="book-btn" onclick="openBookingModal(\'' + doc.id + '\', \'' + doc.name + '\', \'' + doc.clinicName + '\')">' + t('book_now') + '</button>';
        
        var landmarkText = (doc.address && doc.address.landmark) ? ' (' + doc.address.landmark + ')' : '';
        var addressText = doc.address ? doc.address.city + ' - ' + (doc.address.street || '') + landmarkText : '';
        
        var start = doc.startTime || '09:00';
        var end = doc.endTime || '17:00';

        var mapBtnHTML = '';
        if (doc.location && doc.location.lat && doc.location.lng) {
            var mapLink = 'https://www.google.com/maps/search/?api=1&query=' + doc.location.lat + ',' + doc.location.lng;
            mapBtnHTML = '<a href="' + mapLink + '" target="_blank" class="map-btn"><i class="fa-solid fa-map-location-dot"></i> ' + t('view_map') + '</a>';
        }

        // إذا كان هناك أكثر من عيادة لنفس الطبيب، نعرض اسم العيادة بجانب اسمه
        list.innerHTML += '<div class="clinic-card" style="' + (isClosed ? 'opacity: 0.7;' : '') + '">' +
            '<div class="clinic-info">' +
            '<h2>' + doc.name + '</h2>' +
            '<p class="doc-specialty" style="color:var(--warning);">🏥 ' + doc.clinicName + '</p>' +
            '<p class="doc-specialty">' + doc.specialty + '</p>' +
            '<p class="doc-address">📍 ' + addressText + '</p>' +
            '<p class="doc-address" style="font-size: 12px; color: var(--primary);">🕒 ' + t('hours_label') + ' ' + start + ' - ' + end + '</p>' +
            mapBtnHTML +
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

function openBookingModal(doctorId, doctorName, clinicName) {
    modalDoctorId = doctorId;
    modalDoctorName = doctorName;
    
    // جلب أيام عمل هذه العيادة من مصفوفة الأطباء
    modalWorkingDays = [];
    for (var i = 0; i < allDoctors.length; i++) {
        if (allDoctors[i].id === doctorId) {
            modalWorkingDays = allDoctors[i].workingDays || [];
            break;
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

function closeModal() {
    document.getElementById('bookingModal').classList.add('hidden');
    modalDoctorId = null;
    modalDoctorName = null;
}

function confirmBooking() {
    var name = document.getElementById('bookingName').value.trim();
    var phone = document.getElementById('bookingPhone').value.trim();
    var bookingDate = document.getElementById('bookingDate').value;
    
    if (!name || !phone || !bookingDate) return alert(currentLang === 'ar' ? "يرجى إدخال البيانات والتاريخ!" : "Please enter data and date!");
    
    // التحقق من يوم العمل
    var selectedDay = new Date(bookingDate).getDay(); // 0=Sun, 6=Sat
    var isWorkingDay = false;
    
    // إذا لم يتم تحديد أي أيام، نعتبر كل الأيام تعمل
    if (modalWorkingDays.length === 0) {
        isWorkingDay = true;
    } else {
        for (var i = 0; i < modalWorkingDays.length; i++) {
            if (Number(modalWorkingDays[i]) === selectedDay) { isWorkingDay = true; break; }
        }
    }
    
    if (!isWorkingDay) {
        return alert(t('invalid_working_day'));
    }
    
    var dayDocId = modalDoctorId + "_" + bookingDate;
    var docDayRef = db.collection("doctor_days").doc(dayDocId);
    
    docDayRef.get().then(function(daySnap) {
        var lastTicket = 1;
        if (daySnap.exists) {
            lastTicket = (daySnap.data().lastTicket || 0) + 1;
        }
        
        docDayRef.set({ 
            doctorId: modalDoctorId, 
            date: bookingDate, 
            lastTicket: lastTicket, 
            currentServing: daySnap.exists ? (daySnap.data().currentServing || 1) : 1 
        }, { merge: true }).then(function() {
            
            db.collection("bookings").add({ 
                doctorId: modalDoctorId, 
                doctorName: modalDoctorName, 
                patientName: name, 
                patientPhone: phone, 
                bookingDate: bookingDate,
                ticketNumber: lastTicket, 
                status: 'waiting', 
                createdAt: firebase.firestore.FieldValue.serverTimestamp() 
            }).then(function(bookingRef) {
                var myBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
                myBookings.push({ 
                    firebaseId: bookingRef.id, 
                    ticket: lastTicket, 
                    doctorId: modalDoctorId, 
                    doctorName: modalDoctorName, 
                    name: name, 
                    phone: phone, 
                    bookingDate: bookingDate,
                    date: new Date().toISOString() 
                });
                localStorage.setItem('douri_bookings', JSON.stringify(myBookings));
                
                closeModal();
                alert((currentLang === 'ar' ? "تم الحجز! رقم دورك: " : "Booked! Your number: ") + lastTicket);
                updateBanner();
                listenToMyBookings();
                showMyBookingsView();
            });
        });
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
            '<p class="muted" style="margin:5px 0;">' + t('appointment_date') + ' <b style="color:var(--primary);">' + b.bookingDate + '</b></p>' +
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
    document.getElementById('appointmentDateDisplay').innerText = t('appointment_date') + ' ' + b.bookingDate;
    
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(function() {
        var currentBookings = JSON.parse(localStorage.getItem('douri_bookings') || '[]');
        var currentB = null;
        for (var k = 0; k < currentBookings.length; k++) { if (currentBookings[k].firebaseId === id) currentB = currentBookings[k]; }
        
        if (!currentB || currentB.status === 'cancelled') {
            clearInterval(timerInterval);
            alert(currentLang === 'ar' ? "تم إلغاء الحجز." : "Booking cancelled.");
            goBackToSearch();
            return;
        }
        
        var dayDocId = b.doctorId + "_" + b.bookingDate;
        db.collection("doctor_days").doc(dayDocId).get().then(function(daySnap) {
            if (daySnap.exists) {
                var dayData = daySnap.data();
                db.collection("doctors").doc(b.doctorId).get().then(function(docSnap) {
                    if (docSnap.exists) {
                        var docData = docSnap.data();
                        var peopleAhead = b.ticket - dayData.currentServing - 1;
                        if (peopleAhead < 0) peopleAhead = 0;
                        
                        document.getElementById('peopleAhead').innerText = peopleAhead;
                        var smartTime = getSmartETA(docData, peopleAhead, b.bookingDate);
                        document.getElementById('etaTime').innerText = smartTime;
                        document.getElementById('waitTime').innerText = "~" + (peopleAhead * docData.serviceTime);

                        var badge = document.getElementById('ticketStatus');
                        if (peopleAhead === 0 && b.ticket == dayData.currentServing) {
                            badge.innerText = t('status_your_turn'); badge.style.backgroundColor = "var(--success-light)"; badge.style.color = "var(--success)";
                        } else if (peopleAhead === 1) {
                            badge.innerText = t('status_one_left'); badge.style.backgroundColor = "var(--warning-light)"; badge.style.color = "var(--warning)";
                        } else {
                            badge.innerText = t('status_waiting'); badge.style.backgroundColor = "var(--warning-light)"; badge.style.color = "var(--warning)";
                        }
                    }
                });
            }
        });
    }, 3000);
}

function cancelCurrentTicket() {
    if(!activeTicketToDisplay) return;
    if(!confirm(currentLang === 'ar' ? "إلغاء الحجز؟" : "Cancel booking?")) return;
    
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
        setTimeout(initDoctorMap, 300);
    }
}

function initDoctorMap() {
    if (!document.getElementById('reg-map')) return;
    if (doctorMap) { doctorMap.invalidateSize(); return; }
    var defaultLat = 15.3694;
    var defaultLng = 44.1910;
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
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    if (!email || !password) return alert(currentLang === 'ar' ? "أدخل البيانات" : "Enter data");
    auth.signInWithEmailAndPassword(email, password).then(function() { window.location.href = 'admin.html'; }).catch(function(e) { alert("Error: " + e.message); });
}

function registerAndSaveDoctor() {
    var email = document.getElementById('regEmail').value.trim();
    var password = document.getElementById('regPassword').value;
    var activationCode = document.getElementById('regActivationCode').value.trim();
    var name = document.getElementById('docName').value.trim();
    var specialty = document.getElementById('docSpecialty').value.trim();
    var phone = document.getElementById('docPhone').value.trim();
    var clinicName = document.getElementById('docClinicName').value.trim();
    var city = document.getElementById('docCity').value.trim();
    var street = document.getElementById('docStreet').value.trim();
    var landmark = document.getElementById('docLandmark').value.trim();
    var startTime = document.getElementById('docStartTime').value;
    var endTime = document.getElementById('docEndTime').value;
    var serviceTime = document.getElementById('docServiceTime').value;
    var lat = document.getElementById('docLat').value;
    var lng = document.getElementById('docLng').value;

    // جمع أيام العمل
    var workingDays = [];
    for (var i = 0; i <= 6; i++) {
        var cb = document.getElementById('day_' + i);
        if (cb && cb.checked) workingDays.push(i);
    }

    if (!email || !password || !name || !specialty || !city || !activationCode || !clinicName) return alert(currentLang === 'ar' ? "أكمل البيانات!" : "Complete data!");
    if (activationCode !== ADMIN_SECRET_CODE) return alert(t('invalid_code'));
    if (password.length < 6) return alert(currentLang === 'ar' ? "كلمة المرور قصيرة" : "Password short");
    if (!lat || !lng) return alert(currentLang === 'ar' ? "الرجاء تحديد موقع العيادة على الخريطة!" : "Please select location on map!");
    if (workingDays.length === 0) return alert(currentLang === 'ar' ? "الرجاء تحديد يوم عمل واحد على الأقل!" : "Please select at least one working day!");

    auth.createUserWithEmailAndPassword(email, password).then(function(userCredential) {
        var user = userCredential.user;
        db.collection("doctors").add({ 
            ownerUid: user.uid, email: user.email, name: name, specialty: specialty, phone: phone, 
            clinicName: clinicName,
            address: { city: city, street: street, landmark: landmark }, 
            location: { lat: Number(lat), lng: Number(lng) },
            serviceTime: Number(serviceTime), startTime: startTime, endTime: endTime, 
            workingDays: workingDays,
            createdAt: new Date().toISOString() 
        }).then(function() {
            alert(currentLang === 'ar' ? "تم الحفظ!" : "Saved!"); window.location.href = 'admin.html';
        });
    }).catch(function(error) { alert("Error: " + error.message); });
}

window.onload = function() {
    applyLanguage();
    initTheme();
    loadDoctors();
    listenToMyBookings();
};
