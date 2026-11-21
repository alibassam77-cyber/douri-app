var firebaseConfig = {
    apiKey: "AIzaSyBupRlote48_0GtaelL_a13uYUfFPhCWbE",
    authDomain: "douri-app-63918.firebaseapp.com",
    projectId: "douri-app-63918",
    storageBucket: "douri-app-63918.firebasestorage.app",
    messagingSenderId: "653080780726",
    appId: "1:653080780726:web:4f2b3421b905e65af9ab17"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
var db = firebase.firestore();
var auth = firebase.auth();

var currentDoctorId = null;
var currentDoctorData = null;
var currentClinicIndex = 0;
var currentAdminDate = "";
var unsubscribeQueue = null;

var addMap = null;
var addMarker = null;
var editMap = null;
var editMarker = null;
var addLocationControlAdded = false;
var editLocationControlAdded = false;

function getTodayStrAdmin() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, "0");
    var d = String(now.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
}

function parseMinutesAdmin(timeStr) {
    if (!timeStr || typeof timeStr !== "string") return null;
    var parts = timeStr.split(":");
    if (parts.length < 2) return null;
    var h = parseInt(parts[0], 10);
    var min = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(min)) return null;
    return h * 60 + min;
}

function getCurrentMinutesNowAdmin() {
    var now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

function canCallPatientsForClinicAndDate(dateFilter) {
    var todayStr = getTodayStrAdmin();
    if (dateFilter > todayStr) {
        alert("هذا التاريخ (" + dateFilter + ") موعد قادم ولم يحن يومه بعد. لا يمكن نداء أو إدخال المراجعين قبل يوم موعدهم.");
        return false;
    }

    if (dateFilter === todayStr) {
        var clinics = Array.isArray(currentDoctorData && currentDoctorData.clinics) ? currentDoctorData.clinics : [];
        var activeClinic = clinics[currentClinicIndex] || null;
        var openMins = activeClinic ? parseMinutesAdmin(activeClinic.startTime) : null;
        if (openMins !== null) {
            var nowMins = getCurrentMinutesNowAdmin();
            if (nowMins < openMins) {
                alert("لا يمكن نداء المراجعين قبل موعد فتح العيادة (" + activeClinic.startTime + ").");
                return false;
            }
        }
    }

    return true;
}

function applySavedThemeAdmin() {
    if (localStorage.getItem("douri_theme") === "dark") {
        document.body.classList.add("dark-mode");
    } else {
        document.body.classList.remove("dark-mode");
    }
}

function rejectMissingDoctorAccount() {
    if (unsubscribeQueue) {
        unsubscribeQueue();
        unsubscribeQueue = null;
    }
    alert("الحساب غير موجود");
    auth.signOut().then(function() {
        window.location.href = "index.html";
    }).catch(function() {
        window.location.href = "index.html";
    });
}

function logoutDoctor() {
    if (unsubscribeQueue) {
        unsubscribeQueue();
        unsubscribeQueue = null;
    }
    auth.signOut().then(function() {
        window.location.href = "index.html";
    }).catch(function() {
        window.location.href = "index.html";
    });
}

function populateClinicSelector() {
    var sel = document.getElementById("clinicSelector");
    if (!sel || !currentDoctorData) return;

    var clinics = Array.isArray(currentDoctorData.clinics) ? currentDoctorData.clinics : [];
    if (currentClinicIndex >= clinics.length) {
        currentClinicIndex = 0;
    }

    sel.innerHTML = "";
    if (clinics.length === 0) {
        var emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = typeof t === "function" ? t("no_clinics_option") : "لا توجد عيادات";
        sel.appendChild(emptyOpt);
        updateToggleClinicButton(null);
        return;
    }

    clinics.forEach(function(c, idx) {
        var opt = document.createElement("option");
        opt.value = String(idx);
        var defaultClinicLabel = (typeof t === "function" ? t("clinic_prefix") : "عيادة ") + (idx + 1);
        opt.textContent = c.clinicName || defaultClinicLabel;
        if (idx === currentClinicIndex) {
            opt.selected = true;
        }
        sel.appendChild(opt);
    });

    var activeClinic = clinics[currentClinicIndex] || null;
    updateToggleClinicButton(activeClinic);
}

function updateToggleClinicButton(clinic) {
    var btn = document.getElementById("toggleClinicBtn");
    if (!btn) return;
    if (!clinic) {
        btn.disabled = true;
        return;
    }
    btn.disabled = false;
    var openLabel = typeof t === "function" ? t("open_clinic") : "فتح العيادة";
    var closeLabel = typeof t === "function" ? t("close_clinic") : "إغلاق العيادة";
    if (clinic.isClosed === true) {
        btn.className = "status-toggle-btn status-closed";
        btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> ' + openLabel;
    } else {
        btn.className = "status-toggle-btn status-open";
        btn.innerHTML = '<i class="fa-solid fa-lock"></i> ' + closeLabel;
    }
}

function changeClinic() {
    var sel = document.getElementById("clinicSelector");
    if (!sel) return;
    var idx = parseInt(sel.value, 10);
    if (isNaN(idx) || idx < 0) idx = 0;
    currentClinicIndex = idx;

    var clinics = Array.isArray(currentDoctorData && currentDoctorData.clinics) ? currentDoctorData.clinics : [];
    updateToggleClinicButton(clinics[currentClinicIndex] || null);
    listenToQueue();
}

function changeAdminDate() {
    var dateInp = document.getElementById("adminDate");
    if (!dateInp) return;
    if (!dateInp.value) {
        dateInp.value = getTodayStrAdmin();
    }
    currentAdminDate = dateInp.value;
    listenToQueue();
}

function toggleClinicStatus() {
    if (!currentDoctorId || !currentDoctorData) return;
    var clinics = Array.isArray(currentDoctorData.clinics) ? currentDoctorData.clinics.slice() : [];
    if (!clinics[currentClinicIndex]) return;

    clinics[currentClinicIndex].isClosed = !(clinics[currentClinicIndex].isClosed === true);
    db.collection("doctors").doc(currentDoctorId).update({ clinics: clinics }).then(function() {
        currentDoctorData.clinics = clinics;
        updateToggleClinicButton(clinics[currentClinicIndex]);
        alert(clinics[currentClinicIndex].isClosed ? "تم إغلاق العيادة مؤقتاً." : "تم فتح العيادة لاستقبال المراجعين.");
    }).catch(function(err) {
        console.error(err);
        alert("تعذر تحديث حالة العيادة.");
    });
}

function listenToQueue() {
    var queueEl = document.getElementById("patientsQueue");
    if (!queueEl || !currentDoctorId) return;

    if (unsubscribeQueue) {
        unsubscribeQueue();
        unsubscribeQueue = null;
    }

    var clinics = Array.isArray(currentDoctorData && currentDoctorData.clinics) ? currentDoctorData.clinics : [];
    if (!clinics[currentClinicIndex]) {
        var dispNumEmpty = document.getElementById("currentServingDisplay");
        var dispNameEmpty = document.getElementById("currentServingName");
        var dispSerialEmpty = document.getElementById("currentServingSerial");
        if (dispNumEmpty) dispNumEmpty.innerText = "-";
        if (dispNameEmpty) dispNameEmpty.innerText = "-";
        if (dispSerialEmpty) dispSerialEmpty.innerText = "";
        var noClinicMsg = typeof t === "function" ? t("no_selected_clinic_msg") : "لا توجد عيادة محددة حالياً.";
        queueEl.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + noClinicMsg + '</p>';
        return;
    }

    var dateFilter = currentAdminDate || getTodayStrAdmin();

    unsubscribeQueue = db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .where("clinicIndex", "==", currentClinicIndex)
        .where("date", "==", dateFilter)
        .onSnapshot(function(snapshot) {
            var allItems = [];
            snapshot.forEach(function(doc) {
                var d = doc.data();
                d.id = doc.id;
                if (d.status !== "cancelled") {
                    allItems.push(d);
                }
            });

            allItems.sort(function(a, b) {
                return (parseInt(a.ticketNumber, 10) || 0) - (parseInt(b.ticketNumber, 10) || 0);
            });

            var servingItem = allItems.find(function(item) { return item.status === "serving"; }) || null;
            var dispNum = document.getElementById("currentServingDisplay");
            var dispName = document.getElementById("currentServingName");
            var dispSerial = document.getElementById("currentServingSerial");

            var serialPrefix = typeof t === "function" ? t("serial_prefix") : "رقم تسلسلي: ";
            if (servingItem) {
                if (dispNum) dispNum.innerText = "#" + (servingItem.ticketNumber || "-");
                if (dispName) dispName.innerText = servingItem.patientName || "-";
                if (dispSerial) dispSerial.innerText = servingItem.serialNumber ? (serialPrefix + servingItem.serialNumber) : "";
            } else {
                if (dispNum) dispNum.innerText = "-";
                if (dispName) dispName.innerText = "-";
                if (dispSerial) dispSerial.innerText = "";
            }

            var waitingItems = allItems.filter(function(item) { return item.status !== "done"; });
            if (waitingItems.length === 0) {
                var noPatMsg = typeof t === "function" ? t("no_patients") : "لا يوجد مراجعون في قائمة الانتظار لهذا التاريخ.";
                queueEl.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + noPatMsg + '</p>';
                return;
            }

            var servingText = typeof t === "function" ? t("status_serving") : "قيد الكشف";
            var waitingText = typeof t === "function" ? t("status_waiting_admin") : "ينتظر";

            var html = "";
            waitingItems.forEach(function(item) {
                var isServing = item.status === "serving";
                var badgeClass = isServing ? "badge badge-open" : "badge badge-break";
                var badgeText = isServing ? servingText : waitingText;

                html += '<div class="queue-card">' +
                    '<div class="queue-info">' +
                        '<span class="queue-number">#' + (item.ticketNumber || "-") + '</span>' +
                        '<div>' +
                            '<strong>' + (item.patientName || "") + '</strong>' +
                            (item.patientPhone ? '<div><small>' + item.patientPhone + '</small></div>' : '') +
                        '</div>' +
                    '</div>' +
                    '<div class="queue-actions">' +
                        '<span class="' + badgeClass + '">' + badgeText + '</span>' +
                    '</div>' +
                '</div>';
            });

            queueEl.innerHTML = html;
        }, function(err) {
            console.error(err);
        });
}

function callSpecificPatient(bookingId) {
    if (!bookingId || !currentDoctorId) return;
    var dateFilter = currentAdminDate || getTodayStrAdmin();

    if (!canCallPatientsForClinicAndDate(dateFilter)) {
        return;
    }

    db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .where("clinicIndex", "==", currentClinicIndex)
        .where("date", "==", dateFilter)
        .where("status", "==", "serving")
        .get()
        .then(function(snap) {
            var batch = db.batch();
            snap.forEach(function(doc) {
                if (doc.id !== bookingId) {
                    batch.update(doc.ref, { status: "done" });
                }
            });
            batch.update(db.collection("bookings").doc(bookingId), { status: "serving" });
            return batch.commit();
        });
}

function callNextPatient() {
    if (!currentDoctorId) return;
    var dateFilter = currentAdminDate || getTodayStrAdmin();

    if (!canCallPatientsForClinicAndDate(dateFilter)) {
        return;
    }

    db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .where("clinicIndex", "==", currentClinicIndex)
        .where("date", "==", dateFilter)
        .get()
        .then(function(snap) {
            var activeList = [];
            snap.forEach(function(doc) {
                var d = doc.data();
                d.id = doc.id;
                if (d.status !== "cancelled" && d.status !== "done") {
                    activeList.push(d);
                }
            });

            activeList.sort(function(a, b) {
                return (parseInt(a.ticketNumber, 10) || 0) - (parseInt(b.ticketNumber, 10) || 0);
            });

            if (activeList.length === 0) {
                alert("لا يوجد مراجعون بانتظار الدور حالياً.");
                return;
            }

            var currentServingIdx = -1;
            for (var i = 0; i < activeList.length; i++) {
                if (activeList[i].status === "serving") {
                    currentServingIdx = i;
                    break;
                }
            }

            var batch = db.batch();
            if (currentServingIdx >= 0) {
                batch.update(db.collection("bookings").doc(activeList[currentServingIdx].id), { status: "done" });
            }

            var nextIdx = currentServingIdx >= 0 ? currentServingIdx + 1 : 0;
            if (nextIdx < activeList.length) {
                batch.update(db.collection("bookings").doc(activeList[nextIdx].id), { status: "serving" });
                return batch.commit().then(function() {
                    return activeList[nextIdx];
                });
            }

            return batch.commit().then(function() {
                return null;
            });
        }).then(function(nextPatient) {
            if (!nextPatient) {
                alert("تم إنهاء جميع المراجعين في القائمة.");
            }
        }).catch(function(err) {
            console.error(err);
        });
}

function completePatientBooking(bookingId) {
    if (!bookingId) return;
    db.collection("bookings").doc(bookingId).update({ status: "done" });
}

function setMapCoordsForModal(mode, lat, lng, zoom) {
    var latNum = parseFloat(lat);
    var lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return;

    if (mode === "add") {
        var latInp = document.getElementById("addLat");
        var lngInp = document.getElementById("addLng");
        if (latInp) latInp.value = latNum.toFixed(6);
        if (lngInp) lngInp.value = lngNum.toFixed(6);
        initAddMap(latNum, lngNum, zoom || 15);
    } else {
        var eLatInp = document.getElementById("editLat");
        var eLngInp = document.getElementById("editLng");
        if (eLatInp) eLatInp.value = latNum.toFixed(6);
        if (eLngInp) eLngInp.value = lngNum.toFixed(6);
        initEditMap(latNum, lngNum, zoom || 15);
    }
}

function attachGeoButtonToMap(mapInstance, mode, alreadyAddedFlagName) {
    if (!mapInstance || window[alreadyAddedFlagName] || typeof L === "undefined") return;
    var btnTitle = typeof t === "function" ? t("my_location_btn") : "تحديد موقعي الحالي";

    var GeoControl = L.Control.extend({
        options: { position: "topright" },
        onAdd: function() {
            var btn = L.DomUtil.create("button", "leaflet-bar leaflet-control");
            btn.type = "button";
            btn.title = btnTitle;
            btn.style.background = "#ffffff";
            btn.style.color = "#111827";
            btn.style.border = "1px solid rgba(0,0,0,0.2)";
            btn.style.borderRadius = "6px";
            btn.style.padding = "6px 10px";
            btn.style.fontWeight = "600";
            btn.style.fontSize = "12px";
            btn.style.cursor = "pointer";
            btn.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
            btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> ' + btnTitle;

            L.DomEvent.disableClickPropagation(btn);
            L.DomEvent.on(btn, "click", function(e) {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                if (!navigator.geolocation) {
                    alert("المتصفح لا يدعم تحديد الموقع الجغرافي.");
                    return;
                }
                navigator.geolocation.getCurrentPosition(function(pos) {
                    setMapCoordsForModal(mode, pos.coords.latitude, pos.coords.longitude, 16);
                }, function() {
                    alert("تعذر الوصول إلى موقعك الحالي.");
                }, { enableHighAccuracy: true, timeout: 10000 });
            });
            return btn;
        }
    });

    mapInstance.addControl(new GeoControl());
    window[alreadyAddedFlagName] = true;
}

function initAddMap(lat, lng, zoom) {
    var el = document.getElementById("add-map");
    if (!el || typeof L === "undefined") return;
    var centerLat = !isNaN(parseFloat(lat)) ? parseFloat(lat) : 15.3694;
    var centerLng = !isNaN(parseFloat(lng)) ? parseFloat(lng) : 44.1910;
    var z = zoom || 12;

    if (!addMap) {
        addMap = L.map("add-map").setView([centerLat, centerLng], z);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap"
        }).addTo(addMap);
        attachGeoButtonToMap(addMap, "add", "addLocationControlAdded");
        addMap.on("click", function(e) {
            setMapCoordsForModal("add", e.latlng.lat, e.latlng.lng, addMap.getZoom());
        });
    } else {
        addMap.setView([centerLat, centerLng], z);
    }

    if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
        if (addMarker) {
            addMarker.setLatLng([centerLat, centerLng]);
        } else {
            addMarker = L.marker([centerLat, centerLng]).addTo(addMap);
        }
    }

    setTimeout(function() {
        if (addMap) addMap.invalidateSize();
    }, 200);
}

function initEditMap(lat, lng, zoom) {
    var el = document.getElementById("edit-map");
    if (!el || typeof L === "undefined") return;
    var centerLat = !isNaN(parseFloat(lat)) ? parseFloat(lat) : 15.3694;
    var centerLng = !isNaN(parseFloat(lng)) ? parseFloat(lng) : 44.1910;
    var z = zoom || 12;

    if (!editMap) {
        editMap = L.map("edit-map").setView([centerLat, centerLng], z);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap"
        }).addTo(editMap);
        attachGeoButtonToMap(editMap, "edit", "editLocationControlAdded");
        editMap.on("click", function(e) {
            setMapCoordsForModal("edit", e.latlng.lat, e.latlng.lng, editMap.getZoom());
        });
    } else {
        editMap.setView([centerLat, centerLng], z);
    }

    if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
        if (editMarker) {
            editMarker.setLatLng([centerLat, centerLng]);
        } else {
            editMarker = L.marker([centerLat, centerLng]).addTo(editMap);
        }
    }

    setTimeout(function() {
        if (editMap) editMap.invalidateSize();
    }, 200);
}

function openAddClinicModal() {
    var modal = document.getElementById("addClinicModal");
    if (modal) modal.classList.remove("hidden");
    initAddMap(15.3694, 44.1910, 12);
}

function closeAddClinicModal() {
    var modal = document.getElementById("addClinicModal");
    if (modal) modal.classList.add("hidden");
}

function saveNewClinic() {
    if (!currentDoctorId || !currentDoctorData) return;
    var clinicName = ((document.getElementById("addClinicName") || {}).value || "").trim();
    if (!clinicName) {
        alert("يرجى إدخال اسم العيادة.");
        return;
    }

    var workingDays = [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("add_day_" + d);
        if (cb && cb.checked) workingDays.push(d);
    }

    var latVal = parseFloat(((document.getElementById("addLat") || {}).value || ""));
    var lngVal = parseFloat(((document.getElementById("addLng") || {}).value || ""));

    var newClinic = {
        clinicName: clinicName,
        city: ((document.getElementById("addCity") || {}).value || "").trim(),
        street: ((document.getElementById("addStreet") || {}).value || "").trim(),
        landmark: ((document.getElementById("addLandmark") || {}).value || "").trim(),
        startTime: ((document.getElementById("addStartTime") || {}).value || "09:00"),
        endTime: ((document.getElementById("addEndTime") || {}).value || "17:00"),
        serviceTime: parseInt(((document.getElementById("addServiceTime") || {}).value || "10"), 10) || 10,
        workingDays: workingDays,
        lat: isNaN(latVal) ? null : latVal,
        lng: isNaN(lngVal) ? null : lngVal,
        serialNumber: 0,
        dailyCounters: {},
        isClosed: false,
        isOnBreak: false
    };

    var clinics = Array.isArray(currentDoctorData.clinics) ? currentDoctorData.clinics.slice() : [];
    clinics.push(newClinic);

    db.collection("doctors").doc(currentDoctorId).update({
        clinics: clinics,
        isDeleted: false
    }).then(function() {
        currentDoctorData.clinics = clinics;
        currentDoctorData.isDeleted = false;
        currentClinicIndex = clinics.length - 1;
        populateClinicSelector();
        closeAddClinicModal();
        listenToQueue();
        alert("تمت إضافة العيادة بنجاح.");
    }).catch(function(err) {
        console.error(err);
        alert("تعذر إضافة العيادة.");
    });
}

function openEditClinicModal() {
    var clinics = Array.isArray(currentDoctorData && currentDoctorData.clinics) ? currentDoctorData.clinics : [];
    var c = clinics[currentClinicIndex];
    if (!c) {
        alert("لا توجد عيادة محددة للتعديل.");
        return;
    }

    document.getElementById("editClinicName").value = c.clinicName || "";
    document.getElementById("editCity").value = c.city || "";
    document.getElementById("editStreet").value = c.street || "";
    document.getElementById("editLandmark").value = c.landmark || "";
    document.getElementById("editStartTime").value = c.startTime || "09:00";
    document.getElementById("editEndTime").value = c.endTime || "17:00";
    document.getElementById("editServiceTime").value = c.serviceTime || 10;
    document.getElementById("editLat").value = c.lat || "";
    document.getElementById("editLng").value = c.lng || "";

    var confirmInp = document.getElementById("deleteClinicConfirmInput");
    if (confirmInp) confirmInp.value = "";

    var days = Array.isArray(c.workingDays) ? c.workingDays : [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("edit_day_" + d);
        if (cb) cb.checked = days.indexOf(d) !== -1;
    }

    var modal = document.getElementById("editClinicModal");
    if (modal) modal.classList.remove("hidden");
    initEditMap(c.lat, c.lng, c.lat && c.lng ? 15 : 12);
}

function closeEditClinicModal() {
    var modal = document.getElementById("editClinicModal");
    if (modal) modal.classList.add("hidden");
}

function saveEditClinic() {
    if (!currentDoctorId || !currentDoctorData) return;
    var clinics = Array.isArray(currentDoctorData.clinics) ? currentDoctorData.clinics.slice() : [];
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

    var latVal = parseFloat(((document.getElementById("editLat") || {}).value || ""));
    var lngVal = parseFloat(((document.getElementById("editLng") || {}).value || ""));

    var old = clinics[currentClinicIndex];
    clinics[currentClinicIndex] = Object.assign({}, old, {
        clinicName: clinicName,
        city: ((document.getElementById("editCity") || {}).value || "").trim(),
        street: ((document.getElementById("editStreet") || {}).value || "").trim(),
        landmark: ((document.getElementById("editLandmark") || {}).value || "").trim(),
        startTime: ((document.getElementById("editStartTime") || {}).value || "09:00"),
        endTime: ((document.getElementById("editEndTime") || {}).value || "17:00"),
        serviceTime: parseInt(((document.getElementById("editServiceTime") || {}).value || "10"), 10) || 10,
        workingDays: workingDays,
        lat: isNaN(latVal) ? null : latVal,
        lng: isNaN(lngVal) ? null : lngVal
    });

    db.collection("doctors").doc(currentDoctorId).update({ clinics: clinics }).then(function() {
        currentDoctorData.clinics = clinics;
        populateClinicSelector();
        closeEditClinicModal();
        alert("تم حفظ تعديلات العيادة بنجاح.");
    }).catch(function(err) {
        console.error(err);
        alert("تعذر حفظ التعديلات.");
    });
}

function deleteBookingsByQuery(query) {
    return query.get().then(function(snapshot) {
        if (snapshot.empty) return Promise.resolve();
        var batch = db.batch();
        snapshot.forEach(function(doc) {
            batch.delete(doc.ref);
        });
        return batch.commit();
    });
}

function shiftSubsequentClinicBookingsIndex(removedIndex) {
    return db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .get()
        .then(function(snap) {
            var batch = db.batch();
            var hasUpdates = false;
            snap.forEach(function(doc) {
                var d = doc.data();
                var idx = parseInt(d.clinicIndex, 10);
                if (!isNaN(idx) && idx > removedIndex) {
                    batch.update(doc.ref, { clinicIndex: idx - 1 });
                    hasUpdates = true;
                }
            });
            return hasUpdates ? batch.commit() : Promise.resolve();
        });
}

function deleteCurrentClinic() {
    if (!currentDoctorId || !currentDoctorData) return;
    var confirmInput = document.getElementById("deleteClinicConfirmInput");
    var typed = confirmInput ? confirmInput.value.trim() : "";

    if (typed !== "إحذف العيادة") {
        alert('يرجى كتابة العبارة التالية بدقة لتأكيد الحذف: إحذف العيادة');
        return;
    }

    var clinics = Array.isArray(currentDoctorData.clinics) ? currentDoctorData.clinics.slice() : [];
    if (!clinics[currentClinicIndex]) return;

    var removedClinicIndex = currentClinicIndex;
    var clinicBookingsQuery = db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .where("clinicIndex", "==", removedClinicIndex);

    deleteBookingsByQuery(clinicBookingsQuery).then(function() {
        return shiftSubsequentClinicBookingsIndex(removedClinicIndex);
    }).then(function() {
        clinics.splice(removedClinicIndex, 1);
        return db.collection("doctors").doc(currentDoctorId).update({ clinics: clinics });
    }).then(function() {
        currentDoctorData.clinics = clinics;
        closeEditClinicModal();

        if (clinics.length === 0) {
            var removeDoctorConfirm = confirm("تم حذف جميع عيادات الطبيب ومواعيدها. هل تريد حذف سجل الطبيب وجميع مواعيده نهائياً؟");
            if (removeDoctorConfirm) {
                var allDoctorBookingsQuery = db.collection("bookings").where("doctorId", "==", currentDoctorId);
                return deleteBookingsByQuery(allDoctorBookingsQuery).then(function() {
                    return db.collection("doctors").doc(currentDoctorId).delete();
                }).then(function() {
                    if (unsubscribeQueue) {
                        unsubscribeQueue();
                        unsubscribeQueue = null;
                    }
                    alert("تم حذف سجل الطبيب وجميع مواعيده بنجاح. يمكنك إعادة تفعيل الحساب أو إنشاء عيادة جديدة في أي وقت بنفس البريد وكلمة المرور.");
                    return auth.signOut().then(function() {
                        window.location.href = "index.html";
                    });
                });
            }
        }

        currentClinicIndex = 0;
        populateClinicSelector();
        listenToQueue();
        alert("تم حذف العيادة وجميع حجوزاتها نهائياً.");
    }).catch(function(err) {
        console.error(err);
        alert("حدث خطأ أثناء حذف العيادة.");
    });
}

window.onload = function() {
    applySavedThemeAdmin();
    if (typeof applyLanguage === "function") {
        applyLanguage();
    }

    var dateInp = document.getElementById("adminDate");
    currentAdminDate = getTodayStrAdmin();
    if (dateInp) {
        dateInp.value = currentAdminDate;
    }

    auth.onAuthStateChanged(function(user) {
        if (!user) {
            window.location.href = "index.html";
            return;
        }

        currentDoctorId = user.uid;
        db.collection("doctors").doc(user.uid).get().then(function(docSnap) {
            var docData = docSnap.exists ? docSnap.data() : null;
            if (!docSnap.exists || !docData || docData.isDeleted === true) {
                rejectMissingDoctorAccount();
                return;
            }

            currentDoctorData = docData;
            currentDoctorData.id = docSnap.id;

            var nameEl = document.getElementById("activeDoctorName");
            if (nameEl) {
                nameEl.innerText = currentDoctorData.name || (typeof t === "function" ? t("admin_default_doctor") : "لوحة الطبيب");
            }

            populateClinicSelector();
            listenToQueue();
        }).catch(function(err) {
            console.error(err);
        });
    });
};
