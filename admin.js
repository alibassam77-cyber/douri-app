// ============================================================
// admin.js
// لوحة تحكم الطبيب - مشروع د. دوري
// الوظائف:
// - دخول الطبيب
// - عرض وحفظ بيانات الطبيب
// - إضافة وحذف العيادات
// - عرض الحجوزات وتصفيتها
// - نداء / إنهاء / تأجيل / إلغاء الحجز
// - حذف الحساب نهائيا: الإيميل + كلمة السر + العيادات + الحجوزات
// ============================================================

// ------------------------------------------------------------
// 1) إعدادات Firebase
// ------------------------------------------------------------
// مهم: اترك هذه القيم كما هي عندك في الملف القديم.
// إذا غيرتها سيتوقف الموقع عن الاتصال بقاعدة البيانات.
// انسخ نفس القيم من الملف القديم والصقها هنا.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// ------------------------------------------------------------
// 2) تشغيل Firebase مرة واحدة فقط
// ------------------------------------------------------------
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// ------------------------------------------------------------
// 3) جلب كل عناصر الصفحة من admin.html
// ------------------------------------------------------------
const loginBox = document.getElementById("loginBox");
const dashboardBox = document.getElementById("dashboardBox");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const refreshBtn = document.getElementById("refreshBtn");
const deleteAccountBtn = document.getElementById("deleteAccountBtn");
const doctorNameEl = document.getElementById("doctorName");
const doctorEmailEl = document.getElementById("doctorEmail");
const doctorSpecialtyEl = document.getElementById("doctorSpecialty");
const doctorStatusEl = document.getElementById("doctorStatus");
const docName = document.getElementById("docName");
const docSpecialty = document.getElementById("docSpecialty");
const docPhone = document.getElementById("docPhone");
const docCity = document.getElementById("docCity");
const saveDoctorBtn = document.getElementById("saveDoctorBtn");
const clinicsList = document.getElementById("clinicsList");
const noClinicsMsg = document.getElementById("noClinicsMsg");
const clinicName = document.getElementById("clinicName");
const clinicCity = document.getElementById("clinicCity");
const clinicAddress = document.getElementById("clinicAddress");
const clinicStartTime = document.getElementById("clinicStartTime");
const clinicEndTime = document.getElementById("clinicEndTime");
const clinicWorkingDays = document.getElementById("clinicWorkingDays");
const clinicPhone = document.getElementById("clinicPhone");
const addClinicBtn = document.getElementById("addClinicBtn");
const bookingsList = document.getElementById("bookingsList");
const noBookingsMsg = document.getElementById("noBookingsMsg");
const filterClinic = document.getElementById("filterClinic");
const filterDate = document.getElementById("filterDate");
const filterStatus = document.getElementById("filterStatus");
const applyFilterBtn = document.getElementById("applyFilterBtn");

// ------------------------------------------------------------
// 4) متغيرات عامة
// ------------------------------------------------------------
let currentUser = null;
let currentDoctor = null;
let allBookings = [];

// ------------------------------------------------------------
// 5) حماية من XSS عند عرض أي نص يكتبه المستخدم
// ------------------------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) {
    return "";
  }
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ------------------------------------------------------------
// 6) مراقبة حالة تسجيل الدخول
// ------------------------------------------------------------
auth.onAuthStateChanged(async function (user) {
  currentUser = user;
  if (user) {
    if (loginBox) {
      loginBox.classList.add("hidden");
    }
    if (dashboardBox) {
      dashboardBox.classList.remove("hidden");
    }
    await loadDoctor();
    await loadBookings();
  } else {
    if (loginBox) {
      loginBox.classList.remove("hidden");
    }
    if (dashboardBox) {
      dashboardBox.classList.add("hidden");
    }
    currentDoctor = null;
    allBookings = [];
  }
});

// ------------------------------------------------------------
// 7) إظهار وإخفاء خطأ الدخول
// [STRIPPED 68 bytes] showLoginError(msg) {
  if (loginError) {
    loginError.textContent = msg;
    loginError.style.display = "block";
  }
}

function hideLoginError() {
  if (loginError) {
    loginError.style.display = "none";
  }
}

// ------------------------------------------------------------
// 8) تسجيل دخول الطبيب
// ------------------------------------------------------------
if (loginBtn) {
  loginBtn.addEventListener("click", async function () {
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    if (!email || !password) {
      showLoginError("أدخل البريد الإلكتروني وكلمة السر");
      return;
    }
    try {
      await auth.signInWithEmailAndPassword(email, password);
      hideLoginError();
    } catch (e) {
      showLoginError("فشل الدخول، تحقق من البريد الإلكتروني وكلمة السر");
    }
  });
}

// ------------------------------------------------------------
// 9) تسجيل الخروج
// ------------------------------------------------------------
if (logoutBtn) {
  logoutBtn.addEventListener("click", async function () {
    try {
      await auth.signOut();
    } catch (e) {
      alert("حدث خطأ أثناء تسجيل الخروج");
      return;
    }
    window.location.reload();
  });
}

// ------------------------------------------------------------
// 10) زر التحديث اليدوي
// ------------------------------------------------------------
if (refreshBtn) {
  refreshBtn.addEventListener("click", async function () {
    await loadDoctor();
    await loadBookings();
  });
}

// ------------------------------------------------------------
// 11) تحميل بيانات الطبيب من Firestore
// [STRIPPED 65 bytes] function loadDoctor() {
  if (!currentUser) {
    return;
  }
  try {
    const docRef = db.collection("doctors").doc(currentUser.uid);
    const snap = await docRef.get();
    if (snap.exists) {
      currentDoctor = snap.data();
    } else {
      currentDoctor = {
        name: "",
        email: currentUser.email || "",
        specialty: "",
        phone: "",
        city: "",
        clinics: [],
        ownerUid: currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await docRef.set(currentDoctor);
    }
    renderDoctor();
    renderClinics();
  } catch (e) {
    alert("حدث خطأ أثناء تحميل بيانات الطبيب");
  }
}

// ------------------------------------------------------------
// 12) عرض بيانات الطبيب في الأعلى وفي حقول النموذج
// [STRIPPED 68 bytes] renderDoctor() {
  if (!currentDoctor) {
    return;
  }
  if (doctorNameEl) {
    doctorNameEl.textContent = currentDoctor.name || "دكتور";
  }
  if (doctorEmailEl) {
    doctorEmailEl.textContent = currentDoctor.email || currentUser.email || "";
  }
  if (doctorSpecialtyEl) {
    doctorSpecialtyEl.textContent = currentDoctor.specialty || "";
  }
  if (doctorStatusEl) {
    doctorStatusEl.textContent = "نشط";
  }
  if (docName) {
    docName.value = currentDoctor.name || "";
  }
  if (docSpecialty) {
    docSpecialty.value = currentDoctor.specialty || "";
  }
  if (docPhone) {
    docPhone.value = currentDoctor.phone || "";
  }
  if (docCity) {
    docCity.value = currentDoctor.city || "";
  }
}

// ------------------------------------------------------------
// 13) حفظ بيانات الطبيب
// ------------------------------------------------------------
if (saveDoctorBtn) {
  saveDoctorBtn.addEventListener("click", async function () {
    if (!currentUser) {
      return;
    }
    const nameValue = docName.value.trim();
    const specialtyValue = docSpecialty.value.trim();
    const phoneValue = docPhone.value.trim();
    const cityValue = docCity.value.trim();
    if (!nameValue) {
      alert("أدخل اسم الطبيب");
      return;
    }
    const data = {
      name: nameValue,
      specialty: specialtyValue,
      phone: phoneValue,
      city: cityValue,
      email: currentUser.email || (currentDoctor ? currentDoctor.email : "") || "",
      ownerUid: currentUser.uid,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
      await db.collection("doctors").doc(currentUser.uid).set(data, { merge: true });
      if (currentDoctor) {
        currentDoctor = Object.assign({}, currentDoctor, data);
      } else {
        currentDoctor = data;
      }
      renderDoctor();
      alert("تم حفظ بيانات الطبيب");
    } catch (e) {
      alert("حدث خطأ أثناء حفظ بيانات الطبيب");
    }
  });
}

// ------------------------------------------------------------
// 14) عرض قائمة العيادات
// [STRIPPED 68 bytes] renderClinics() {
  if (!currentDoctor) {
    return;
  }
  const clinics = currentDoctor.clinics || [];
  if (clinicsList) {
    clinicsList.innerHTML = "";
  }
  if (noClinicsMsg) {
    if (clinics.length === 0) {
      noClinicsMsg.style.display = "block";
    } else {
      noClinicsMsg.style.display = "none";
    }
  }
  if (filterClinic) {
    filterClinic.innerHTML = '<option value="all">كل العيادات</option>';
    clinics.forEach(function (c, i) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = c.clinicName || ("عيادة " + (i + 1));
      filterClinic.appendChild(opt);
    });
  }
  clinics.forEach(function (c, index) {
    const div = document.createElement("div");
    div.className = "clinic-item";
    const clinicTitle = escapeHtml(c.clinicName || "");
    const clinicCityText = escapeHtml(c.city || "");
    const clinicAddressText = escapeHtml(c.address || "");
    const clinicWorkingText = escapeHtml(c.workingDays || "");
    const clinicStartText = escapeHtml(c.startTime || "");
    const clinicEndText = escapeHtml(c.endTime || "");
    const clinicPhoneText = escapeHtml(c.phone || "");
    div.innerHTML =
      "<b>" + clinicTitle + "</b><br>" +
      "<span class='small'>" + clinicCityText + " - " + clinicAddressText + "</span><br>" +
      "<span class='small'>الهاتف: " + clinicPhoneText + "</span><br>" +
      "<span class='small'>الدوام: " + clinicWorkingText + " | من " + clinicStartText + " إلى " + clinicEndText + "</span><br>" +
      "<div class='row-btns'>" +
      "<button type='button' onclick='deleteClinic(" + index + ")'>حذف العيادة</button>" +
      "</div>";
    clinicsList.appendChild(div);
  });
}

// ------------------------------------------------------------
// 15) إضافة عيادة جديدة
// ------------------------------------------------------------
if (addClinicBtn) {
  addClinicBtn.addEventListener("click", async function () {
    if (!currentUser) {
      return;
    }
    const clinicNameValue = clinicName.value.trim();
    const clinicCityValue = clinicCity.value.trim();
    const clinicAddressValue = clinicAddress.value.trim();
    const clinicStartValue = clinicStartTime.value;
    const clinicEndValue = clinicEndTime.value;
    const clinicWorkingValue = clinicWorkingDays.value.trim();
    const clinicPhoneValue = clinicPhone.value.trim();
    if (!clinicNameValue || !clinicCityValue) {
      alert("أدخل اسم العيادة والمدينة");
      return;
    }
    const newClinic = {
      clinicName: clinicNameValue,
      city: clinicCityValue,
      address: clinicAddressValue,
      startTime: clinicStartValue,
      endTime: clinicEndValue,
      workingDays: clinicWorkingValue,
      phone: clinicPhoneValue,
      dailyCounters: {},
      createdAt: new Date().toISOString()
    };
    try {
      const clinics = currentDoctor.clinics || [];
      clinics.push(newClinic);
      await db.collection("doctors").doc(currentUser.uid).update({ clinics: clinics });
      currentDoctor.clinics = clinics;
      renderClinics();
      clinicName.value = "";
      clinicCity.value = "";
      clinicAddress.value = "";
      clinicWorkingDays.value = "";
      clinicPhone.value = "";
      alert("تمت إضافة العيادة");
    } catch (e) {
      alert("حدث خطأ أثناء إضافة العيادة");
    }
  });
}

// ------------------------------------------------------------
// 16) حذف عيادة واحدة فقط
// [STRIPPED 65 bytes] function deleteClinic(index) {
  if (!currentUser || !currentDoctor) {
    return;
  }
  const clinics = currentDoctor.clinics || [];
  const clinic = clinics[index];
  if (!clinic) {
    return;
  }
  const ok = confirm("هل أنت متأكد من حذف عيادة: " + (clinic.clinicName || "") + " نهائيا؟ لا يمكن التراجع.");
  if (!ok) {
    return;
  }
  try {
    clinics.splice(index, 1);
    await db.collection("doctors").doc(currentUser.uid).update({ clinics: clinics });
    currentDoctor.clinics = clinics;
    renderClinics();
    alert("تم حذف العيادة");
  } catch (e) {
    alert("حدث خطأ أثناء حذف العيادة");
  }
}
window.deleteClinic = deleteClinic;

// ------------------------------------------------------------
// 17) تحميل كل حجوزات الطبيب
// [STRIPPED 65 bytes] function loadBookings() {
  if (!currentUser) {
    return;
  }
  try {
    const snap = await db.collection("bookings")
      .where("doctorId", "==", currentUser.uid)
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();
    allBookings = [];
    snap.forEach(function (d) {
      const data = d.data();
      data.id = d.id;
      allBookings.push(data);
    });
    renderBookings();
  } catch (e) {
    try {
      const snap2 = await db.collection("bookings").where("doctorId", "==", currentUser.uid).get();
      allBookings = [];
      snap2.forEach(function (d) {
        const data = d.data();
        data.id = d.id;
        allBookings.push(data);
      });
      renderBookings();
    } catch (e2) {
      alert("حدث خطأ أثناء تحميل الحجوزات");
    }
  }
}

// ------------------------------------------------------------
// 18) عرض الحجوزات مع التصفية
// [STRIPPED 68 bytes] renderBookings() {
  let list = [];
  for (let i = 0; i < allBookings.length; i++) {
    list.push(allBookings[i]);
  }
  const clinicFilter = filterClinic ? filterClinic.value : "all";
  const dateFilter = filterDate ? filterDate.value : "";
  const statusFilter = filterStatus ? filterStatus.value : "all";
  if (clinicFilter !== "all") {
    const filtered = [];
    for (let i = 0; i < list.length; i++) {
      if (String(list[i].clinicIndex) === String(clinicFilter)) {
        filtered.push(list[i]);
      }
    }
    list = filtered;
  }
  if (dateFilter) {
    const filtered2 = [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].date === dateFilter) {
        filtered2.push(list[i]);
      }
    }
    list = filtered2;
  }
  if (statusFilter !== "all") {
    const filtered3 = [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].status === statusFilter) {
        filtered3.push(list[i]);
      }
    }
    list = filtered3;
  }
  if (bookingsList) {
    bookingsList.innerHTML = "";
  }
  if (noBookingsMsg) {
    if (list.length === 0) {
      noBookingsMsg.style.display = "block";
    } else {
      noBookingsMsg.style.display = "none";
    }
  }
  list.forEach(function (b) {
    const div = document.createElement("div");
    div.className = "booking-item";
    const queueText = escapeHtml(b.queueNumber || "");
    const nameText = escapeHtml(b.patientName || "");
    const phoneText = escapeHtml(b.patientPhone || "");
    const dateText = escapeHtml(b.date || "");
    const statusText = escapeHtml(b.status || "");
    let clinicNumberText = "";
    if (b.clinicIndex !== undefined && b.clinicIndex !== null) {
      clinicNumberText = String(Number(b.clinicIndex) + 1);
    }
    const clinicNumberEscaped = escapeHtml(clinicNumberText);
    div.innerHTML =
      "<b>#" + queueText + " - " + nameText + "</b><br>" +
      "<span class='small'>الهاتف: " + phoneText + "</span><br>" +
      "<span class='small'>التاريخ: " + dateText + " | الحالة: " + statusText + "</span><br>" +
      "<span class='small'>العيادة رقم: " + clinicNumberEscaped + "</span>" +
      "<div class='row-btns'>" +
      "<button type='button' onclick='callBooking(\"" + b.id + "\")'>نداء</button>" +
      "<button type='button' onclick='finishBooking(\"" + b.id + "\")'>إنهاء</button>" +
      "<button type='button' onclick='postponeBooking(\"" + b.id + "\")'>تأجيل</button>" +
      "<button type='button' onclick='cancelBooking(\"" + b.id + "\")'>إلغاء</button>" +
      "</div>";
    bookingsList.appendChild(div);
  });
}

// ------------------------------------------------------------
// 19) زر تطبيق التصفية
// ------------------------------------------------------------
if (applyFilterBtn) {
  applyFilterBtn.addEventListener("click", function () {
    renderBookings();
  });
}

// ------------------------------------------------------------
// 20) تحديث حالة أي حجز
// [STRIPPED 65 bytes] function updateBookingStatus(id, status) {
  try {
    await db.collection("bookings").doc(id).update({
      status: status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    for (let i = 0; i < allBookings.length; i++) {
      if (allBookings[i].id === id) {
        allBookings[i].status = status;
      }
    }
    renderBookings();
  } catch (e) {
    alert("حدث خطأ أثناء تحديث الحجز");
  }
}

// ------------------------------------------------------------
// 21) نداء مريض
// [STRIPPED 65 bytes] function callBooking(id) {
  await updateBookingStatus(id, "called");
}

// ------------------------------------------------------------
// 22) إنهاء حجز
// [STRIPPED 65 bytes] function finishBooking(id) {
  await updateBookingStatus(id, "done");
}

// ------------------------------------------------------------
// 23) تأجيل حجز
// [STRIPPED 65 bytes] function postponeBooking(id) {
  const ok = confirm("هل تريد تأجيل هذا الحجز؟");
  if (!ok) {
    return;
  }
  await updateBookingStatus(id, "postponed");
}

// ------------------------------------------------------------
// 24) إلغاء حجز
// [STRIPPED 65 bytes] function cancelBooking(id) {
  const ok = confirm("هل تريد إلغاء هذا الحجز؟");
  if (!ok) {
    return;
  }
  await updateBookingStatus(id, "cancelled");
}

window.callBooking = callBooking;
window.finishBooking = finishBooking;
window.postponeBooking = postponeBooking;
window.cancelBooking = cancelBooking;

// ------------------------------------------------------------
// 25) حذف الحساب نهائيا
// يحذف بالترتيب:
// 1) كل الحجوزات
// 2) مستند الطبيب في doctors
// 3) حساب Authentication أي الإيميل وكلمة السر
// ------------------------------------------------------------
if (deleteAccountBtn) {
  deleteAccountBtn.addEventListener("click", deleteAccountForever);
}

async function deleteAccountForever() {
  if (!currentUser) {
    alert("يجب تسجيل الدخول أولا");
    return;
  }
  const first = confirm("تحذير خطير!\n\nسيتم حذف حسابك نهائيا:\n- الإيميل وكلمة السر\n- كل العيادات\n- كل الحجوزات\n\nلا يمكن التراجع عن هذا الإجراء أبدا.\n\nهل أنت متأكد؟");
  if (!first) {
    return;
  }
  const second = confirm("تأكيد أخير:\n\nاضغط موافق لحذف كل شيء نهائيا.\nاضغط إلغاء للتراجع.");
  if (!second) {
    return;
  }
  deleteAccountBtn.disabled = true;
  deleteAccountBtn.textContent = "جار حذف الحساب...";
  try {
    const uid = currentUser.uid;
    const snap = await db.collection("bookings").where("doctorId", "==", uid).get();
    const batch = db.batch();
    snap.forEach(function (doc) {
      batch.delete(doc.ref);
    });
    if (!snap.empty) {
      await batch.commit();
    }
    await db.collection("doctors").doc(uid).delete();
    await currentUser.delete();
    alert("تم حذف حسابك نهائيا");
    window.location.href = "index.html";
  } catch (e) {
    deleteAccountBtn.disabled = false;
    deleteAccountBtn.textContent = "حذف حسابي نهائيا";
    if (e && e.code === "auth/requires-recent-login") {
      alert("لأسباب أمنية، يجب تسجيل الخروج ثم الدخول من جديد، ثم حاول حذف الحساب مرة أخرى.");
    } else {
      alert("حدث خطأ أثناء حذف الحساب، حاول مرة أخرى");
    }
  }
}
