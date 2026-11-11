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

let selectedDoctorId = null;
let currentDoctorData = null;
let currentIsOpen = true;

// التحقق من تسجيل الدخول
auth.onAuthStateChanged((user) => {
    if (user) {
        initAdminPanel(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});

function initAdminPanel(uid) {
    db.collection("doctors").where("ownerUid", "==", uid).limit(1).onSnapshot((snapshot) => {
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            selectedDoctorId = doc.id;
            currentDoctorData = doc.data();
            currentIsOpen = currentDoctorData.isOpen !== false;

            document.getElementById('activeDoctorName').innerText = currentDoctorData.name + " (" + currentDoctorData.specialty + ")";
            updateClinicStatusUI();
            listenToQueue();
        } else {
            document.getElementById('activeDoctorName').innerText = "لم تقم بتسجيل عيادة بعد";
            document.getElementById('patientsQueue').innerHTML = '<p style="text-align:center; color:var(--primary);">يرجى الخروج وتسجيل عيادة جديدة.</p>';
        }
    });
}

function updateClinicStatusUI() {
    let btn = document.getElementById('toggleClinicBtn');
    if (currentIsOpen) {
        btn.className = 'status-toggle-btn status-open';
        btn.innerHTML = '<i class="fa-solid fa-lock"></i> إغلاق العيادة (استراحة)';
    } else {
        btn.className = 'status-toggle-btn status-closed';
        btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> فتح العيادة للاستقبال';
    }
}

async function toggleClinicStatus() {
    if (!selectedDoctorId) return;
    try {
        currentIsOpen = !currentIsOpen;
        await db.collection("doctors").doc(selectedDoctorId).update({ isOpen: currentIsOpen });
        updateClinicStatusUI();
    } catch (error) { console.error(error); }
}

function listenToQueue() {
    db.collection("bookings").where("doctorId", "==", selectedDoctorId).onSnapshot((snapshot) => {
        let patients = [];
        snapshot.forEach(doc => patients.push({ id: doc.id, ...doc.data() }));
        patients.sort((a, b) => a.ticketNumber - b.ticketNumber);
        renderQueue(patients);
    });
}

function renderQueue(patients) {
    let queueDiv = document.getElementById('patientsQueue');
    queueDiv.innerHTML = '';
    let servingPatient = patients.find(p => p.status === 'serving');
    document.getElementById('currentServingDisplay').innerText = servingPatient ? servingPatient.ticketNumber : '-';
    let activePatients = patients.filter(p => p.status === 'waiting' || p.status === 'serving');
    
    if (activePatients.length === 0) {
        queueDiv.innerHTML = '<p style="text-align:center; color:var(--text-muted);">لا يوجد مرضى في الانتظار حالياً.</p>';
        return;
    }
    activePatients.forEach(p => {
        let statusClass = p.status === 'serving' ? 'serving' : '';
        let statusText = p.status === 'serving' ? 'عند الطبيب الآن' : 'في الانتظار';
        queueDiv.innerHTML += `
            <div class="queue-item ${statusClass}">
                <div class="patient-info"><h4>${p.patientName}</h4><p><i class="fa-solid fa-phone"></i> ${p.patientPhone} - <span style="color:var(--primary); font-weight:bold;">${statusText}</span></p></div>
                <div class="ticket-num">${p.ticketNumber}</div>
            </div>`;
    });
}

async function callNextPatient() {
    if (!selectedDoctorId) return;
    if (!currentIsOpen) {
        if(!confirm("العيادة مغلقة حالياً. هل تريد فتحها؟")) return;
        toggleClinicStatus();
    }
    try {
        let snapshot = await db.collection("bookings").where("doctorId", "==", selectedDoctorId).where("status", "in", ["waiting", "serving"]).get();
        let patients = [];
        snapshot.forEach(doc => patients.push({ id: doc.id, ...doc.data() }));
        patients.sort((a, b) => a.ticketNumber - b.ticketNumber);
        if (patients.length === 0) return alert("لا يوجد مرضى في الانتظار!");

        let currentServing = patients.find(p => p.status === 'serving');
        if (currentServing) await db.collection("bookings").doc(currentServing.id).update({ status: 'done' });

        let nextPatient = patients.find(p => p.status === 'waiting');
        if (nextPatient) {
            await db.collection("bookings").doc(nextPatient.id).update({ status: 'serving' });
            await db.collection("doctors").doc(selectedDoctorId).update({ currentServing: nextPatient.ticketNumber });
        } else {
            await db.collection("doctors").doc(selectedDoctorId).update({ currentServing: 0 });
        }
    } catch (error) { console.error(error); }
}

async function resetClinic() {
    if (!selectedDoctorId) return;
    if(!confirm("هل أنت متأكد من مسح كل الحجوزات والبدء من جديد؟")) return;
    try {
        await db.collection("doctors").doc(selectedDoctorId).update({ lastTicket: 0, currentServing: 0 });
        let snapshot = await db.collection("bookings").where("doctorId", "==", selectedDoctorId).where("status", "in", ["waiting", "serving"]).get();
        let batch = db.batch();
        snapshot.forEach(doc => batch.update(doc.ref, { status: 'cancelled' }));
        await batch.commit();
        alert("تم التصفير.");
    } catch (error) { console.error(error); }
}

function logoutDoctor() {
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    });
}
