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
var selectedClinicIndex = 0;
var unsubscribeQueue = null;
var unsubscribeDoctorDoc = null;
var latestBookings = [];

var addMap = null;
var addMarker = null;
var addLocationControlAdded = false;

var editMap = null;
var editMarker = null;
var editLocationControlAdded = false;

var callSoundCtx = null;

function getTodayStr() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, "0");
    var d = String(now.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
}

function parseMinutesFromHHMM(timeStr) {
    if (!timeStr || typeof timeStr !== "string") return null;
    var parts = timeStr.split(":");
    if (parts.length < 2) return null;
    var h = parseInt(parts[0], 10);
    var min = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(min)) return null;
    return h * 60 + min;
}

function getSelectedAdminDate() {
    var input = document.getElementById("adminDate");
    var val = input ? input.value : "";
    if (!val) {
        val = getTodayStr();
        if (input) input.value = val;
    }
    return val;
}

function getDayOfWeekFromYMD(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return null;
    var parts = dateStr.split("-");
    if (parts.length !== 3) return null;
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m, d).getDay();
}

function isClinicWorkingOnDate(clinic, dateStr) {
    if (!clinic || !dateStr) return false;
    var dayOfWeek = getDayOfWeekFromYMD(dateStr);
    if (dayOfWeek === null) return false;
    if (!Array.isArray(clinic.workingDays) || clinic.workingDays.length === 0) {
        return true;
    }
    for (var i = 0; i < clinic.workingDays.length; i++) {
        if (parseInt(clinic.workingDays[i], 10) === dayOfWeek) {
            return true;
        }
    }
    return false;
}

function syncClinicToSelectedDate(dateStr) {
    if (!currentDoctorData || !Array.isArray(currentDoctorData.clinics) || currentDoctorData.clinics.length === 0) {
        return false;
    }
    var targetDate = dateStr || getSelectedAdminDate();
    var currentClinic = currentDoctorData.clinics[selectedClinicIndex];
    if (currentClinic && isClinicWorkingOnDate(currentClinic, targetDate)) {
        return false;
    }
    for (var i = 0; i < currentDoctorData.clinics.length; i++) {
        if (isClinicWorkingOnDate(currentDoctorData.clinics[i], targetDate)) {
            selectedClinicIndex = i;
            var sel = document.getElementById("clinicSelector");
            if (sel) sel.value = String(i);
            return true;
        }
    }
    return false;
}

function playCallAlertTone() {
    try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!callSoundCtx) {
            callSoundCtx = new AudioCtx();
        }
        if (callSoundCtx.state === "suspended") {
            callSoundCtx.resume();
        }
        var now = callSoundCtx.currentTime;
        var freqs = [587.33, 783.99, 1046.5];
        for (var i = 0; i < freqs.length; i++) {
            var osc = callSoundCtx.createOscillator();
            var gain = callSoundCtx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freqs[i], now + i * 0.14);
            gain.gain.setValueAtTime(0.001, now + i * 0.14);
            gain.gain.exponentialRampToValueAtTime(0.22, now + i * 0.14 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.13);
            osc.connect(gain);
            gain.connect(callSoundCtx.destination);
            osc.start(now + i * 0.14);
            osc.stop(now + i * 0.14 + 0.14);
        }
    } catch (e) {}
}

function canCallPatientsForDateAndClinic(dateStr, clinic) {
    var todayStr = getTodayStr();
    if (dateStr > todayStr) {
        return {
            allowed: false,
            message: t("err_future_date_call").replace("{date}", dateStr)
        };
    }
    if (dateStr === todayStr && clinic && clinic.startTime) {
        var startMin = parseMinutesFromHHMM(clinic.startTime);
        if (startMin !== null) {
            var now = new Date();
            var nowMin = now.getHours() * 60 + now.getMinutes();
            if (nowMin < startMin) {
                return {
                    allowed: false,
                    message: t("err_before_open_call").replace("{time}", clinic.startTime)
                };
            }
        }
    }
    return { allowed: true, message: "" };
}

function getOrderedActiveQueue() {
    var active = latestBookings.filter(function(b) {
        return b && b.status !== "done" && b.status !== "cancelled";
    });
    active.sort(function(a, b) {
        var numDiff = (parseInt(a.ticketNumber, 10) || 0) - (parseInt(b.ticketNumber, 10) || 0);
        if (numDiff !== 0) return numDiff;
        return (parseInt(a.serialNumber, 10) || 0) - (parseInt(b.serialNumber, 10) || 0);
    });
    return active;
}

function isEarlierPatientUnfinished(targetBookingId) {
    var ordered = getOrderedActiveQueue();
    for (var i = 0; i < ordered.length; i++) {
        var item = ordered[i];
        if (item.id === targetBookingId) {
            return false;
        }
        if (item.status === "waiting" || item.status === "serving") {
            return true;
        }
    }
    return false;
}

function updateExportButtonsState(hasBookings) {
    var pdfBtn = document.getElementById("printQueuePdfBtn");
    if (!pdfBtn) return;
    if (hasBookings) {
        pdfBtn.disabled = false;
        pdfBtn.classList.remove("export-btn-disabled");
    } else {
        pdfBtn.disabled = true;
        pdfBtn.classList.add("export-btn-disabled");
    }
}

function getLocalizedClinicTitle(clinic, idx) {
    if (!clinic) return t("clinic_prefix") + (idx + 1);
    if (getCurrentLang() === "en" && clinic.clinicNameEn && String(clinic.clinicNameEn).trim()) {
        return String(clinic.clinicNameEn).trim();
    }
    return clinic.clinicName || (t("clinic_prefix") + (idx + 1));
}

function getBookingStatusLabel(status) {
    if (status === "serving") return t("status_serving");
    if (status === "done") return t("booking_done");
    if (status === "cancelled") return t("booking_cancelled");
    return t("status_waiting_admin");
}

function buildPrintableSheetHtml() {
    var dateStr = getSelectedAdminDate();
    var clinics = (currentDoctorData && Array.isArray(currentDoctorData.clinics)) ? currentDoctorData.clinics : [];
    var clinic = clinics[selectedClinicIndex] || {};
    var clinicTitle = getLocalizedClinicTitle(clinic, selectedClinicIndex);
    var doctorTitle = (getCurrentLang() === "en" && currentDoctorData && currentDoctorData.nameEn)
        ? currentDoctorData.nameEn
        : ((currentDoctorData && currentDoctorData.name) || t("admin_default_doctor"));

    var rowsHtml = "";
    latestBookings.forEach(function(b, index) {
        var ticketNum = b.ticketNumber || (index + 1);
        var pName = b.patientName || "-";
        var pPhone = b.patientPhone || "-";
        var statusText = getBookingStatusLabel(b.status);
        rowsHtml += "<tr>" +
            "<td>#" + ticketNum + "</td>" +
            "<td>" + pName + "</td>" +
            "<td>" + pPhone + "</td>" +
            "<td>" + statusText + "</td>" +
            '<td class="print-pay-col"></td>' +
            "</tr>";
    });

    return '<div class="print-sheet-header">' +
        "<h2>" + clinicTitle + "</h2>" +
        "<p><strong>" + t("doctor_name_label") + ":</strong> " + doctorTitle + "</p>" +
        "<p><strong>" + t("date_label") + "</strong> " + dateStr + " | <strong>الإجمالي:</strong> " + latestBookings.length + "</p>" +
        "</div>" +
        '<table class="print-queue-table">' +
        "<thead><tr>" +
        "<th>" + t("your_ticket_label") + "</th>" +
        "<th>" + t("patient_name_label") + "</th>" +
        "<th>" + t("patient_phone_label") + "</th>" +
        "<th>" + t("stat_status_label") + "</th>" +
        "<th>الدفع / تأكيد</th>" +
        "</tr></thead>" +
        "<tbody>" + rowsHtml + "</tbody>" +
        "</table>";
}

function printQueueSheetPdf() {
    if (!Array.isArray(latestBookings) || latestBookings.length === 0) {
        alert(t("err_no_bookings_to_export"));
        return;
    }
    var sheetEl = document.getElementById("printableQueueSheet");
    if (!sheetEl) return;
    sheetEl.innerHTML = buildPrintableSheetHtml();
    sheetEl.setAttribute("aria-hidden", "false");
    setTimeout(function() {
        window.print();
        setTimeout(function() {
            sheetEl.setAttribute("aria-hidden", "true");
        }, 400);
    }, 80);
}

auth.onAuthStateChanged(function(user) {
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    currentDoctorId = user.uid;
    var dateInput = document.getElementById("adminDate");
    if (dateInput && !dateInput.value) {
        dateInput.value = getTodayStr();
    }
    listenToDoctorProfile(user.uid);
});

function listenToDoctorProfile(uid) {
    if (unsubscribeDoctorDoc) {
        unsubscribeDoctorDoc();
    }
    unsubscribeDoctorDoc = db.collection("doctors").doc(uid).onSnapshot(function(docSnap) {
        if (!docSnap.exists) {
            window.location.href = "index.html";
            return;
        }
        var data = docSnap.data();
        if (data.isDeleted === true) {
            window.location.href = "index.html";
            return;
        }
        currentDoctorData = data;
        var nameEl = document.getElementById("activeDoctorName");
        if (nameEl) {
            var dispName = (getCurrentLang() === "en" && data.nameEn) ? data.nameEn : (data.name || t("admin_default_doctor"));
            nameEl.innerText = dispName;
        }
        syncClinicToSelectedDate(getSelectedAdminDate());
        populateClinicSelector();
        updateClinicStatusUI();
        listenToQueue();
    }, function(err) {
        console.error(err);
    });
}

function populateClinicSelector() {
    var select = document.getElementById("clinicSelector");
    if (!select) return;

    var clinics = (currentDoctorData && Array.isArray(currentDoctorData.clinics)) ? currentDoctorData.clinics : [];
    if (clinics.length === 0) {
        selectedClinicIndex = 0;
        select.innerHTML = '<option value="">' + t("no_clinics_option") + '</option>';
        return;
    }

    if (selectedClinicIndex >= clinics.length) {
        selectedClinicIndex = 0;
    }

    var html = "";
    clinics.forEach(function(c, idx) {
        var label = getLocalizedClinicTitle(c, idx);
        var cityLabel = (getCurrentLang() === "en" && c.cityEn) ? c.cityEn : (c.city || "");
        if (cityLabel) {
            label += " - " + cityLabel;
        }
        html += '<option value="' + idx + '"' + (idx === selectedClinicIndex ? " selected" : "") + '>' + label + '</option>';
    });
    select.innerHTML = html;
}

function changeClinic() {
    var select = document.getElementById("clinicSelector");
    if (!select) return;
    selectedClinicIndex = parseInt(select.value, 10) || 0;
    updateClinicStatusUI();
    listenToQueue();
}

function changeAdminDate() {
    var dateStr = getSelectedAdminDate();
    syncClinicToSelectedDate(dateStr);
    populateClinicSelector();
    updateClinicStatusUI();
    listenToQueue();
}

function updateClinicStatusUI() {
    var clinics = (currentDoctorData && Array.isArray(currentDoctorData.clinics)) ? currentDoctorData.clinics : [];
    var clinic = clinics[selectedClinicIndex];
    var btn = document.getElementById("toggleClinicBtn");
    var statusTextEl = document.getElementById("adminClinicStatusText");

    var isClosed = clinic ? (clinic.isClosed === true) : true;
    var isOnBreak = clinic ? (clinic.isOnBreak === true) : false;

    if (statusTextEl) {
        if (!clinic) {
            statusTextEl.innerText = "-";
        } else if (isClosed) {
            statusTextEl.innerText = t("closed_temp");
        } else if (isOnBreak) {
            statusTextEl.innerText = t("on_break");
        } else {
            statusTextEl.innerText = t("available");
        }
    }

    if (btn) {
        var span = btn.querySelector("span");
        var icon = btn.querySelector("i");
        if (isClosed) {
            btn.className = "status-toggle-btn status-closed";
            if (icon) icon.className = "fa-solid fa-lock-open";
            if (span) span.innerText = t("open_clinic");
        } else {
            btn.className = "status-toggle-btn status-open";
            if (icon) icon.className = "fa-solid fa-lock";
            if (span) span.innerText = t("close_clinic");
        }
    }
}

function toggleClinicStatus() {
    if (!currentDoctorId || !currentDoctorData || !Array.isArray(currentDoctorData.clinics)) return;
    var clinics = currentDoctorData.clinics.slice();
    if (!clinics[selectedClinicIndex]) return;

    var nextClosed = !(clinics[selectedClinicIndex].isClosed === true);
    clinics[selectedClinicIndex].isClosed = nextClosed;

    db.collection("doctors").doc(currentDoctorId).update({ clinics: clinics }).then(function() {
        alert(nextClosed ? t("msg_clinic_closed_temp") : t("msg_clinic_opened"));
    }).catch(function(err) {
        console.error(err);
        alert(t("err_update_clinic_status"));
    });
}

function listenToQueue() {
    if (unsubscribeQueue) {
        unsubscribeQueue();
        unsubscribeQueue = null;
    }

    var listEl = document.getElementById("patientsQueue");
    var servingNumEl = document.getElementById("currentServingDisplay");
    var servingNameEl = document.getElementById("currentServingName");
    var servingSerialEl = document.getElementById("currentServingSerial");
    var waitingCountEl = document.getElementById("adminWaitingCount");
    var doneCountEl = document.getElementById("adminDoneCount");

    var clinics = (currentDoctorData && Array.isArray(currentDoctorData.clinics)) ? currentDoctorData.clinics : [];
    if (!currentDoctorId || clinics.length === 0) {
        latestBookings = [];
        updateExportButtonsState(false);
        if (waitingCountEl) waitingCountEl.innerText = "0";
        if (doneCountEl) doneCountEl.innerText = "0";
        if (servingNumEl) servingNumEl.innerText = "-";
        if (servingNameEl) servingNameEl.innerText = "-";
        if (servingSerialEl) servingSerialEl.innerText = "";
        if (listEl) {
            listEl.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + t("no_selected_clinic_msg") + '</p>';
        }
        return;
    }

    var dateStr = getSelectedAdminDate();

    unsubscribeQueue = db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .where("clinicIndex", "==", selectedClinicIndex)
        .where("date", "==", dateStr)
        .onSnapshot(function(snapshot) {
            var bookings = [];
            snapshot.forEach(function(doc) {
                var item = doc.data();
                item.id = doc.id;
                if (item.status !== "cancelled") {
                    bookings.push(item);
                }
            });

            bookings.sort(function(a, b) {
                var numDiff = (parseInt(a.ticketNumber, 10) || 0) - (parseInt(b.ticketNumber, 10) || 0);
                if (numDiff !== 0) return numDiff;
                return (parseInt(a.serialNumber, 10) || 0) - (parseInt(b.serialNumber, 10) || 0);
            });

            latestBookings = bookings;
            updateExportButtonsState(bookings.length > 0);

            var waitingTotal = 0;
            var doneTotal = 0;
            var servingItem = null;

            bookings.forEach(function(b) {
                if (b.status === "done") {
                    doneTotal++;
                } else {
                    waitingTotal++;
                    if (b.status === "serving" && !servingItem) {
                        servingItem = b;
                    }
                }
            });

            if (waitingCountEl) waitingCountEl.innerText = String(waitingTotal);
            if (doneCountEl) doneCountEl.innerText = String(doneTotal);

            if (servingItem) {
                if (servingNumEl) servingNumEl.innerText = "#" + (servingItem.ticketNumber || "-");
                if (servingNameEl) servingNameEl.innerText = servingItem.patientName || "-";
                if (servingSerialEl) {
                    servingSerialEl.innerText = servingItem.serialNumber ? (t("serial_prefix") + servingItem.serialNumber) : "";
                }
            } else {
                if (servingNumEl) servingNumEl.innerText = "-";
                if (servingNameEl) servingNameEl.innerText = "-";
                if (servingSerialEl) servingSerialEl.innerText = "";
            }

            renderPatientsQueue(bookings);
        }, function(err) {
            console.error(err);
        });
}

function renderPatientsQueue(bookings) {
    var listEl = document.getElementById("patientsQueue");
    if (!listEl) return;

    var visibleList = bookings.filter(function(b) {
        return b.status !== "done";
    });

    if (visibleList.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + t("no_patients") + '</p>';
        return;
    }

    var html = "";
    visibleList.forEach(function(b, idx) {
        var isServing = b.status === "serving";
        var ticketNum = b.ticketNumber || (idx + 1);
        var badgeClass = isServing ? "badge-open" : "badge-break";
        var badgeText = isServing ? t("status_serving") : t("status_waiting_admin");
        var serialText = b.serialNumber ? ('<small style="color:var(--text-muted); display:block;">' + t("serial_label") + ' ' + b.serialNumber + '</small>') : "";

        html += '<div class="queue-card ' + (isServing ? "serving" : "") + '">' +
            '<div class="queue-info">' +
                '<span class="queue-number">#' + ticketNum + '</span>' +
                '<div>' +
                    '<strong>' + (b.patientName || "") + '</strong>' +
                    '<div style="font-size:13px; color:var(--text-muted);">' + (b.patientPhone || "") + '</div>' +
                    serialText +
                '</div>' +
            '</div>' +
            '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;" class="queue-actions">' +
                '<span class="badge ' + badgeClass + '">' + badgeText + '</span>' +
                '<button type="button" class="btn-outline" onclick="callSpecificPatient(\'' + b.id + '\')"><i class="fa-solid fa-bullhorn"></i> ' + t("call_patient_btn") + '</button>' +
                '<button type="button" class="btn-primary" onclick="finishPatient(\'' + b.id + '\')"><i class="fa-solid fa-check"></i> ' + t("finish_patient_btn") + '</button>' +
                '<button type="button" class="btn-outline" onclick="deferPatient(\'' + b.id + '\')"><i class="fa-solid fa-forward"></i> ' + t("defer_patient_btn") + '</button>' +
            '</div>' +
        '</div>';
    });

    listEl.innerHTML = html;
}

function callNextPatient() {
    var dateStr = getSelectedAdminDate();
    var clinics = (currentDoctorData && Array.isArray(currentDoctorData.clinics)) ? currentDoctorData.clinics : [];
    var clinic = clinics[selectedClinicIndex] || null;

    var check = canCallPatientsForDateAndClinic(dateStr, clinic);
    if (!check.allowed) {
        alert(check.message);
        return;
    }

    var activeQueue = getOrderedActiveQueue();
    if (activeQueue.length === 0) {
        alert(t("err_no_waiting_patients"));
        return;
    }

    var currentServing = null;
    for (var i = 0; i < activeQueue.length; i++) {
        if (activeQueue[i].status === "serving") {
            currentServing = activeQueue[i];
            break;
        }
    }

    if (currentServing) {
        alert(t("err_must_finish_in_order"));
        return;
    }

    var nextPatient = activeQueue[0];
    if (!nextPatient) {
        alert(t("msg_all_patients_done"));
        return;
    }

    db.collection("bookings").doc(nextPatient.id).update({ status: "serving" }).then(function() {
        playCallAlertTone();
    }).catch(function(err) {
        console.error(err);
    });
}

function callSpecificPatient(bookingId) {
    var dateStr = getSelectedAdminDate();
    var clinics = (currentDoctorData && Array.isArray(currentDoctorData.clinics)) ? currentDoctorData.clinics : [];
    var clinic = clinics[selectedClinicIndex] || null;

    var check = canCallPatientsForDateAndClinic(dateStr, clinic);
    if (!check.allowed) {
        alert(check.message);
        return;
    }

    if (isEarlierPatientUnfinished(bookingId)) {
        alert(t("err_must_call_in_order"));
        return;
    }

    var batch = db.batch();
    latestBookings.forEach(function(b) {
        if (b.status === "serving" && b.id !== bookingId) {
            batch.update(db.collection("bookings").doc(b.id), { status: "waiting" });
        }
    });
    batch.update(db.collection("bookings").doc(bookingId), { status: "serving" });

    batch.commit().then(function() {
        playCallAlertTone();
    }).catch(function(err) {
        console.error(err);
    });
}

function finishPatient(bookingId) {
    if (isEarlierPatientUnfinished(bookingId)) {
        alert(t("err_must_finish_in_order"));
        return;
    }

    db.collection("bookings").doc(bookingId).update({ status: "done" }).catch(function(err) {
        console.error(err);
    });
}

function deferPatient(bookingId) {
    var target = latestBookings.find(function(b) { return b.id === bookingId; });
    if (!target) return;

    var maxNum = 0;
    latestBookings.forEach(function(b) {
        var n = parseInt(b.ticketNumber, 10) || 0;
        if (n > maxNum) maxNum = n;
    });

    db.collection("bookings").doc(bookingId).update({
        status: "waiting",
        ticketNumber: maxNum + 1
    }).catch(function(err) {
        console.error(err);
    });
}

function setMapPickerLocation(which, lat, lng, zoom) {
    var latNum = parseFloat(lat);
    var lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return;

    var latFixed = latNum.toFixed(6);
    var lngFixed = lngNum.toFixed(6);

    if (which === "add") {
        var aLat = document.getElementById("addLat");
        var aLng = document.getElementById("addLng");
        if (aLat) aLat.value = latFixed;
        if (aLng) aLng.value = lngFixed;
        initAddMapIfNeeded();
        if (addMap) {
            addMap.setView([latNum, lngNum], zoom || 15);
            if (addMarker) {
                addMarker.setLatLng([latNum, lngNum]);
            } else {
                addMarker = L.marker([latNum, lngNum]).addTo(addMap);
            }
            setTimeout(function() { if (addMap) addMap.invalidateSize(); }, 150);
        }
    } else {
        var eLat = document.getElementById("editLat");
        var eLng = document.getElementById("editLng");
        if (eLat) eLat.value = latFixed;
        if (eLng) eLng.value = lngFixed;
        initEditMapIfNeeded();
        if (editMap) {
            editMap.setView([latNum, lngNum], zoom || 15);
            if (editMarker) {
                editMarker.setLatLng([latNum, lngNum]);
            } else {
                editMarker = L.marker([latNum, lngNum]).addTo(editMap);
            }
            setTimeout(function() { if (editMap) editMap.invalidateSize(); }, 150);
        }
    }
}

function useCurrentLocationForAddClinic() {
    if (!navigator.geolocation) {
        alert(t("err_geo_unsupported"));
        return;
    }
    navigator.geolocation.getCurrentPosition(function(pos) {
        setMapPickerLocation("add", pos.coords.latitude, pos.coords.longitude, 16);
    }, function() {
        alert(t("err_geo_short"));
    }, { enableHighAccuracy: true, timeout: 10000 });
}

function useCurrentLocationForEditClinic() {
    if (!navigator.geolocation) {
        alert(t("err_geo_unsupported"));
        return;
    }
    navigator.geolocation.getCurrentPosition(function(pos) {
        setMapPickerLocation("edit", pos.coords.latitude, pos.coords.longitude, 16);
    }, function() {
        alert(t("err_geo_short"));
    }, { enableHighAccuracy: true, timeout: 10000 });
}

function attachAdminMapLocationControl(mapInstance, which) {
    if (!mapInstance || typeof L === "undefined") return;
    if (which === "add" && addLocationControlAdded) return;
    if (which === "edit" && editLocationControlAdded) return;

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
            btn.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
            btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> ' + t("my_location_btn");

            L.DomEvent.disableClickPropagation(btn);
            L.DomEvent.on(btn, "click", function(e) {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                if (which === "add") {
                    useCurrentLocationForAddClinic();
                } else {
                    useCurrentLocationForEditClinic();
                }
            });
            return btn;
        }
    });

    mapInstance.addControl(new LocationControl());
    if (which === "add") addLocationControlAdded = true;
    if (which === "edit") editLocationControlAdded = true;
}

function initAddMapIfNeeded() {
    var el = document.getElementById("add-map");
    if (!el || typeof L === "undefined") return;
    if (!addMap) {
        addMap = L.map("add-map").setView([15.3694, 44.1910], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap"
        }).addTo(addMap);
        attachAdminMapLocationControl(addMap, "add");
        addMap.on("click", function(e) {
            setMapPickerLocation("add", e.latlng.lat, e.latlng.lng, addMap.getZoom());
        });
    }
    setTimeout(function() { if (addMap) addMap.invalidateSize(); }, 200);
}

function initEditMapIfNeeded() {
    var el = document.getElementById("edit-map");
    if (!el || typeof L === "undefined") return;
    if (!editMap) {
        editMap = L.map("edit-map").setView([15.3694, 44.1910], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap"
        }).addTo(editMap);
        attachAdminMapLocationControl(editMap, "edit");
        editMap.on("click", function(e) {
            setMapPickerLocation("edit", e.latlng.lat, e.latlng.lng, editMap.getZoom());
        });
    }
    setTimeout(function() { if (editMap) editMap.invalidateSize(); }, 200);
}

function openAddClinicModal() {
    var modal = document.getElementById("addClinicModal");
    if (!modal) return;
    ["addClinicName", "addCity", "addStreet", "addLandmark", "addLat", "addLng"].forEach(function(id) {
        var inp = document.getElementById(id);
        if (inp) inp.value = "";
    });
    var st = document.getElementById("addStartTime");
    var et = document.getElementById("addEndTime");
    var srv = document.getElementById("addServiceTime");
    if (st) st.value = "09:00";
    if (et) et.value = "17:00";
    if (srv) srv.value = "10";
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("add_day_" + d);
        if (cb) cb.checked = false;
    }
    modal.classList.remove("hidden");
    initAddMapIfNeeded();
}

function closeAddClinicModal() {
    var modal = document.getElementById("addClinicModal");
    if (modal) modal.classList.add("hidden");
}

function saveNewClinic() {
    var uid = currentDoctorId || (auth.currentUser ? auth.currentUser.uid : null);
    if (!uid) {
        alert(t("err_add_clinic_failed"));
        return;
    }

    var clinicName = ((document.getElementById("addClinicName") || {}).value || "").trim();
    if (!clinicName) {
        alert(t("err_enter_clinic_name"));
        return;
    }

    var city = ((document.getElementById("addCity") || {}).value || "").trim();
    var street = ((document.getElementById("addStreet") || {}).value || "").trim();
    var landmark = ((document.getElementById("addLandmark") || {}).value || "").trim();
    var startTime = ((document.getElementById("addStartTime") || {}).value || "09:00");
    var endTime = ((document.getElementById("addEndTime") || {}).value || "17:00");
    var serviceTime = parseInt(((document.getElementById("addServiceTime") || {}).value || "10"), 10);
    if (isNaN(serviceTime) || serviceTime <= 0) serviceTime = 10;

    var latVal = parseFloat(((document.getElementById("addLat") || {}).value || ""));
    var lngVal = parseFloat(((document.getElementById("addLng") || {}).value || ""));

    var workingDays = [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("add_day_" + d);
        if (cb && cb.checked) workingDays.push(d);
    }

    var newClinic = {
        clinicName: clinicName,
        city: city,
        street: street,
        landmark: landmark,
        startTime: startTime,
        endTime: endTime,
        serviceTime: serviceTime,
        workingDays: workingDays,
        lat: isNaN(latVal) ? null : latVal,
        lng: isNaN(lngVal) ? null : lngVal,
        serialNumber: 0,
        dailyCounters: {},
        isClosed: false,
        isOnBreak: false
    };

    var docRef = db.collection("doctors").doc(uid);

    db.runTransaction(function(transaction) {
        return transaction.get(docRef).then(function(docSnap) {
            var existingClinics = [];
            if (docSnap.exists) {
                var docData = docSnap.data() || {};
                if (Array.isArray(docData.clinics)) {
                    existingClinics = docData.clinics.slice();
                }
            }
            existingClinics.push(newClinic);
            selectedClinicIndex = existingClinics.length - 1;
            transaction.set(docRef, {
                ownerUid: uid,
                clinics: existingClinics,
                isDeleted: false
            }, { merge: true });
        });
    }).then(function() {
        closeAddClinicModal();
        alert(t("msg_clinic_added"));
    }).catch(function(err) {
        console.error(err);
        alert(t("err_add_clinic_failed"));
    });
}

function openEditClinicModal() {
    var clinics = (currentDoctorData && Array.isArray(currentDoctorData.clinics)) ? currentDoctorData.clinics : [];
    var clinic = clinics[selectedClinicIndex];
    if (!clinic) {
        alert(t("err_no_clinic_to_edit"));
        return;
    }

    var modal = document.getElementById("editClinicModal");
    if (!modal) return;

    var setVal = function(id, v) {
        var el = document.getElementById(id);
        if (el) el.value = v !== undefined && v !== null ? v : "";
    };

    setVal("editClinicName", clinic.clinicName || "");
    setVal("editCity", clinic.city || "");
    setVal("editStreet", clinic.street || "");
    setVal("editLandmark", clinic.landmark || "");
    setVal("editStartTime", clinic.startTime || "09:00");
    setVal("editEndTime", clinic.endTime || "17:00");
    setVal("editServiceTime", clinic.serviceTime || 10);
    setVal("editLat", clinic.lat !== undefined && clinic.lat !== null ? clinic.lat : "");
    setVal("editLng", clinic.lng !== undefined && clinic.lng !== null ? clinic.lng : "");
    setVal("deleteClinicConfirmInput", "");

    var wDays = Array.isArray(clinic.workingDays) ? clinic.workingDays : [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("edit_day_" + d);
        if (cb) cb.checked = wDays.indexOf(d) !== -1;
    }

    modal.classList.remove("hidden");
    initEditMapIfNeeded();

    if (clinic.lat && clinic.lng && !isNaN(parseFloat(clinic.lat)) && !isNaN(parseFloat(clinic.lng))) {
        setMapPickerLocation("edit", clinic.lat, clinic.lng, 15);
    } else {
        setTimeout(function() { if (editMap) editMap.invalidateSize(); }, 200);
    }
}

function closeEditClinicModal() {
    var modal = document.getElementById("editClinicModal");
    if (modal) modal.classList.add("hidden");
}

function saveEditClinic() {
    var uid = currentDoctorId || (auth.currentUser ? auth.currentUser.uid : null);
    if (!uid || !currentDoctorData || !Array.isArray(currentDoctorData.clinics)) return;

    var clinicName = ((document.getElementById("editClinicName") || {}).value || "").trim();
    if (!clinicName) {
        alert(t("err_enter_clinic_name"));
        return;
    }

    var clinics = currentDoctorData.clinics.slice();
    var existing = clinics[selectedClinicIndex];
    if (!existing) return;

    var serviceTime = parseInt(((document.getElementById("editServiceTime") || {}).value || "10"), 10);
    if (isNaN(serviceTime) || serviceTime <= 0) serviceTime = 10;

    var latVal = parseFloat(((document.getElementById("editLat") || {}).value || ""));
    var lngVal = parseFloat(((document.getElementById("editLng") || {}).value || ""));

    var workingDays = [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("edit_day_" + d);
        if (cb && cb.checked) workingDays.push(d);
    }

    clinics[selectedClinicIndex] = Object.assign({}, existing, {
        clinicName: clinicName,
        city: ((document.getElementById("editCity") || {}).value || "").trim(),
        street: ((document.getElementById("editStreet") || {}).value || "").trim(),
        landmark: ((document.getElementById("editLandmark") || {}).value || "").trim(),
        startTime: ((document.getElementById("editStartTime") || {}).value || "09:00"),
        endTime: ((document.getElementById("editEndTime") || {}).value || "17:00"),
        serviceTime: serviceTime,
        workingDays: workingDays,
        lat: isNaN(latVal) ? null : latVal,
        lng: isNaN(lngVal) ? null : lngVal
    });

    db.collection("doctors").doc(uid).update({ clinics: clinics }).then(function() {
        closeEditClinicModal();
        alert(t("msg_clinic_updated"));
    }).catch(function(err) {
        console.error(err);
        alert(t("err_update_clinic_failed"));
    });
}

function deleteBookingsForClinic(doctorId, clinicIdx) {
    return db.collection("bookings")
        .where("doctorId", "==", doctorId)
        .where("clinicIndex", "==", clinicIdx)
        .get()
        .then(function(snap) {
            if (snap.empty) return;
            var batch = db.batch();
            snap.forEach(function(doc) {
                batch.delete(doc.ref);
            });
            return batch.commit();
        });
}

function deleteAllBookingsForDoctor(doctorId) {
    return db.collection("bookings")
        .where("doctorId", "==", doctorId)
        .get()
        .then(function(snap) {
            if (snap.empty) return;
            var batch = db.batch();
            snap.forEach(function(doc) {
                batch.delete(doc.ref);
            });
            return batch.commit();
        });
}

function deleteCurrentClinic() {
    var uid = currentDoctorId || (auth.currentUser ? auth.currentUser.uid : null);
    if (!uid || !currentDoctorData || !Array.isArray(currentDoctorData.clinics)) return;

    var confirmInput = document.getElementById("deleteClinicConfirmInput");
    var phrase = confirmInput ? confirmInput.value.trim() : "";
    if (phrase !== "إحذف العيادة") {
        alert(t("err_delete_phrase_mismatch"));
        return;
    }

    var targetIdx = selectedClinicIndex;
    var remainingClinics = currentDoctorData.clinics.filter(function(_, idx) {
        return idx !== targetIdx;
    });

    deleteBookingsForClinic(uid, targetIdx).then(function() {
        if (remainingClinics.length === 0) {
            var shouldDeleteRecord = confirm(t("confirm_delete_doctor_record"));
            if (shouldDeleteRecord) {
                return deleteAllBookingsForDoctor(uid).then(function() {
                    return db.collection("doctors").doc(uid).delete().then(function() {
                        closeEditClinicModal();
                        alert(t("msg_doctor_record_deleted"));
                        return auth.signOut().then(function() {
                            window.location.href = "index.html";
                        });
                    });
                });
            }
            return db.collection("doctors").doc(uid).update({
                clinics: [],
                isDeleted: true
            }).then(function() {
                closeEditClinicModal();
                alert(t("msg_clinic_deleted"));
                window.location.href = "index.html";
            });
        } else {
            selectedClinicIndex = 0;
            return db.collection("doctors").doc(uid).update({ clinics: remainingClinics }).then(function() {
                closeEditClinicModal();
                alert(t("msg_clinic_deleted"));
            });
        }
    }).catch(function(err) {
        console.error(err);
        alert(t("err_delete_clinic_failed"));
    });
}

function logoutDoctor() {
    if (unsubscribeQueue) unsubscribeQueue();
    if (unsubscribeDoctorDoc) unsubscribeDoctorDoc();
    auth.signOut().then(function() {
        window.location.href = "index.html";
    });
}

window.onload = function() {
    if (typeof applyLanguage === "function") {
        applyLanguage();
    }
};
