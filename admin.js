var firebaseConfig = {
    apiKey: "AIzaSyBupRlote48_0GtaelL_a13uYUfFPhCWbE", authDomain: "douri-app-63918.firebaseapp.com",
    projectId: "douri-app-63918", storageBucket: "douri-app-63918.firebasestorage.app",
    messagingSenderId: "653080780726", appId: "1:653080780726:web:4f2b3421b905e65af9ab17"
};
firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();
var auth = firebase.auth();

var selectedDoctorId = null;
var currentDoctorData = null;
var currentIsOpen = true;
var currentAdminDate = ""; // التاريخ المختار في لوحة التحكم
var queueListener = null;

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
        initAdminPanel(user.uid); 
        
        // ضبط التاريخ الافتراضي في التقويم لليوم
        currentAdminDate = getTodayString();
        document.getElementById('adminDate').value = currentAdminDate;
    }
    else { window.location.href = 'index.html'; }
});

function changeAdminDate() {
    currentAdminDate = document.getElementById('adminDate').value;
    if (currentAdminDate) {
        listenToQueue();
        listenToDayCounters();
    }
}

function initAdminPanel(uid) {
    db.collection("doctors").where("ownerUid", "==", uid).limit(1).onSnapshot(function(snapshot) {
        if (!snapshot.empty) {
            var doc = snapshot.docs[0];
            selectedDoctorId = doc.id;
            currentDoctorData = doc.data();
            currentIsOpen = currentDoctorData.isOpen !== false;
            
            var start = currentDoctorData.startTime || '09:00';
            var end = currentDoctorData.endTime || '17:00';
            document.getElementById('activeDoctorName').innerText = currentDoctorData.name + " (" + currentDoctorData.specialty + ") | " + start + " - " + end;
            
            updateClinicStatusUI();
            
            // إذا كان التاريخ محدد مسبقاً
            if (!currentAdminDate) {
                currentAdminDate = getTodayString();
                document.getElementById('adminDate').value = currentAdminDate;
            }
            
            listenToQueue();
            listenToDayCounters();
        } else {
            document.getElementById('activeDoctorName').innerText = currentLang === 'ar' ? "لم تقم بتسجيل عيادة بعد" : "Clinic not registered yet";
            document.getElementById('patientsQueue').innerHTML = '<p style="text-align:center; color:var(--primary);">' + (currentLang === 'ar' ? 'يرجى الخروج وتسجيل عيادة جديدة.' : 'Please logout and register a clinic.') + '</p>';
        }
    });
}

function updateClinicStatusUI() {
    var btn = document.getElementById('toggleClinicBtn');
    if (currentIsOpen) { btn.className = 'status-toggle-btn status-open'; btn.innerHTML = '<i class="fa-solid fa-lock"></i> ' + t('close_clinic'); }
    else { btn.className = 'status-toggle-btn status-closed'; btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> ' + t('open_clinic'); }
}

function toggleClinicStatus() {
    if (!selectedDoctorId) return;
    currentIsOpen = !currentIsOpen;
    db.collection("doctors").doc(selectedDoctorId).update({ isOpen: currentIsOpen }).then(function() { updateClinicStatusUI(); });
}

var dayCounterListener = null;
function listenToDayCounters() {
    if (!selectedDoctorId || !currentAdminDate) return;
    
    if (dayCounterListener) dayCounterListener();
    
    var dayDocId = selectedDoctorId + "_" + currentAdminDate;
    dayCounterListener = db.collection("doctor_days").doc(dayDocId).onSnapshot(function(doc) {
        if (doc.exists) {
            document.getElementById('currentServingDisplay').innerText = doc.data().currentServing || '-';
        } else {
            document.getElementById('currentServingDisplay').innerText = '-';
        }
    });
}

function listenToQueue() {
    if (!selectedDoctorId || !currentAdminDate) return;
    if (queueListener) queueListener();
    
    queueListener = db.collection("bookings")
        .where("doctorId", "==", selectedDoctorId)
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
    if (!selectedDoctorId || !currentAdminDate) return;
    if (!currentIsOpen) { if(!confirm(currentLang === 'ar' ? "العيادة مغلقة حالياً. هل تريد فتحها؟" : "Clinic is closed. Open?")) return; toggleClinicStatus(); }
    
    var dayDocId = selectedDoctorId + "_" + currentAdminDate;
    var dayRef = db.collection("doctor_days").doc(dayDocId);
    
    dayRef.get().then(function(daySnap) {
        var currentServing = daySnap.exists ? (daySnap.data().currentServing || 0) : 0;
        var lastTicket = daySnap.exists ? (daySnap.data().lastTicket || 0) : 0;
        
        if (lastTicket === 0 || currentServing >= lastTicket) {
            return alert(t('no_patients'));
        }
        
        var nextServing = currentServing + 1;
        
        dayRef.update({ currentServing: nextServing }).then(function() {
            // تحديث حالة المريض الحالي إلى serving
            db.collection("bookings")
                .where("doctorId", "==", selectedDoctorId)
                .where("bookingDate", "==", currentAdminDate)
                .where("ticketNumber", "==", nextServing)
                .get().then(function(snapshot) {
                    snapshot.forEach(function(doc) {
                        db.collection("bookings").doc(doc.id).update({ status: 'serving' });
                    });
                });
                
            // تحديث حالة المريض السابق إلى done
            if (currentServing > 0) {
                db.collection("bookings")
                .where("doctorId", "==", selectedDoctorId)
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
    if (!selectedDoctorId || !currentAdminDate) return;
    if(!confirm(currentLang === 'ar' ? "هل أنت متأكد من مسح كل حجوزات هذا اليوم والبدء من جديد؟" : "Are you sure you want to reset today's bookings?")) return;
    
    var dayDocId = selectedDoctorId + "_" + currentAdminDate;
    var dayRef = db.collection("doctor_days").doc(dayDocId);
    
    dayRef.set({ lastTicket: 0, currentServing: 0 }, { merge: true }).then(function() {
        db.collection("bookings")
        .where("doctorId", "==", selectedDoctorId)
        .where("bookingDate", "==", currentAdminDate)
        .where("status", "in", ["waiting", "serving"]).get().then(function(snapshot) {
            var batch = db.batch();
            snapshot.forEach(function(doc) { batch.update(doc.ref, { status: 'cancelled' }); });
            batch.commit().then(function() { alert(currentLang === 'ar' ? "تم التصفير." : "Reset done."); });
        });
    });
}

function logoutDoctor() { auth.signOut().then(function() { window.location.href = 'index.html'; }); }
