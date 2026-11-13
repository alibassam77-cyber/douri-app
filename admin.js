var firebaseConfig = {
    apiKey: "AIzaSyBupRlote48_0GtaelL_a13uYUfFPhCWbE", authDomain: "douri-app-63918.firebaseapp.com",
    projectId: "douri-app-63918", storageBucket: "douri-app-63918.firebasestorage.app",
    messagingSenderId: "653080780726", appId: "1:653080780726:web:4f2b3421b905e65af9ab17"
};
firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();
var auth = firebase.auth();

var myClinics = [];
var selectedClinicId = null;
var currentDoctorData = null;
var currentIsOpen = true;
var currentAdminDate = "";
var queueListener = null;
var dayCounterListener = null;
var addMap = null;
var addMarker = null;
var editMap = null;
var editMarker = null;

function getTodayString() {
    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    var dd = String(today.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
}

auth.onAuthStateChanged(function(user) {
    if (user) { 
        applyLanguage(); 
        
        currentAdminDate = getTodayString();
        document.getElementById('adminDate').value = currentAdminDate;
        
        db.collection("doctors").where("ownerUid", "==", user.uid).onSnapshot(function(snapshot) {
            myClinics = [];
            snapshot.forEach(function(doc) {
                var data = doc.data();
                myClinics.push({ id: doc.id, data: data });
            });
            
            if (myClinics.length > 0) {
                populateClinicSelector();
                if (!selectedClinicId || !myClinics.some(function(c){ return c.id === selectedClinicId; })) {
                    selectedClinicId = myClinics[0].id;
                }
                document.getElementById('clinicSelector').value = selectedClinicId;
                initAdminPanel();
            } else {
                document.getElementById('activeDoctorName').innerText = currentLang === 'ar' ? "لم تقم بتسجيل عيادة بعد" : "Clinic not registered yet";
                document.getElementById('patientsQueue').innerHTML = '<p style="text-align:center; color:var(--primary);">' + (currentLang === 'ar' ? 'يرجى الخروج وتسجيل عيادة جديدة.' : 'Please logout and register a clinic.') + '</p>';
            }
        });
    }
    else { window.location.href = 'index.html'; }
});

function populateClinicSelector() {
    var select = document.getElementById('clinicSelector');
    select.innerHTML = '';
    for (var i = 0; i < myClinics.length; i++) {
        var c = myClinics[i];
        select.innerHTML += '<option value="' + c.id + '">' + c.data.clinicName + '</option>';
    }
}

function changeClinic() {
    selectedClinicId = document.getElementById('clinicSelector').value;
    initAdminPanel();
}

function changeAdminDate() {
    currentAdminDate = document.getElementById('adminDate').value;
    if (currentAdminDate && selectedClinicId) {
        listenToQueue();
        listenToDayCounters();
    }
}

function initAdminPanel() {
    if (!selectedClinicId) return;
    
    for (var i = 0; i < myClinics.length; i++) {
        if (myClinics[i].id === selectedClinicId) {
            currentDoctorData = myClinics[i].data;
            break;
        }
    }
    
    if (!currentDoctorData) return;

    currentIsOpen = currentDoctorData.isOpen !== false;
    var start = currentDoctorData.startTime || '09:00';
    var end = currentDoctorData.endTime || '17:00';
    
    document.getElementById('activeDoctorName').innerText = currentDoctorData.name + " (" + currentDoctorData.specialty + ") | " + currentDoctorData.clinicName + " | " + start + " - " + end;
    
    updateClinicStatusUI();
    listenToQueue();
    listenToDayCounters();
}

function updateClinicStatusUI() {
    var btn = document.getElementById('toggleClinicBtn');
    if (currentIsOpen) { btn.className = 'status-toggle-btn status-open'; btn.innerHTML = '<i class="fa-solid fa-lock"></i> ' + t('close_clinic'); }
    else { btn.className = 'status-toggle-btn status-closed'; btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> ' + t('open_clinic'); }
}

function toggleClinicStatus() {
    if (!selectedClinicId) return;
    currentIsOpen = !currentIsOpen;
    db.collection("doctors").doc(selectedClinicId).update({ isOpen: currentIsOpen }).then(function() { 
        updateClinicStatusUI(); 
        for (var i = 0; i < myClinics.length; i++) {
            if (myClinics[i].id === selectedClinicId) {
                myClinics[i].data.isOpen = currentIsOpen;
                break;
            }
        }
    });
}

function listenToDayCounters() {
    if (!selectedClinicId || !currentAdminDate) return;
    if (dayCounterListener) dayCounterListener();
    
    var dayDocId = selectedClinicId + "_" + currentAdminDate;
    dayCounterListener = db.collection("doctor_days").doc(dayDocId).onSnapshot(function(doc) {
        if (doc.exists) {
            document.getElementById('currentServingDisplay').innerText = doc.data().currentServing || '-';
        } else {
            document.getElementById('currentServingDisplay').innerText = '-';
        }
    });
}

function listenToQueue() {
    if (!selectedClinicId || !currentAdminDate) return;
    if (queueListener) queueListener();
    
    queueListener = db.collection("bookings")
        .where("doctorId", "==", selectedClinicId)
        .where("bookingDate", "==", currentAdminDate)
        .onSnapshot(function(snapshot) {
            var patients = [];
            snapshot.forEach(function(doc) { patients.push({ id: doc.id, data: doc.data() }); });
            patients.sort(function(a, b) { return a.data.ticketNumber - b.data.ticketNumber; });
            renderQueue(patients);
        });
}

function renderQueue(patients) {
    var queueDiv = document.getElementById('patientsQueue');
    queueDiv.innerHTML = '';
    
    var activePatients = [];
    for (var j = 0; j < patients.length; j++) { 
        if (patients[j].data.status === 'waiting' || patients[j].data.status === 'serving') activePatients.push(patients[j]); 
    }
    
    if (activePatients.length === 0) {
        queueDiv.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + t('no_patients') + '</p>';
        return;
    }
    
    for (var k = 0; k < activePatients.length; k++) {
        var p = activePatients[k];
        var isServing = p.data.status === 'serving';
        var statusClass = isServing ? 'serving' : '';
        var statusText = isServing ? t('status_serving') : t('status_waiting_admin');
        
        queueDiv.innerHTML += '<div class="queue-item ' + statusClass + '">' +
            '<div class="patient-info">' +
            '<h4>' + p.data.patientName + '</h4>' +
            '<p><i class="fa-solid fa-phone"></i> ' + p.data.patientPhone + ' - <span style="color:var(--primary); font-weight:bold;">' + statusText + '</span></p>' +
            '</div>' +
            '<div class="ticket-num">' + p.data.ticketNumber + '</div>' +
            '</div>';
    }
}

function callNextPatient() {
    if (!selectedClinicId || !currentAdminDate) return;
    if (!currentIsOpen) { if(!confirm(currentLang === 'ar' ? "العيادة مغلقة حالياً. هل تريد فتحها؟" : "Clinic is closed. Open?")) return; toggleClinicStatus(); }
    
    var dayDocId = selectedClinicId + "_" + currentAdminDate;
    var dayRef = db.collection("doctor_days").doc(dayDocId);
    
    dayRef.get().then(function(daySnap) {
        var currentServing = daySnap.exists ? (daySnap.data().currentServing || 0) : 0;
        var lastTicket = daySnap.exists ? (daySnap.data().lastTicket || 0) : 0;
        
        if (lastTicket === 0 || currentServing >= lastTicket) {
            return alert(t('no_patients'));
        }
        
        var nextServing = currentServing + 1;
        
        dayRef.update({ currentServing: nextServing }).then(function() {
            db.collection("bookings")
                .where("doctorId", "==", selectedClinicId)
                .where("bookingDate", "==", currentAdminDate)
                .where("ticketNumber", "==", nextServing)
                .get().then(function(snapshot) {
                    snapshot.forEach(function(doc) {
                        db.collection("bookings").doc(doc.id).update({ status: 'serving' });
                    });
                });
                
            if (currentServing > 0) {
                db.collection("bookings")
                .where("doctorId", "==", selectedClinicId)
                .where("bookingDate", "==", currentAdminDate)
                .where("ticketNumber", "==", currentServing)
                .get().then(function(snapshot) {
                    snapshot.forEach(function(doc) {
                        db.collection("bookings").doc(doc.id).update({ status: 'done' });
                    });
                });
            }
        });
    });
}

function resetClinic() {
    if (!selectedClinicId || !currentAdminDate) return;
    if(!confirm(currentLang === 'ar' ? "هل أنت متأكد من مسح كل حجوزات هذا اليوم والبدء من جديد؟" : "Are you sure you want to reset today's bookings?")) return;
    
    var dayDocId = selectedClinicId + "_" + currentAdminDate;
    var dayRef = db.collection("doctor_days").doc(dayDocId);
    
    dayRef.set({ lastTicket: 0, currentServing: 0 }, { merge: true }).then(function() {
        db.collection("bookings")
        .where("doctorId", "==", selectedClinicId)
        .where("bookingDate", "==", currentAdminDate)
        .where("status", "in", ["waiting", "serving"]).get().then(function(snapshot) {
            var batch = db.batch();
            snapshot.forEach(function(doc) { batch.update(doc.ref, { status: 'cancelled' }); });
            batch.commit().then(function() { alert(currentLang === 'ar' ? "تم التصفير." : "Reset done."); });
        });
    });
}

function logoutDoctor() { auth.signOut().then(function() { window.location.href = 'index.html'; }); }

// --- إضافة عيادة جديدة ---
function openAddClinicModal() {
    document.getElementById('addClinicModal').classList.remove('hidden');
    setTimeout(initAddMap, 300);
}
function closeAddClinicModal() { document.getElementById('addClinicModal').classList.add('hidden'); }

function initAddMap() {
    if (!document.getElementById('add-map')) return;
    if (addMap) { addMap.invalidateSize(); return; }
    var defaultLat = 15.3694;
    var defaultLng = 44.1910;
    addMap = L.map('add-map').setView([defaultLat, defaultLng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(addMap);
    addMap.on('click', function(e) {
        document.getElementById('addLat').value = e.latlng.lat;
        document.getElementById('addLng').value = e.latlng.lng;
        if (addMarker) addMarker.setLatLng(e.latlng);
        else addMarker = L.marker(e.latlng).addTo(addMap);
    });
}

function saveNewClinic() {
    var clinicName = document.getElementById('addClinicName').value.trim();
    var city = document.getElementById('addCity').value.trim();
    var street = document.getElementById('addStreet').value.trim();
    var landmark = document.getElementById('addLandmark').value.trim();
    var startTime = document.getElementById('addStartTime').value;
    var endTime = document.getElementById('addEndTime').value;
    var serviceTime = document.getElementById('addServiceTime').value;
    var lat = document.getElementById('addLat').value;
    var lng = document.getElementById('addLng').value;
    
    var workingDays = [];
    for (var i = 0; i <= 6; i++) {
        var cb = document.getElementById('add_day_' + i);
        if (cb && cb.checked) workingDays.push(i);
    }

    if (!clinicName || !city || !lat || !lng) return alert(currentLang === 'ar' ? "أكمل البيانات وحدد الموقع!" : "Complete data and select location!");
    if (workingDays.length === 0) return alert(currentLang === 'ar' ? "حدد يوم عمل واحد على الأقل!" : "Select at least one working day!");

    if (!currentDoctorData) return;

    db.collection("doctors").add({ 
        ownerUid: auth.currentUser.uid, 
        email: auth.currentUser.email, 
        name: currentDoctorData.name, 
        specialty: currentDoctorData.specialty, 
        phone: currentDoctorData.phone, 
        clinicName: clinicName,
        address: { city: city, street: street, landmark: landmark }, 
        location: { lat: Number(lat), lng: Number(lng) },
        serviceTime: Number(serviceTime), startTime: startTime, endTime: endTime, 
        workingDays: workingDays,
        createdAt: new Date().toISOString() 
    }).then(function() {
        alert(currentLang === 'ar' ? "تمت إضافة العيادة!" : "Clinic added!");
        closeAddClinicModal();
    }).catch(function(err) {
        alert("Error: " + err.message);
    });
}

// --- تعديل العيادة ---
function openEditClinicModal() {
    if (!currentDoctorData) return;
    
    document.getElementById('editClinicName').value = currentDoctorData.clinicName || '';
    document.getElementById('editCity').value = (currentDoctorData.address && currentDoctorData.address.city) ? currentDoctorData.address.city : '';
    document.getElementById('editStreet').value = (currentDoctorData.address && currentDoctorData.address.street) ? currentDoctorData.address.street : '';
    document.getElementById('editLandmark').value = (currentDoctorData.address && currentDoctorData.address.landmark) ? currentDoctorData.address.landmark : '';
    document.getElementById('editStartTime').value = currentDoctorData.startTime || '09:00';
    document.getElementById('editEndTime').value = currentDoctorData.endTime || '17:00';
    document.getElementById('editServiceTime').value = currentDoctorData.serviceTime || 10;
    document.getElementById('editLat').value = (currentDoctorData.location && currentDoctorData.location.lat) ? currentDoctorData.location.lat : '';
    document.getElementById('editLng').value = (currentDoctorData.location && currentDoctorData.location.lng) ? currentDoctorData.location.lng : '';
    
    var workingDays = currentDoctorData.workingDays || [];
    for (var i = 0; i <= 6; i++) {
        var cb = document.getElementById('edit_day_' + i);
        if (cb) cb.checked = workingDays.indexOf(i) > -1;
    }
    
    document.getElementById('editClinicModal').classList.remove('hidden');
    setTimeout(initEditMap, 300);
}

function closeEditClinicModal() { document.getElementById('editClinicModal').classList.add('hidden'); }

function initEditMap() {
    if (!document.getElementById('edit-map')) return;
    
    var lat = Number(document.getElementById('editLat').value) || 15.3694;
    var lng = Number(document.getElementById('editLng').value) || 44.1910;
    
    if (!editMap) {
        editMap = L.map('edit-map').setView([lat, lng], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(editMap);
        
        editMap.on('click', function(e) {
            document.getElementById('editLat').value = e.latlng.lat;
            document.getElementById('editLng').value = e.latlng.lng;
            if (editMarker) editMarker.setLatLng(e.latlng);
            else editMarker = L.marker(e.latlng).addTo(editMap);
        });
    } else {
        editMap.setView([lat, lng], 13);
        editMap.invalidateSize();
    }
    
    // إضافة/تحديث الدبوس
    if (document.getElementById('editLat').value) {
        var latlng = L.latLng(lat, lng);
        if (editMarker) editMarker.setLatLng(latlng);
        else editMarker = L.marker(latlng).addTo(editMap);
    }
}

function saveEditClinic() {
    var clinicName = document.getElementById('editClinicName').value.trim();
    var city = document.getElementById('editCity').value.trim();
    var street = document.getElementById('editStreet').value.trim();
    var landmark = document.getElementById('editLandmark').value.trim();
    var startTime = document.getElementById('editStartTime').value;
    var endTime = document.getElementById('editEndTime').value;
    var serviceTime = document.getElementById('editServiceTime').value;
    var lat = document.getElementById('editLat').value;
    var lng = document.getElementById('editLng').value;
    
    var workingDays = [];
    for (var i = 0; i <= 6; i++) {
        var cb = document.getElementById('edit_day_' + i);
        if (cb && cb.checked) workingDays.push(i);
    }

    if (!clinicName || !city || !lat || !lng) return alert(currentLang === 'ar' ? "أكمل البيانات وحدد الموقع!" : "Complete data and select location!");
    if (workingDays.length === 0) return alert(currentLang === 'ar' ? "حدد يوم عمل واحد على الأقل!" : "Select at least one working day!");

    db.collection("doctors").doc(selectedClinicId).update({ 
        clinicName: clinicName,
        address: { city: city, street: street, landmark: landmark }, 
        location: { lat: Number(lat), lng: Number(lng) },
        serviceTime: Number(serviceTime), startTime: startTime, endTime: endTime, 
        workingDays: workingDays
    }).then(function() {
        alert(currentLang === 'ar' ? "تم حفظ التعديلات!" : "Changes saved!");
        closeEditClinicModal();
    }).catch(function(err) {
        alert("Error: " + err.message);
    });
}
