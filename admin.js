var firebaseConfig = {
    apiKey: "AIzaSyBupRlote48_0GtaelL_a13uYUfFPhCWbE", authDomain: "douri-app-63918.firebaseapp.com",
    projectId: "douri-app-63918", storageBucket: "douri-app-63918.firebasestorage.app",
    messagingSenderId: "653080780726", appId: "1:653080780726:web:4f2b3421b905e65af9ab17"
};
firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();
var auth = firebase.auth();

var translations = {
    ar: { 
        admin_title: "لوحة تحكم العيادة", current_patient: "المريض الحالي (الذي عند الطبيب)", call_next: "نادِ المريض التالي", 
        close_clinic: "إغلاق العيادة", open_clinic: "فتح العيادة", reset_clinic: "تصفير العيادة", 
        queue_title: "طابور الانتظار", no_patients: "لا يوجد مرضى في الانتظار حالياً.", status_serving: "عند الطبيب الآن", 
        status_waiting_admin: "في الانتظار", hours_label: "ساعات العمل:"
    },
    en: { 
        admin_title: "Clinic Dashboard", current_patient: "Current Patient (with Doctor)", call_next: "Call Next Patient", 
        close_clinic: "Close Clinic", open_clinic: "Open Clinic", reset_clinic: "Reset Clinic", 
        queue_title: "Waiting Queue", no_patients: "No patients in queue.", status_serving: "With Doctor", 
        status_waiting_admin: "Waiting", hours_label: "Hours:"
    }
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
    document.title = dict.admin_title;
}
function toggleLanguage() { currentLang = currentLang === 'ar' ? 'en' : 'ar'; localStorage.setItem('douri_lang', currentLang); window.location.reload(); }
function t(key) { return translations[currentLang] && translations[currentLang][key] ? translations[currentLang][key] : key; }

var selectedDoctorId = null;
var currentDoctorData = null;
var currentIsOpen = true;

auth.onAuthStateChanged(function(user) {
    if (user) { applyLanguage(); initAdminPanel(user.uid); }
    else { window.location.href = 'index.html'; }
});

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
            listenToQueue();
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

function listenToQueue() {
    db.collection("bookings").where("doctorId", "==", selectedDoctorId).onSnapshot(function(snapshot) {
        var patients = [];
        snapshot.forEach(function(doc) { patients.push({ id: doc.id, data: doc.data() }); });
        patients.sort(function(a, b) { return a.data.ticketNumber - b.data.ticketNumber; });
        renderQueue(patients);
    });
}

function renderQueue(patients) {
    var queueDiv = document.getElementById('patientsQueue');
    queueDiv.innerHTML = '';
    var servingPatient = null;
    for (var i = 0; i < patients.length; i++) { if (patients[i].data.status === 'serving') servingPatient = patients[i]; }
    
    document.getElementById('currentServingDisplay').innerText = servingPatient ? servingPatient.data.ticketNumber : '-';
    
    var activePatients = [];
    for (var j = 0; j < patients.length; j++) { if (patients[j].data.status === 'waiting' || patients[j].data.status === 'serving') activePatients.push(patients[j]); }
    
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
    if (!selectedDoctorId) return;
    if (!currentIsOpen) { if(!confirm(currentLang === 'ar' ? "العيادة مغلقة حالياً. هل تريد فتحها؟" : "Clinic is closed. Open?")) return; toggleClinicStatus(); }
    
    db.collection("bookings").where("doctorId", "==", selectedDoctorId).where("status", "in", ["waiting", "serving"]).get().then(function(snapshot) {
        var patients = [];
        snapshot.forEach(function(doc) { patients.push({ id: doc.id, data: doc.data() }); });
        patients.sort(function(a, b) { return a.data.ticketNumber - b.data.ticketNumber; });
        
        if (patients.length === 0) return alert(t('no_patients'));
        
        var currentServing = null;
        for (var i = 0; i < patients.length; i++) { if (patients[i].data.status === 'serving') currentServing = patients[i]; }
        if (currentServing) db.collection("bookings").doc(currentServing.id).update({ status: 'done' });
        
        var nextPatient = null;
        for (var j = 0; j < patients.length; j++) { if (patients[j].data.status === 'waiting') { nextPatient = patients[j]; break; } }
        
        if (nextPatient) {
            db.collection("bookings").doc(nextPatient.id).update({ status: 'serving' });
            db.collection("doctors").doc(selectedDoctorId).update({ currentServing: nextPatient.data.ticketNumber });
        } else {
            db.collection("doctors").doc(selectedDoctorId).update({ currentServing: 0 });
        }
    });
}

function resetClinic() {
    if (!selectedDoctorId) return;
    if(!confirm(currentLang === 'ar' ? "هل أنت متأكد من مسح كل الحجوزات والبدء من جديد؟" : "Are you sure you want to reset all?")) return;
    
    db.collection("doctors").doc(selectedDoctorId).update({ lastTicket: 0, currentServing: 0 }).then(function() {
        db.collection("bookings").where("doctorId", "==", selectedDoctorId).where("status", "in", ["waiting", "serving"]).get().then(function(snapshot) {
            var batch = db.batch();
            snapshot.forEach(function(doc) { batch.update(doc.ref, { status: 'cancelled' }); });
            batch.commit().then(function() { alert(currentLang === 'ar' ? "تم التصفير." : "Reset done."); });
        });
    });
}

function logoutDoctor() { auth.signOut().then(function() { window.location.href = 'index.html'; }); }
