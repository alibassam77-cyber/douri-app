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

// دالة مساعدة للتوقيت
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

// دالة الاختيار التلقائي بناءً على اليوم والوقت
function autoSelectClinic() {
    var now = new Date();
    var todayDay = now.getDay(); // 0-6 (Sun-Sat)
    var currentTimeStr = String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');

    var bestClinic = myClinics[0]; // الافتراضي
    
    for (var i = 0; i < myClinics.length; i++) {
        var c = myClinics[i].data;
        var worksToday = c.workingDays && c.workingDays.indexOf(todayDay) > -1;
        var inTime = currentTimeStr >= (c.startTime || '00:00') && currentTimeStr <= (c.endTime || '23:59');
        
        if (worksToday && inTime) {
            bestClinic = myClinics[i];
            break; // وجدنا العيادة التي يعمل فيها الآن
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

// بقية الدوال (نفس الكود السابق تماماً: updateClinicStatusUI, toggleClinicStatus, listenToDayCounters, listenToQueue, renderQueue, callNextPatient, resetClinic, logoutDoctor, openAddClinicModal, saveNewClinic, openEditClinicModal, saveEditClinic)
// (لقد تم إدراجها في الكود الكامل، لكنني اختصرتها هنا في الشرح لتوفير المساحة، تأكد من نسخها بالكامل من الكود السابق).
