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
            snapshot.forEach(function(doc) { myClinics.push({ id: doc.id, data: doc.data() }); });
            
            if (myClinics.length > 0) {
                autoSelectClinic();
                initAdminPanel();
            } else {
                document.getElementById('activeDoctorName').innerText = "لم تقم بتسجيل عيادة بعد";
                document.getElementById('patientsQueue').innerHTML = '<p style="text-align:center; color:var(--primary);">يرجى الخروج وتسجيل عيادة جديدة.</p>';
            }
        });
    } else { window.location.href = 'index.html'; }
});

function autoSelectClinic() {
    var now = new Date();
    var todayDay = now.getDay(); 
    var currentTimeStr = String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');

    var bestClinic = myClinics[0]; 
    for (var i = 0; i < myClinics.length; i++) {
        var c = myClinics[i].data;
        var worksToday = c.workingDays && c.workingDays.indexOf(todayDay) > -1;
        var inTime = currentTimeStr >= (c.startTime || '00:00') && currentTimeStr <= (c.endTime || '23:59');
        
        if (worksToday && inTime) {
            bestClinic = myClinics[i];
            break; 
        }
    }
    selectedClinicId = bestClinic.id;
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
        if (myClinics[i].id === selectedClinicId) { currentDoctorData = myClinics[i].data; break; }
    }
    if (!currentDoctorData) return;
    currentIsOpen = currentDoctorData.isOpen !== false;
    var start = currentDoctorData.startTime || '09:00';
    var end = currentDoctorData.endTime || '17:00';
    document.getElementById('activeDoctorName').innerText = currentDoctorData.name + " | " + currentDoctorData.clinicName + " | " + start + " - " + end;
    
    updateClinicStatusUI(); listenToQueue(); listenToDayCounters();
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
            if (myClinics[i].id === selectedClinicId) { myClinics[i].data.isOpen = currentIsOpen; break; }
        }
    });
}

function listenToDayCounters() {
    if (!selectedClinicId || !currentAdminDate) return;
    if (dayCounterListener) dayCounterListener();
    var dayDocId = selectedClinicId + "_" + currentAdminDate;
    dayCounterListener = db.collection("doctor_days").doc(dayDocId).onSnapshot(function(doc) {
        if (doc.exists) { document.getElementById('currentServingDisplay').innerText = doc.data().currentServing || '-'; }
        else { document.getElementById('currentServingDisplay').innerText = '-'; }
    });
}

function listenToQueue() {
    if (!selectedClinicId || !currentAdminDate) return;
    if (queueListener) queueListener();
    queueListener = db.collection("bookings").where("doctorId", "==", selectedClinicId).where("bookingDate", "==", currentAdminDate)
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
        queueDiv.innerHTML += '<div class="queue-item ' + statusClass + '"><div class="patient-info"><h4>' + p.data.patientName + '</h4><p><i class="fa-solid fa-phone"></i> ' + p.data.patientPhone + ' - <span style="color:var(--primary); font-weight:bold;">' + statusText + '</span></p></div><div class="ticket-num">' + p.data.ticketNumber + '</div></div>';
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
        if (lastTicket === 0 || currentServing >= lastTicket) { return alert(t('no_patients')); }
        var nextServing = currentServing + 1;
        dayRef.update({ currentServing: nextServing }).then(function() {
            db.collection("bookings").where("doctorId", "==", selectedClinicId).where("bookingDate", "==", currentAdminDate).where("ticketNumber", "==", nextServing).get().then(function(snapshot) {
                snapshot.forEach(function(doc) { db.collection("bookings").doc(doc.id).update({ status: 'serving' }); });
            });
            if (currentServing > 0) {
                db.collection("bookings").where("doctorId", "==", selectedClinicId).where("bookingDate", "==", currentAdminDate).where("ticketNumber", "==", currentServing).get().then(function(snapshot) {
                    snapshot.forEach(function(doc) { db.collection("bookings").doc(doc.id).update({ status: 'done' }); });
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
        db.collection("bookings").where("doctorId", "==", selectedClinicId).where("bookingDate", "==", currentAdminDate).where("status", "in", ["waiting", "serving"]).get().then(function(snapshot) {
            var batch = db.batch();
            snapshot.forEach(function(doc) { batch.update(doc.ref, { status: 'cancelled' }); });
            batch.commit().then(function() { alert(currentLang === 'ar' ? "تم التصفير." : "Reset done."); });
        });
    });
}

// 🟢 تم تحديث دالة الخروج لتكون فورية
function logoutDoctor() {
    // مسح الجلسة المحلية فوراً
    localStorage.removeItem('douri_saved_email');
    
    // إجبار المتصفح على الانتقال للصفحة الرئيسية
    window.location.replace('index.html');
    
    // تسجيل الخروج من Firebase في الخلفية (حتى لو تأخر الاتصال)
    try {
        auth.signOut();
    } catch (e) {
        console.log(e);
    }
}

// تصدير الدالة للنافذة (للتأكد من عمل زر الخروج)
window.logoutDoctor = logoutDoctor;
