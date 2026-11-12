const firebaseConfig = {
    apiKey: "AIzaSyBupRlote48_0GtaelL_a13uYUfFPhCWbE", authDomain: "douri-app-63918.firebaseapp.com",
    projectId: "douri-app-63918", storageBucket: "douri-app-63918.firebasestorage.app",
    messagingSenderId: "653080780726", appId: "1:653080780726:web:4f2b3421b905e65af9ab17"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(); const auth = firebase.auth();
let selectedDoctorId = null; let currentDoctorData = null; let currentIsOpen = true;
auth.onAuthStateChanged((user) => {
    if (user) {
        if (typeof applyLanguage === 'function') applyLanguage();
        initAdminPanel(user.uid);
    } else { window.location.href = 'index.html'; }
});
function initAdminPanel(uid) {
    db.collection("doctors").where("ownerUid", "==", uid).limit(1).onSnapshot((snapshot) => {
        if (!snapshot.empty) {
            const doc = snapshot.docs[0]; selectedDoctorId = doc.id; currentDoctorData = doc.data(); currentIsOpen = currentDoctorData.isOpen !== false;
            document.getElementById('activeDoctorName').innerText = currentDoctorData.name + " (" + currentDoctorData.specialty + ")";
            updateClinicStatusUI(); listenToQueue();
        } else {
            document.getElementById('activeDoctorName').innerText = currentLang === 'ar' ? "لم تقم بتسجيل عيادة بعد" : "Clinic not registered yet";
            document.getElementById('patientsQueue').innerHTML = `<p style="text-align:center; color:var(--primary);">${currentLang === 'ar' ? 'يرجى الخروج وتسجيل عيادة جديدة.' : 'Please logout and register a new clinic.'}</p>`;
        }
    });
}
function updateClinicStatusUI() {
    let btn = document.getElementById('toggleClinicBtn');
    if (currentIsOpen) { btn.className = 'status-toggle-btn status-open'; btn.innerHTML = `<i class="fa-solid fa-lock"></i> ${t('close_clinic')}`; }
    else { btn.className = 'status-toggle-btn status-closed'; btn.innerHTML = `<i class="fa-solid fa-lock-open"></i> ${t('open_clinic')}`; }
}
async function toggleClinicStatus() {
    if (!selectedDoctorId) return;
    try { currentIsOpen = !currentIsOpen; await db.collection("doctors").doc(selectedDoctorId).update({ isOpen: currentIsOpen }); updateClinicStatusUI(); } catch (error) { console.error(error); }
}
function listenToQueue() {
    db.collection("bookings").where("doctorId", "==", selectedDoctorId).onSnapshot((snapshot) => {
        let patients = []; snapshot.forEach(doc => patients.push({ id: doc.id, ...doc.data() })); patients.sort((a, b) => a.ticketNumber - b.ticketNumber); renderQueue(patients);
    });
}
function renderQueue(patients) {
    let queueDiv = document.getElementById('patientsQueue'); queueDiv.innerHTML = '';
    let servingPatient = patients.find(p => p.status === 'serving');
    document.getElementById('currentServingDisplay').innerText = servingPatient ? servingPatient.ticketNumber : '-';
    let activePatients = patients.filter(p => p.status === 'waiting' || p.status === 'serving');
    if (activePatients.length === 0) { queueDiv.innerHTML = `<p style="text-align:center; color:var(--text-muted);">${t('no_patients')}</p>`; return; }
    activePatients.forEach(p => {
        let statusClass = p.status === 'serving' ? 'serving' : '';
        let statusText = p.status === 'serving' ? t('status_serving') : t('status_waiting_admin');
        queueDiv.innerHTML += `<div class="queue-item ${statusClass}"><div class="patient-info"><h4>${p.patientName}</h4><p><i class="fa-solid fa-phone"></i> ${p.patientPhone} - <span style="color:var(--primary); font-weight:bold;">${statusText}</span></p></div><div class="ticket-num">${p.ticketNumber}</div></div>`;
    });
}
async function callNextPatient() {
    if (!selectedDoctorId) return;
    if (!currentIsOpen) { if(!confirm(currentLang === 'ar' ? "العيادة مغلقة حالياً. هل تريد فتحها؟" : "Clinic is closed. Open it?")) return; toggleClinicStatus(); }
    try {
        let snapshot = await db.collection("bookings").where("doctorId", "==", selectedDoctorId).where("status", "in", ["waiting", "serving"]).get();
        let patients = []; snapshot.forEach(doc => patients.push({ id: doc.id, ...doc.data() })); patients.sort((a, b) => a.ticketNumber - b.ticketNumber);
        if (patients.length === 0) return alert(t('no_patients'));
        let currentServing = patients.find(p => p.status === 'serving');
        if (currentServing) await db.collection("bookings").doc(currentServing.id).update({ status: 'done' });
        let nextPatient = patients.find(p => p.status === 'waiting');
        if (nextPatient) { await db.collection("bookings").doc(nextPatient.id).update({ status: 'serving' }); await db.collection("doctors").doc(selectedDoctorId).update({ currentServing: nextPatient.ticketNumber }); }
        else { await db.collection("doctors").doc(selectedDoctorId).update({ currentServing: 0 }); }
    } catch (error) { console.error(error); }
}
async function resetClinic() {
    if (!selectedDoctorId) return; if(!confirm(currentLang === 'ar' ? "هل أنت متأكد من مسح كل الحجوزات والبدء من جديد؟" : "Are you sure you want to reset all bookings?")) return;
    try {
        await db.collection("doctors").doc(selectedDoctorId).update({ lastTicket: 0, currentServing: 0 });
        let snapshot = await db.collection("bookings").where("doctorId", "==", selectedDoctorId).where("status", "in", ["waiting", "serving"]).get();
        let batch = db.batch(); snapshot.forEach(doc => batch.update(doc.ref, { status: 'cancelled' })); await batch.commit(); alert(currentLang === 'ar' ? "تم التصفير." : "Reset done.");
    } catch (error) { console.error(error); }
}
function logoutDoctor() { auth.signOut().then(() => { window.location.href = 'index.html'; }); }
