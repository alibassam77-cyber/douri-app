var firebaseConfig = {
    apiKey: "AIzaSyA2u0b_o28M9C8P6W7vY8xZ9kL1mN2oP3q",
    authDomain: "douri-app-63918.firebaseapp.com",
    projectId: "douri-app-63918",
    storageBucket: "douri-app-63918.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
var db = firebase.firestore();
var auth = firebase.auth();

var currentUser = null;
var doctorDocData = null;
var currentClinicIndex = 0;
var unsubscribeQueue = null;
var addMap = null;
var addMarker = null;
var editMap = null;
var editMarker = null;

function getTodayStr() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, "0");
    var d = String(now.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
}

function applySavedTheme() {
    var saved = localStorage.getItem("douri_theme");
    if (saved === "dark") {
        document.body.classList.add("dark-mode");
    } else {
        document.body.classList.remove("dark-mode");
    }
}

function logoutDoctor() {
    auth.signOut().then(function() {
        window.location.href = "index.html";
    }).catch(function() {
        window.location.href = "index.html";
    });
}

function populateClinicSelector() {
    var selector = document.getElementById("clinicSelector");
    if (!selector || !doctorDocData) return;

    var clinics = Array.isArray(doctorDocData.clinics) ? doctorDocData.clinics : [];
    selector.innerHTML = "";

    if (clinics.length === 0) {
        var opt = document.createElement("option");
        opt.value = "0";
        opt.innerText = "لا توجد عيادات مسجلة";
        selector.appendChild(opt);
        currentClinicIndex = 0;
        return;
    }

    if (currentClinicIndex >= clinics.length) {
        currentClinicIndex = 0;
    }

    clinics.forEach(function(c, idx) {
        var option = document.createElement("option");
        option.value = String(idx);
        option.innerText = (c && c.clinicName) ? c.clinicName : ("عيادة " + (idx + 1));
        if (idx === currentClinicIndex) option.selected = true;
        selector.appendChild(option);
    });
}

function updateClinicStatusButton() {
    var btn = document.getElementById("toggleClinicBtn");
    if (!btn || !doctorDocData) return;
    var clinics = Array.isArray(doctorDocData.clinics) ? doctorDocData.clinics : [];
    var clinic = clinics[currentClinicIndex];
    var isClosed = clinic && clinic.isClosed === true;

    if (isClosed) {
        btn.className = "status-toggle-btn status-closed";
        btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> ' + (typeof t === "function" ? t("open_clinic") : "فتح العيادة");
    } else {
        btn.className = "status-toggle-btn status-open";
        btn.innerHTML = '<i class="fa-solid fa-lock"></i> ' + (typeof t === "function" ? t("close_clinic") : "إغلاق العيادة");
    }
}

function toggleClinicStatus() {
    if (!currentUser || !doctorDocData) return;
    var clinics = Array.isArray(doctorDocData.clinics) ? doctorDocData.clinics.slice() : [];
    if (!clinics[currentClinicIndex]) return;

    var nextClosed = !(clinics[currentClinicIndex].isClosed === true);
    clinics[currentClinicIndex].isClosed = nextClosed;

    db.collection("doctors").doc(currentUser.uid).update({ clinics: clinics }).then(function() {
        doctorDocData.clinics = clinics;
        updateClinicStatusButton();
    }).catch(function(err) {
        alert(err && err.message ? err.message : "تعذر تحديث حالة العيادة.");
    });
}

function changeClinic() {
    var selector = document.getElementById("clinicSelector");
    if (!selector) return;
    currentClinicIndex = parseInt(selector.value, 10) || 0;
    updateClinicStatusButton();
    subscribeToQueue();
}

function changeAdminDate() {
    subscribeToQueue();
}

function subscribeToQueue() {
    if (!currentUser) return;
    if (unsubscribeQueue) {
        unsubscribeQueue();
        unsubscribeQueue = null;
    }

    var dateInput = document.getElementById("adminDate");
    var selectedDate = (dateInput && dateInput.value) ? dateInput.value : getTodayStr();
    if (dateInput && !dateInput.value) {
        dateInput.value = selectedDate;
    }

    unsubscribeQueue = db.collection("bookings")
        .where("doctorId", "==", currentUser.uid)
        .where("clinicIndex", "==", currentClinicIndex)
        .where("date", "==", selectedDate)
        .onSnapshot(function(snapshot) {
            var list = [];
            snapshot.forEach(function(doc) {
                var item = doc.data();
                item.id = doc.id;
                if (item.status !== "cancelled" && item.status !== "done") {
                    list.push(item);
                }
            });

            list.sort(function(a, b) {
                return (parseInt(a.ticketNumber, 10) || 0) - (parseInt(b.ticketNumber, 10) || 0);
            });

            renderQueue(list);
        }, function(err) {
            console.error(err);
        });
}

function renderQueue(list) {
    var container = document.getElementById("patientsQueue");
    var servingNumEl = document.getElementById("currentServingDisplay");
    var servingNameEl = document.getElementById("currentServingName");
    var servingSerialEl = document.getElementById("currentServingSerial");

    var servingPatient = list.find(function(p) { return p.status === "serving"; }) || list[0] || null;

    if (servingNumEl) {
        servingNumEl.innerText = servingPatient ? (servingPatient.ticketNumber || "-") : "-";
    }
    if (servingNameEl) {
        servingNameEl.innerText = servingPatient ? (servingPatient.patientName || "-") : "-";
    }
    if (servingSerialEl) {
        if (servingPatient && servingPatient.serialNumber) {
            var serialLbl = typeof t === "function" ? t("serial_label") : "الرقم التسلسلي:";
            servingSerialEl.innerText = serialLbl + " " + servingPatient.serialNumber;
        } else {
            servingSerialEl.innerText = "";
        }
    }

    if (!container) return;
    if (!list || list.length === 0) {
        var emptyMsg = typeof t === "function" ? t("no_patients") : "لا يوجد مرضى في قائمة الانتظار لهذا اليوم.";
        container.innerHTML = '<p style="color:var(--text-muted); text-align:center;">' + emptyMsg + '</p>';
        return;
    }

    var html = "";
    list.forEach(function(item) {
        var isServing = item.status === "serving";
        var statusText = isServing
            ? (typeof t === "function" ? t("status_serving") : "قيد الكشف الآن")
            : (typeof t === "function" ? t("status_waiting_admin") : "ينتظر");

        html += '<div class="queue-item ' + (isServing ? "serving" : "") + '">' +
            '<div>' +
                '<strong>#' + (item.ticketNumber || "-") + ' — ' + (item.patientName || "") + '</strong>' +
                '<div style="font-size:12px; color:var(--text-muted);">' +
                    (item.patientPhone ? ("هاتف: " + item.patientPhone + " | ") : "") +
                    statusText +
                    (item.serialNumber ? (" | تسلسلي: " + item.serialNumber) : "") +
                '</div>' +
            '</div>' +
            '<div class="queue-actions">' +
                '<button type="button" class="btn-outline" onclick="callSpecificPatient(\'' + item.id + '\')">نداء</button>' +
                '<button type="button" class="btn-primary" onclick="markPatientDone(\'' + item.id + '\')">إنهاء</button>' +
                '<button type="button" class="btn-danger" onclick="adminCancelPatient(\'' + item.id + '\', ' + (parseInt(item.ticketNumber, 10) || 0) + ')">إلغاء</button>' +
            '</div>' +
        '</div>';
    });

    container.innerHTML = html;
}

function callSpecificPatient(bookingId) {
    if (!currentUser) return;
    var dateInput = document.getElementById("adminDate");
    var selectedDate = (dateInput && dateInput.value) ? dateInput.value : getTodayStr();

    db.collection("bookings")
        .where("doctorId", "==", currentUser.uid)
        .where("clinicIndex", "==", currentClinicIndex)
        .where("date", "==", selectedDate)
        .get()
        .then(function(snap) {
            var batch = db.batch();
            snap.forEach(function(doc) {
                var d = doc.data();
                if (doc.id === bookingId) {
                    batch.update(doc.ref, { status: "serving" });
                } else if (d.status === "serving") {
                    batch.update(doc.ref, { status: "waiting" });
                }
            });
            return batch.commit();
        });
}

function callNextPatient() {
    if (!currentUser) return;
    var dateInput = document.getElementById("adminDate");
    var selectedDate = (dateInput && dateInput.value) ? dateInput.value : getTodayStr();

    db.collection("bookings")
        .where("doctorId", "==", currentUser.uid)
        .where("clinicIndex", "==", currentClinicIndex)
        .where("date", "==", selectedDate)
        .get()
        .then(function(snap) {
            var waitingList = [];
            var batch = db.batch();

            snap.forEach(function(doc) {
                var d = doc.data();
                if (d.status === "serving") {
                    batch.update(doc.ref, { status: "done" });
                } else if (d.status === "waiting") {
                    waitingList.push({ id: doc.id, ref: doc.ref, num: parseInt(d.ticketNumber, 10) || 0 });
                }
            });

            waitingList.sort(function(a, b) { return a.num - b.num; });
            if (waitingList.length > 0) {
                batch.update(waitingList[0].ref, { status: "serving" });
            }

            return batch.commit();
        });
}

function markPatientDone(bookingId) {
    db.collection("bookings").doc(bookingId).update({ status: "done" });
}

function adminCancelPatient(bookingId, ticketNumber) {
    if (!currentUser) return;
    if (!confirm("هل تريد إلغاء حجز هذا المريض وإعادة ترتيب الطابور؟")) return;

    var dateInput = document.getElementById("adminDate");
    var selectedDate = (dateInput && dateInput.value) ? dateInput.value : getTodayStr();

    db.collection("bookings").doc(bookingId).update({ status: "cancelled" }).then(function() {
        return db.collection("bookings")
            .where("doctorId", "==", currentUser.uid)
            .where("clinicIndex", "==", currentClinicIndex)
            .where("date", "==", selectedDate)
            .get();
    }).then(function(snap) {
        var remaining = [];
        snap.forEach(function(doc) {
            var d = doc.data();
            if (d.status === "cancelled" || d.status === "done") return;
            var num = parseInt(d.ticketNumber, 10) || 0;
            if (ticketNumber > 0 && num > ticketNumber) {
                remaining.push({ ref: doc.ref, num: num });
            }
        });

        remaining.sort(function(a, b) { return a.num - b.num; });
        var batch = db.batch();
        for (var i = 0; i < remaining.length; i++) {
            batch.update(remaining[i].ref, { ticketNumber: remaining[i].num - 1 });
        }
        return batch.commit();
    });
}

function openAddClinicModal() {
    var modal = document.getElementById("addClinicModal");
    if (!modal) return;
    modal.classList.remove("hidden");

    setTimeout(function() {
        var mapEl = document.getElementById("add-map");
        if (mapEl && typeof L !== "undefined" && !addMap) {
            addMap = L.map("add-map").setView([15.3694, 44.1910], 12);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "&copy; OpenStreetMap"
            }).addTo(addMap);
            addMap.on("click", function(e) {
                var latInp = document.getElementById("addLat");
                var lngInp = document.getElementById("addLng");
                if (latInp) latInp.value = e.latlng.lat.toFixed(6);
                if (lngInp) lngInp.value = e.latlng.lng.toFixed(6);
                if (addMarker) addMarker.setLatLng(e.latlng);
                else addMarker = L.marker(e.latlng).addTo(addMap);
            });
        }
        if (addMap) addMap.invalidateSize();
    }, 200);
}

function closeAddClinicModal() {
    var modal = document.getElementById("addClinicModal");
    if (modal) modal.classList.add("hidden");
}

function saveNewClinic() {
    if (!currentUser || !doctorDocData) return;

    var clinicName = ((document.getElementById("addClinicName") || {}).value || "").trim();
    var city = ((document.getElementById("addCity") || {}).value || "").trim();
    var street = ((document.getElementById("addStreet") || {}).value || "").trim();
    var landmark = ((document.getElementById("addLandmark") || {}).value || "").trim();
    var startTime = ((document.getElementById("addStartTime") || {}).value || "09:00");
    var endTime = ((document.getElementById("addEndTime") || {}).value || "17:00");
    var serviceTime = parseInt(((document.getElementById("addServiceTime") || {}).value || "10"), 10) || 10;
    var lat = parseFloat(((document.getElementById("addLat") || {}).value || "")) || null;
    var lng = parseFloat(((document.getElementById("addLng") || {}).value || "")) || null;

    if (!clinicName) {
        alert("يرجى إدخال اسم العيادة.");
        return;
    }

    var workingDays = [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("add_day_" + d);
        if (cb && cb.checked) workingDays.push(d);
    }

    var clinics = Array.isArray(doctorDocData.clinics) ? doctorDocData.clinics.slice() : [];
    clinics.push({
        clinicName: clinicName,
        city: city,
        street: street,
        landmark: landmark,
        startTime: startTime,
        endTime: endTime,
        serviceTime: serviceTime,
        workingDays: workingDays,
        lat: lat,
        lng: lng,
        serialNumber: 0,
        dailyCounters: {},
        isClosed: false,
        isOnBreak: false
    });

    db.collection("doctors").doc(currentUser.uid).update({ clinics: clinics }).then(function() {
        doctorDocData.clinics = clinics;
        currentClinicIndex = clinics.length - 1;
        populateClinicSelector();
        updateClinicStatusButton();
        closeAddClinicModal();
        subscribeToQueue();
    }).catch(function(err) {
        alert(err && err.message ? err.message : "تعذر حفظ العيادة.");
    });
}

function openEditClinicModal() {
    if (!doctorDocData) return;
    var clinics = Array.isArray(doctorDocData.clinics) ? doctorDocData.clinics : [];
    var clinic = clinics[currentClinicIndex];
    if (!clinic) return;

    var modal = document.getElementById("editClinicModal");
    if (!modal) return;

    if (document.getElementById("editClinicName")) document.getElementById("editClinicName").value = clinic.clinicName || "";
    if (document.getElementById("editCity")) document.getElementById("editCity").value = clinic.city || "";
    if (document.getElementById("editStreet")) document.getElementById("editStreet").value = clinic.street || "";
    if (document.getElementById("editLandmark")) document.getElementById("editLandmark").value = clinic.landmark || "";
    if (document.getElementById("editStartTime")) document.getElementById("editStartTime").value = clinic.startTime || "09:00";
    if (document.getElementById("editEndTime")) document.getElementById("editEndTime").value = clinic.endTime || "17:00";
    if (document.getElementById("editServiceTime")) document.getElementById("editServiceTime").value = clinic.serviceTime || 10;
    if (document.getElementById("editLat")) document.getElementById("editLat").value = clinic.lat || "";
    if (document.getElementById("editLng")) document.getElementById("editLng").value = clinic.lng || "";
    if (document.getElementById("deleteClinicConfirmInput")) document.getElementById("deleteClinicConfirmInput").value = "";

    var days = Array.isArray(clinic.workingDays) ? clinic.workingDays : [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("edit_day_" + d);
        if (cb) cb.checked = days.indexOf(d) !== -1;
    }

    modal.classList.remove("hidden");

    setTimeout(function() {
        var mapEl = document.getElementById("edit-map");
        var initialLat = clinic.lat || 15.3694;
        var initialLng = clinic.lng || 44.1910;
        if (mapEl && typeof L !== "undefined") {
            if (!editMap) {
                editMap = L.map("edit-map").setView([initialLat, initialLng], 12);
                L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    attribution: "&copy; OpenStreetMap"
                }).addTo(editMap);
                editMap.on("click", function(e) {
                    var latInp = document.getElementById("editLat");
                    var lngInp = document.getElementById("editLng");
                    if (latInp) latInp.value = e.latlng.lat.toFixed(6);
                    if (lngInp) lngInp.value = e.latlng.lng.toFixed(6);
                    if (editMarker) editMarker.setLatLng(e.latlng);
                    else editMarker = L.marker(e.latlng).addTo(editMap);
                });
            } else {
                editMap.setView([initialLat, initialLng], 12);
            }
            if (clinic.lat && clinic.lng) {
                if (editMarker) editMarker.setLatLng([clinic.lat, clinic.lng]);
                else editMarker = L.marker([clinic.lat, clinic.lng]).addTo(editMap);
            }
            editMap.invalidateSize();
        }
    }, 200);
}

function closeEditClinicModal() {
    var modal = document.getElementById("editClinicModal");
    if (modal) modal.classList.add("hidden");
}

function saveEditClinic() {
    if (!currentUser || !doctorDocData) return;
    var clinics = Array.isArray(doctorDocData.clinics) ? doctorDocData.clinics.slice() : [];
    if (!clinics[currentClinicIndex]) return;

    var clinicName = ((document.getElementById("editClinicName") || {}).value || "").trim();
    if (!clinicName) {
        alert("يرجى إدخال اسم العيادة.");
        return;
    }

    var workingDays = [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("edit_day_" + d);
        if (cb && cb.checked) workingDays.push(d);
    }

    var existing = clinics[currentClinicIndex];
    clinics[currentClinicIndex] = Object.assign({}, existing, {
        clinicName: clinicName,
        city: ((document.getElementById("editCity") || {}).value || "").trim(),
        street: ((document.getElementById("editStreet") || {}).value || "").trim(),
        landmark: ((document.getElementById("editLandmark") || {}).value || "").trim(),
        startTime: ((document.getElementById("editStartTime") || {}).value || "09:00"),
        endTime: ((document.getElementById("editEndTime") || {}).value || "17:00"),
        serviceTime: parseInt(((document.getElementById("editServiceTime") || {}).value || "10"), 10) || 10,
        workingDays: workingDays,
        lat: parseFloat(((document.getElementById("editLat") || {}).value || "")) || null,
        lng: parseFloat(((document.getElementById("editLng") || {}).value || "")) || null
    });

    db.collection("doctors").doc(currentUser.uid).update({ clinics: clinics }).then(function() {
        doctorDocData.clinics = clinics;
        populateClinicSelector();
        updateClinicStatusButton();
        closeEditClinicModal();
    }).catch(function(err) {
        alert(err && err.message ? err.message : "تعذر حفظ التعديلات.");
    });
}

function deleteCurrentClinic() {
    if (!currentUser || !doctorDocData) return;
    var confirmInput = document.getElementById("deleteClinicConfirmInput");
    var typed = confirmInput ? confirmInput.value.trim() : "";

    if (typed !== "إحذف العيادة") {
        alert('يرجى كتابة العبارة التالية بدقة لتأكيد الحذف: إحذف العيادة');
        return;
    }

    var targetIndex = currentClinicIndex;
    var clinics = Array.isArray(doctorDocData.clinics) ? doctorDocData.clinics.slice() : [];
    if (!clinics[targetIndex]) return;

    db.collection("bookings")
        .where("doctorId", "==", currentUser.uid)
        .where("clinicIndex", "==", targetIndex)
        .get()
        .then(function(snap) {
            var batch = db.batch();
            snap.forEach(function(doc) {
                batch.delete(doc.ref);
            });
            return batch.commit();
        })
        .then(function() {
            clinics.splice(targetIndex, 1);
            return db.collection("doctors").doc(currentUser.uid).update({ clinics: clinics });
        })
        .then(function() {
            doctorDocData.clinics = clinics;
            currentClinicIndex = 0;
            populateClinicSelector();
            updateClinicStatusButton();
            closeEditClinicModal();
            subscribeToQueue();
            alert("تم حذف العيادة وجميع حجوزاتها بنجاح.");
        })
        .catch(function(err) {
            alert(err && err.message ? err.message : "حدث خطأ أثناء حذف العيادة.");
        });
}

window.onload = function() {
    applySavedTheme();
    if (typeof applyLanguage === "function") {
        applyLanguage();
    }

    var dateInput = document.getElementById("adminDate");
    if (dateInput && !dateInput.value) {
        dateInput.value = getTodayStr();
    }

    auth.onAuthStateChanged(function(user) {
        if (!user) {
            window.location.href = "index.html";
            return;
        }
        currentUser = user;

        db.collection("doctors").doc(user.uid).get().then(function(docSnap) {
            if (!docSnap.exists) {
                window.location.href = "index.html";
                return;
            }
            doctorDocData = docSnap.data();
            var nameEl = document.getElementById("activeDoctorName");
            if (nameEl && doctorDocData.name) {
                nameEl.innerText = doctorDocData.name;
            }
            populateClinicSelector();
            updateClinicStatusButton();
            subscribeToQueue();
        }).catch(function(err) {
            console.error(err);
        });
    });
};
