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
var selectedClinicIndexAdmin = 0;
var currentClinicData = null;
var unsubscribeQueue = null;
var adminMap = null;
var adminMarker = null;
var adminEditMap = null;
var adminEditMarker = null;
var adminLocationControlAdded = false;
var adminEditLocationControlAdded = false;

function escapeHtmlAdmin(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getTodayStrAdmin() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, "0");
    var d = String(now.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
}

function formatDateSlashesAdmin(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return "";
    var parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return parts[0] + "/" + parts[1] + "/" + parts[2];
}

function getAdminSelectedDate() {
    var dateInput = document.getElementById("adminDate");
    if (dateInput && dateInput.value) return dateInput.value;
    return getTodayStrAdmin();
}

function getLocalizedAdminDoctorName(doc) {
    if (!doc) return "";
    if (typeof getCurrentLang === "function" && getCurrentLang() === "en" && doc.nameEn && String(doc.nameEn).trim()) {
        return String(doc.nameEn).trim();
    }
    return doc.name || "";
}

function getLocalizedAdminClinicName(clinic) {
    if (!clinic) return "";
    if (typeof getCurrentLang === "function" && getCurrentLang() === "en" && clinic.clinicNameEn && String(clinic.clinicNameEn).trim()) {
        return String(clinic.clinicNameEn).trim();
    }
    return clinic.clinicName || "";
}

function getLocalizedAdminCity(clinic) {
    if (!clinic) return "";
    if (typeof getCurrentLang === "function" && getCurrentLang() === "en" && clinic.cityEn && String(clinic.cityEn).trim()) {
        return String(clinic.cityEn).trim();
    }
    return clinic.city || "";
}

function getLocalizedAdminStreet(clinic) {
    if (!clinic) return "";
    if (typeof getCurrentLang === "function" && getCurrentLang() === "en" && clinic.streetEn && String(clinic.streetEn).trim()) {
        return String(clinic.streetEn).trim();
    }
    return clinic.street || "";
}

function checkAuthAndLoad() {
    auth.onAuthStateChanged(function(user) {
        if (!user) {
            window.location.href = "index.html";
            return;
        }
        currentDoctorId = user.uid;
        loadDoctorData();
    });
}

function loadDoctorData() {
    if (!currentDoctorId) return;
    db.collection("doctors").doc(currentDoctorId).onSnapshot(function(docSnap) {
        if (!docSnap.exists) {
            window.location.href = "index.html";
            return;
        }
        var data = docSnap.data();
        data.id = docSnap.id;
        currentDoctorData = data;
        if (data.isDeleted === true) {
            window.location.href = "index.html";
            return;
        }
        var titleEl = document.getElementById("adminDoctorName");
        if (titleEl) {
            var docName = getLocalizedAdminDoctorName(data);
            titleEl.innerText = docName || t("admin_default_doctor");
        }
        populateClinicSelector();
        refreshAdminView();
    }, function(err) {
        console.error(err);
        alert(t("err_fetch_db"));
    });
}

function populateClinicSelector() {
    var selector = document.getElementById("clinicSelector");
    if (!selector) return;
    var clinics = (currentDoctorData && Array.isArray(currentDoctorData.clinics)) ? currentDoctorData.clinics : [];
    selector.innerHTML = "";
    if (clinics.length === 0) {
        var optEmpty = document.createElement("option");
        optEmpty.value = "";
        optEmpty.innerText = t("no_clinics_option");
        selector.appendChild(optEmpty);
        selectedClinicIndexAdmin = 0;
        currentClinicData = null;
        return;
    }
    if (selectedClinicIndexAdmin >= clinics.length) selectedClinicIndexAdmin = 0;
    if (selectedClinicIndexAdmin < 0) selectedClinicIndexAdmin = 0;
    clinics.forEach(function(c, idx) {
        var opt = document.createElement("option");
        opt.value = String(idx);
        var cName = getLocalizedAdminClinicName(c) || (t("clinic_prefix") + (idx + 1));
        opt.innerText = cName;
        if (idx === selectedClinicIndexAdmin) opt.selected = true;
        selector.appendChild(opt);
    });
    currentClinicData = clinics[selectedClinicIndexAdmin] || null;
}

function onClinicSelectorChange() {
    var selector = document.getElementById("clinicSelector");
    if (!selector) return;
    var val = parseInt(selector.value, 10);
    if (isNaN(val)) val = 0;
    selectedClinicIndexAdmin = val;
    if (currentDoctorData && Array.isArray(currentDoctorData.clinics)) {
        currentClinicData = currentDoctorData.clinics[selectedClinicIndexAdmin] || null;
    }
    refreshAdminView();
}

function onAdminDateChange() {
    refreshAdminView();
}

function refreshAdminView() {
    updateAdminClinicStatusUI();
    listenToQueue();
}

function updateAdminClinicStatusUI() {
    var statusEl = document.getElementById("clinicStatusText");
    var toggleBtn = document.getElementById("toggleClinicStatusBtn");
    if (!currentClinicData) {
        if (statusEl) statusEl.innerText = t("no_selected_clinic_msg");
        if (toggleBtn) toggleBtn.classList.add("hidden");
        return;
    }
    var isClosed = currentClinicData.isClosed === true;
    if (statusEl) {
        statusEl.innerText = isClosed ? t("closed_temp") : t("available");
        statusEl.className = "badge " + (isClosed ? "badge-closed" : "badge-open");
    }
    if (toggleBtn) {
        toggleBtn.classList.remove("hidden");
        toggleBtn.innerText = isClosed ? t("open_clinic") : t("close_clinic");
        toggleBtn.className = "btn-outline status-toggle-btn " + (isClosed ? "status-closed" : "status-open");
    }
}

function listenToQueue() {
    if (unsubscribeQueue) {
        unsubscribeQueue();
        unsubscribeQueue = null;
    }
    var listEl = document.getElementById("queueList");
    var waitingEl = document.getElementById("waitingCount");
    var doneEl = document.getElementById("doneCount");
    var servingEl = document.getElementById("servingNumber");
    if (!currentDoctorId) return;
    if (!currentClinicData) {
        if (listEl) listEl.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + escapeHtmlAdmin(t("no_selected_clinic_msg")) + '</p>';
        if (waitingEl) waitingEl.innerText = "0";
        if (doneEl) doneEl.innerText = "0";
        if (servingEl) servingEl.innerText = "-";
        return;
    }
    var dateStr = getAdminSelectedDate();
    unsubscribeQueue = db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .where("clinicIndex", "==", selectedClinicIndexAdmin)
        .where("date", "==", dateStr)
        .onSnapshot(function(snapshot) {
            var all = [];
            snapshot.forEach(function(doc) {
                var item = doc.data();
                item.id = doc.id;
                all.push(item);
            });
            all.sort(function(a, b) {
                return (parseInt(a.ticketNumber, 10) || 0) - (parseInt(b.ticketNumber, 10) || 0);
            });
            var waiting = [];
            var serving = null;
            var doneCount = 0;
            all.forEach(function(item) {
                if (item.status === "done") doneCount++;
                else if (item.status === "serving") serving = item;
                else if (item.status === "waiting") waiting.push(item);
            });
            if (waitingEl) waitingEl.innerText = String(waiting.length + (serving ? 1 : 0));
            if (doneEl) doneEl.innerText = String(doneCount);
            if (servingEl) servingEl.innerText = serving ? String(serving.ticketNumber) : "-";
            renderQueueList(waiting, serving, dateStr);
        }, function(err) {
            console.error(err);
            if (listEl) listEl.innerHTML = '<p style="text-align:center; color:var(--danger);">' + escapeHtmlAdmin(t("err_fetch_db")) + '</p>';
        });
}

function renderQueueList(waiting, serving, dateStr) {
    var listEl = document.getElementById("queueList");
    if (!listEl) return;
    if (!serving && waiting.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + escapeHtmlAdmin(t("no_patients")) + '</p>';
        return;
    }
    var html = "";
    if (serving) {
        html += '<div class="queue-item serving">' +
            '<div><strong>#' + escapeHtmlAdmin(serving.ticketNumber) + ' - ' + escapeHtmlAdmin(serving.patientName || "") + '</strong>' +
            '<div style="font-size:12px; color:var(--text-muted);">' + escapeHtmlAdmin(t("serial_prefix")) + escapeHtmlAdmin(serving.serialNumber || "-") + ' | ' + escapeHtmlAdmin(serving.patientPhone || "") + '</div></div>' +
            '<div class="queue-actions">' +
            '<button type="button" class="btn-primary" onclick="finishCurrentPatient(\'' + escapeHtmlAdmin(serving.id) + '\')">' + escapeHtmlAdmin(t("finish_patient_btn")) + '</button>' +
            '<button type="button" class="btn-outline" onclick="deferCurrentPatient(\'' + escapeHtmlAdmin(serving.id) + '\')">' + escapeHtmlAdmin(t("defer_patient_btn")) + '</button>' +
            '</div></div>';
    }
    waiting.forEach(function(item) {
        html += '<div class="queue-item">' +
            '<div><strong>#' + escapeHtmlAdmin(item.ticketNumber) + ' - ' + escapeHtmlAdmin(item.patientName || "") + '</strong>' +
            '<div style="font-size:12px; color:var(--text-muted);">' + escapeHtmlAdmin(t("serial_prefix")) + escapeHtmlAdmin(item.serialNumber || "-") + ' | ' + escapeHtmlAdmin(item.patientPhone || "") + '</div></div>' +
            '<div class="queue-actions">' +
            '<button type="button" class="btn-outline" onclick="callSpecificPatient(\'' + escapeHtmlAdmin(item.id) + '\')">' + escapeHtmlAdmin(t("call_patient_btn")) + '</button>' +
            '<button type="button" class="btn-outline" onclick="deferSpecificPatient(\'' + escapeHtmlAdmin(item.id) + '\')">' + escapeHtmlAdmin(t("defer_patient_btn")) + '</button>' +
            '</div></div>';
    });
    listEl.innerHTML = html;
}

function canCallForDate(dateStr) {
    var todayStr = getTodayStrAdmin();
    if (dateStr !== todayStr) {
        alert(t("err_future_date_call").replace("{date}", formatDateSlashesAdmin(dateStr)));
        return false;
    }
    if (!currentClinicData) return false;
    var startTime = currentClinicData.startTime || "09:00";
    var parts = String(startTime).split(":");
    var openMins = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    var now = new Date();
    var nowMins = now.getHours() * 60 + now.getMinutes();
    if (nowMins < openMins) {
        alert(t("err_before_open_call").replace("{time}", startTime));
        return false;
    }
    return true;
}

function callNextPatient() {
    var dateStr = getAdminSelectedDate();
    if (!canCallForDate(dateStr)) return;
    if (!currentClinicData || currentClinicData.isClosed === true) {
        alert(t("err_clinic_closed_now"));
        return;
    }
    db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .where("clinicIndex", "==", selectedClinicIndexAdmin)
        .where("date", "==", dateStr)
        .where("status", "==", "waiting")
        .get()
        .then(function(snap) {
            var next = null;
            snap.forEach(function(doc) {
                var d = doc.data();
                d.id = doc.id;
                if (!next || (parseInt(d.ticketNumber, 10) || 0) < (parseInt(next.ticketNumber, 10) || 0)) next = d;
            });
            if (!next) {
                alert(t("err_no_waiting_patients"));
                return;
            }
            return db.collection("bookings").doc(next.id).update({ status: "serving" });
        })
        .catch(function(err) {
            console.error(err);
            alert(t("err_fetch_db"));
        });
}

function callSpecificPatient(bookingId) {
    var dateStr = getAdminSelectedDate();
    if (!canCallForDate(dateStr)) return;
    if (!currentClinicData || currentClinicData.isClosed === true) {
        alert(t("err_clinic_closed_now"));
        return;
    }
    db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .where("clinicIndex", "==", selectedClinicIndexAdmin)
        .where("date", "==", dateStr)
        .where("status", "==", "serving")
        .get()
        .then(function(snap) {
            var batch = db.batch();
            snap.forEach(function(doc) {
                batch.update(doc.ref, { status: "waiting" });
            });
            return batch.commit();
        })
        .then(function() {
            return db.collection("bookings").doc(bookingId).update({ status: "serving" });
        })
        .catch(function(err) {
            console.error(err);
            alert(t("err_fetch_db"));
        });
}

function finishCurrentPatient(bookingId) {
    if (!bookingId) return;
    db.collection("bookings").doc(bookingId).update({ status: "done" }).catch(function(err) {
        console.error(err);
        alert(t("err_fetch_db"));
    });
}

function finishAllPatients() {
    var dateStr = getAdminSelectedDate();
    db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .where("clinicIndex", "==", selectedClinicIndexAdmin)
        .where("date", "==", dateStr)
        .get()
        .then(function(snap) {
            var batch = db.batch();
            var count = 0;
            snap.forEach(function(doc) {
                var d = doc.data();
                if (d.status === "waiting" || d.status === "serving") {
                    batch.update(doc.ref, { status: "done" });
                    count++;
                }
            });
            if (count === 0) {
                alert(t("msg_all_patients_done"));
                return null;
            }
            return batch.commit();
        })
        .then(function(res) {
            if (res !== null) alert(t("msg_all_patients_done"));
        })
        .catch(function(err) {
            console.error(err);
            alert(t("err_fetch_db"));
        });
}

function deferCurrentPatient(bookingId) {
    deferSpecificPatient(bookingId);
}

function deferSpecificPatient(bookingId) {
    if (!bookingId) return;
    var dateStr = getAdminSelectedDate();
    db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .where("clinicIndex", "==", selectedClinicIndexAdmin)
        .where("date", "==", dateStr)
        .get()
        .then(function(snap) {
            var items = [];
            snap.forEach(function(doc) {
                var d = doc.data();
                d.id = doc.id;
                d.ref = doc.ref;
                if (d.status === "waiting" || d.status === "serving") items.push(d);
            });
            items.sort(function(a, b) {
                return (parseInt(a.ticketNumber, 10) || 0) - (parseInt(b.ticketNumber, 10) || 0);
            });
            var target = null;
            items.forEach(function(it) { if (it.id === bookingId) target = it; });
            if (!target) return null;
            if (items.length <= 1) return null;
            var maxNum = 0;
            items.forEach(function(it) {
                var n = parseInt(it.ticketNumber, 10) || 0;
                if (n > maxNum) maxNum = n;
            });
            var batch = db.batch();
            var targetNum = parseInt(target.ticketNumber, 10) || 0;
            items.forEach(function(it) {
                var n = parseInt(it.ticketNumber, 10) || 0;
                if (it.id === bookingId) {
                    batch.update(it.ref, { ticketNumber: maxNum, status: "waiting" });
                } else if (n > targetNum) {
                    batch.update(it.ref, { ticketNumber: n - 1 });
                }
            });
            return batch.commit();
        })
        .catch(function(err) {
            console.error(err);
            alert(t("err_fetch_db"));
        });
}

function toggleClinicStatus() {
    if (!currentDoctorData || !currentClinicData) {
        alert(t("err_no_clinic_to_edit"));
        return;
    }
    var clinics = currentDoctorData.clinics.slice();
    var clinic = Object.assign({}, clinics[selectedClinicIndexAdmin]);
    clinic.isClosed = !(clinic.isClosed === true);
    clinics[selectedClinicIndexAdmin] = clinic;
    db.collection("doctors").doc(currentDoctorId).update({ clinics: clinics }).then(function() {
        alert(clinic.isClosed ? t("msg_clinic_closed_temp") : t("msg_clinic_opened"));
    }).catch(function(err) {
        console.error(err);
        alert(t("err_update_clinic_status"));
    });
}

function logoutAdmin() {
    auth.signOut().then(function() {
        window.location.href = "index.html";
    }).catch(function() {
        window.location.href = "index.html";
    });
}

function setAdminMapLocation(lat, lng, zoomLevel, isEdit) {
    var latNum = parseFloat(lat);
    var lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return;
    var latId = isEdit ? "editLat" : "newLat";
    var lngId = isEdit ? "editLng" : "newLng";
    var latInp = document.getElementById(latId);
    var lngInp = document.getElementById(lngId);
    if (latInp) latInp.value = latNum.toFixed(6);
    if (lngInp) lngInp.value = lngNum.toFixed(6);
    var mapObj = isEdit ? adminEditMap : adminMap;
    var markerObj = isEdit ? adminEditMarker : adminMarker;
    if (mapObj) {
        mapObj.setView([latNum, lngNum], zoomLevel || 15);
        if (markerObj) {
            markerObj.setLatLng([latNum, lngNum]);
        } else {
            var newMarker = L.marker([latNum, lngNum]).addTo(mapObj);
            if (isEdit) adminEditMarker = newMarker; else adminMarker = newMarker;
        }
        setTimeout(function() { if (mapObj) mapObj.invalidateSize(); }, 150);
    }
}

function useCurrentLocationForAdminClinic(isEdit) {
    if (!navigator.geolocation) {
        alert(t("err_geo_unsupported"));
        return;
    }
    navigator.geolocation.getCurrentPosition(function(pos) {
        setAdminMapLocation(pos.coords.latitude, pos.coords.longitude, 16, isEdit);
    }, function() {
        alert(t("err_geo_failed"));
    }, { enableHighAccuracy: true, timeout: 10000 });
}

function attachAdminMapControl(mapInstance, isEdit) {
    if (!mapInstance || typeof L === "undefined") return;
    if (!isEdit && adminLocationControlAdded) return;
    if (isEdit && adminEditLocationControlAdded) return;
    var LocationControl = L.Control.extend({
        options: { position: "topright" },
        onAdd: function() {
            var btn = L.DomUtil.create("button", "leaflet-bar leaflet-control");
            btn.type = "button";
            btn.title = t("my_location_btn");
            btn.style.background = "#ffffff";
            btn.style.color = "#111827";
            btn.style.border = "1px solid rgba(0,0,0,0.2)";
            btn.style.borderRadius = "6px";
            btn.style.padding = "6px 10px";
            btn.style.fontWeight = "600";
            btn.style.fontSize = "12px";
            btn.style.cursor = "pointer";
            btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> ' + escapeHtmlAdmin(t("my_location_btn"));
            L.DomEvent.disableClickPropagation(btn);
            L.DomEvent.on(btn, "click", function(e) {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                useCurrentLocationForAdminClinic(isEdit);
            });
            return btn;
        }
    });
    mapInstance.addControl(new LocationControl());
    if (isEdit) adminEditLocationControlAdded = true; else adminLocationControlAdded = true;
}

function initAdminAddMapIfNeeded() {
    var mapEl = document.getElementById("admin-add-map");
    if (!mapEl || typeof L === "undefined") return;
    if (!adminMap) {
        adminMap = L.map("admin-add-map").setView([15.3694, 44.1910], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(adminMap);
        attachAdminMapControl(adminMap, false);
        adminMap.on("click", function(e) { setAdminMapLocation(e.latlng.lat, e.latlng.lng, adminMap.getZoom(), false); });
    }
    setTimeout(function() { if (adminMap) adminMap.invalidateSize(); }, 200);
}

function initAdminEditMapIfNeeded() {
    var mapEl = document.getElementById("admin-edit-map");
    if (!mapEl || typeof L === "undefined") return;
    if (!adminEditMap) {
        adminEditMap = L.map("admin-edit-map").setView([15.3694, 44.1910], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(adminEditMap);
        attachAdminMapControl(adminEditMap, true);
        adminEditMap.on("click", function(e) { setAdminMapLocation(e.latlng.lat, e.latlng.lng, adminEditMap.getZoom(), true); });
    }
    setTimeout(function() { if (adminEditMap) adminEditMap.invalidateSize(); }, 200);
}

function openAddClinicModal() {
    var modal = document.getElementById("addClinicModal");
    if (!modal) return;
    var inputs = ["newClinicName", "newClinicNameEn", "newCity", "newCityEn", "newStreet", "newStreetEn", "newLandmark", "newLat", "newLng"];
    inputs.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = "";
    });
    var startEl = document.getElementById("newStartTime");
    var endEl = document.getElementById("newEndTime");
    var serviceEl = document.getElementById("newServiceTime");
    if (startEl) startEl.value = "09:00";
    if (endEl) endEl.value = "17:00";
    if (serviceEl) serviceEl.value = "10";
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("newDay_" + d);
        if (cb) cb.checked = true;
    }
    modal.classList.remove("hidden");
    initAdminAddMapIfNeeded();
}

function closeAddClinicModal() {
    var modal = document.getElementById("addClinicModal");
    if (modal) modal.classList.add("hidden");
}

function collectNewClinicData() {
    var workingDays = [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("newDay_" + d);
        if (cb && cb.checked) workingDays.push(d);
    }
    var latRaw = parseFloat(((document.getElementById("newLat") || {}).value || ""));
    var lngRaw = parseFloat(((document.getElementById("newLng") || {}).value || ""));
    return {
        clinicName: ((document.getElementById("newClinicName") || {}).value || "").trim(),
        clinicNameEn: ((document.getElementById("newClinicNameEn") || {}).value || "").trim(),
        city: ((document.getElementById("newCity") || {}).value || "").trim(),
        cityEn: ((document.getElementById("newCityEn") || {}).value || "").trim(),
        street: ((document.getElementById("newStreet") || {}).value || "").trim(),
        streetEn: ((document.getElementById("newStreetEn") || {}).value || "").trim(),
        landmark: ((document.getElementById("newLandmark") || {}).value || "").trim(),
        startTime: ((document.getElementById("newStartTime") || {}).value || "09:00"),
        endTime: ((document.getElementById("newEndTime") || {}).value || "17:00"),
        serviceTime: parseInt(((document.getElementById("newServiceTime") || {}).value || "10"), 10) || 10,
        workingDays: workingDays,
        lat: isNaN(latRaw) ? null : latRaw,
        lng: isNaN(lngRaw) ? null : lngRaw,
        serialNumber: 0,
        dailyCounters: {},
        isClosed: false,
        isOnBreak: false
    };
}

function saveNewClinic() {
    if (!currentDoctorData) return;
    var clinic = collectNewClinicData();
    if (!clinic.clinicName) {
        alert(t("err_enter_clinic_name"));
        return;
    }
    var clinics = currentDoctorData.clinics.slice();
    clinics.push(clinic);
    db.collection("doctors").doc(currentDoctorId).update({ clinics: clinics }).then(function() {
        alert(t("msg_clinic_added"));
        selectedClinicIndexAdmin = clinics.length - 1;
        closeAddClinicModal();
    }).catch(function(err) {
        console.error(err);
        alert(t("err_add_clinic_failed"));
    });
}

function openEditClinicModal() {
    if (!currentClinicData) {
        alert(t("err_no_clinic_to_edit"));
        return;
    }
    var modal = document.getElementById("editClinicModal");
    if (!modal) return;
    var c = currentClinicData;
    var setVal = function(id, val) {
        var el = document.getElementById(id);
        if (el) el.value = val || "";
    };
    setVal("editClinicName", c.clinicName);
    setVal("editClinicNameEn", c.clinicNameEn);
    setVal("editCity", c.city);
    setVal("editCityEn", c.cityEn);
    setVal("editStreet", c.street);
    setVal("editStreetEn", c.streetEn);
    setVal("editLandmark", c.landmark);
    setVal("editStartTime", c.startTime || "09:00");
    setVal("editEndTime", c.endTime || "17:00");
    setVal("editServiceTime", c.serviceTime || 10);
    setVal("editLat", c.lat);
    setVal("editLng", c.lng);
    var days = Array.isArray(c.workingDays) ? c.workingDays : [0, 1, 2, 3, 4, 5, 6];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("editDay_" + d);
        if (cb) cb.checked = days.indexOf(d) !== -1;
    }
    var delInput = document.getElementById("deleteClinicPhraseInput");
    if (delInput) delInput.value = "";
    modal.classList.remove("hidden");
    initAdminEditMapIfNeeded();
    if (c.lat && c.lng) {
        setTimeout(function() { setAdminMapLocation(c.lat, c.lng, 15, true); }, 250);
    }
}

function closeEditClinicModal() {
    var modal = document.getElementById("editClinicModal");
    if (modal) modal.classList.add("hidden");
}

function collectEditedClinicData() {
    var workingDays = [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("editDay_" + d);
        if (cb && cb.checked) workingDays.push(d);
    }
    var latRaw = parseFloat(((document.getElementById("editLat") || {}).value || ""));
    var lngRaw = parseFloat(((document.getElementById("editLng") || {}).value || ""));
    var base = currentClinicData ? Object.assign({}, currentClinicData) : {};
    base.clinicName = ((document.getElementById("editClinicName") || {}).value || "").trim();
    base.clinicNameEn = ((document.getElementById("editClinicNameEn") || {}).value || "").trim();
    base.city = ((document.getElementById("editCity") || {}).value || "").trim();
    base.cityEn = ((document.getElementById("editCityEn") || {}).value || "").trim();
    base.street = ((document.getElementById("editStreet") || {}).value || "").trim();
    base.streetEn = ((document.getElementById("editStreetEn") || {}).value || "").trim();
    base.landmark = ((document.getElementById("editLandmark") || {}).value || "").trim();
    base.startTime = ((document.getElementById("editStartTime") || {}).value || "09:00");
    base.endTime = ((document.getElementById("editEndTime") || {}).value || "17:00");
    base.serviceTime = parseInt(((document.getElementById("editServiceTime") || {}).value || "10"), 10) || 10;
    base.workingDays = workingDays;
    base.lat = isNaN(latRaw) ? null : latRaw;
    base.lng = isNaN(lngRaw) ? null : lngRaw;
    return base;
}

function saveEditedClinic() {
    if (!currentDoctorData || !currentClinicData) {
        alert(t("err_no_clinic_to_edit"));
        return;
    }
    var updated = collectEditedClinicData();
    if (!updated.clinicName) {
        alert(t("err_enter_clinic_name"));
        return;
    }
    var clinics = currentDoctorData.clinics.slice();
    clinics[selectedClinicIndexAdmin] = updated;
    db.collection("doctors").doc(currentDoctorId).update({ clinics: clinics }).then(function() {
        alert(t("msg_clinic_updated"));
        closeEditClinicModal();
    }).catch(function(err) {
        console.error(err);
        alert(t("err_update_clinic_failed"));
    });
}

function deleteCurrentClinic() {
    if (!currentDoctorData || !currentClinicData) {
        alert(t("err_no_clinic_to_edit"));
        return;
    }
    var phraseInput = document.getElementById("deleteClinicPhraseInput");
    var typed = phraseInput ? phraseInput.value.trim() : "";
    var requiredPhrase = t("delete_clinic_phrase");
    if (typed !== requiredPhrase) {
        alert(t("err_delete_phrase_mismatch"));
        return;
    }
    var clinics = currentDoctorData.clinics.slice();
    clinics.splice(selectedClinicIndexAdmin, 1);
    var dateStr = getAdminSelectedDate();
    db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .where("clinicIndex", "==", selectedClinicIndexAdmin)
        .get()
        .then(function(snap) {
            var batch = db.batch();
            snap.forEach(function(doc) {
                batch.delete(doc.ref);
            });
            return batch.commit();
        })
        .then(function() {
            return db.collection("doctors").doc(currentDoctorId).update({ clinics: clinics });
        })
        .then(function() {
            if (clinics.length === 0) {
                var wantDeleteDoctor = confirm(t("confirm_delete_doctor_record"));
                if (wantDeleteDoctor) {
                    return db.collection("doctors").doc(currentDoctorId).update({ clinics: [], isDeleted: true }).then(function() {
                        alert(t("msg_doctor_record_deleted"));
                        return auth.signOut().then(function() { window.location.href = "index.html"; });
                    });
                }
            }
            alert(t("msg_clinic_deleted"));
            selectedClinicIndexAdmin = 0;
            closeEditClinicModal();
        })
        .catch(function(err) {
            console.error(err);
            alert(t("err_delete_clinic_failed"));
        });
}

function toggleThemeAdmin() {
    if (typeof toggleTheme === "function") {
        toggleTheme();
    } else {
        document.body.classList.toggle("dark-mode");
        var isDark = document.body.classList.contains("dark-mode");
        localStorage.setItem("douri_theme", isDark ? "dark" : "light");
    }
}

function applySavedThemeAdmin() {
    if (typeof applySavedTheme === "function") {
        applySavedTheme();
        return;
    }
    var saved = localStorage.getItem("douri_theme");
    if (saved === "dark") document.body.classList.add("dark-mode");
    else document.body.classList.remove("dark-mode");
}

window.onload = function() {
    applySavedThemeAdmin();
    if (typeof applyLanguage === "function") {
        applyLanguage();
    }
    var dateInput = document.getElementById("adminDate");
    if (dateInput && !dateInput.value) {
        dateInput.value = getTodayStrAdmin();
    }
    checkAuthAndLoad();
};
