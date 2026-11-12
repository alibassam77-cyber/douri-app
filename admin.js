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

auth.onAuthStateChanged(function(user) {
    if (user) { initAdminPanel(user.uid); }
    else { window.location.href = 'index.html'; }
});

function initAdminPanel(uid) {
    db.collection("doctors").where("ownerUid", "==", uid).limit(1).onSnapshot(function(snapshot) {
        if (!snapshot.empty) {
            var doc = snapshot.docs[0];
            selectedDoctorId = doc.id;
            currentDoctorData = doc.data();
            currentIsOpen = currentDoctorData.isOpen !== false;

            document.getElementById('activeDoctorName').innerText = currentDoctorData.name + " (" + currentDoctorData.specialty + ") | " + (currentDoctorData.startTime || '09:00') + " - " + (currentDoctorData.endTime || '17:00');
            updateClinicStatusUI();
            listenToQueue();
        } else {
            document.getElementById('activeDoctorName').innerText = "لم تقم بتسجيل عيادة بعد";
            document.getElementById('patientsQueue').innerHTML = '<p style="text-align:center; color:var(--primary);">يرجى الخروج وتسجيل عيادة جديدة.</p>';
        }
    });
}

function updateClinicStatusUI() {
    var btn = document.getElementById('toggleClinicBtn');
    if (currentIsOpen) { btn.className = 'status-toggle-btn status-open'; btn.innerHTML = '<i class="fa-solid fa-lock"></i> إغلاق العيادة'; }
    else { btn.className = 'status-toggle-btn status-closed'; btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> فتح العيادة'; }
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
        queueDiv.innerHTML = '<p style="text-align:center; color:var(--text-muted);">لا يوجد مرضى في الانتظار حالياً.</p>';
        return;
    }
    
    for (var k = 0; k < activePatients.length; k++) {
        var p = activePatients[k];
        var isServing = p.data.status === 'serving';
        var statusClass = isServing ? 'serving' : '';
        var statusText = isServing ? 'عند الطبيب الآن' : 'في الانتظار';
        
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
    if (!currentIsOpen) { if(!confirm("العيادة مغلقة حالياً. هل تريد فتحها؟")) return; toggleClinicStatus(); }
    
    db.collection("bookings").where("doctorId", "==", selectedDoctorId).where("status", "in", ["waiting", "serving"]).get().then(function(snapshot) {
        var patients = [];
        snapshot.forEach(function(doc) { patients.push({ id: doc.id, data: doc.data() }); });
        patients.sort(function(a, b) { return a.data.ticketNumber - b.data.ticketNumber; });
        
        if (patients.length === 0) return alert("لا يوجد مرضى في الانتظار!");
        
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
    if(!confirm("هل أنت متأكد من مسح كل الحجوزات والبدء من جديد؟")) return;
    
    db.collection("doctors").doc(selectedDoctorId).update({ lastTicket: 0, currentServing: 0 }).then(function() {
        db.collection("bookings").where("doctorId", "==", selectedDoctorId).where("status", "in", ["waiting", "serving"]).get().then(function(snapshot) {
            var batch = db.batch();
            snapshot.forEach(function(doc) { batch.update(doc.ref, { status: 'cancelled' }); });
            batch.commit().then(function() { alert("تم التصفير."); });
        });
    });
}

function logoutDoctor() { auth.signOut().then(function() { window.location.href = 'index.html'; }); }
