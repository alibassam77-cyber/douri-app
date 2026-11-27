var auth = firebase.auth();
var db = firebase.firestore();

var currentDoctorId = null;
var currentDoctorData = null;
var selectedClinicIndex = 0;
var currentDateStr = getTodayStr();

var unsubscribeBookings = null;
var currentQueueDocs = [];

var addClinicMap = null;
var addClinicMarker = null;
var addClinicLocationControlAdded = false;

var editClinicMap = null;
var editClinicMarker = null;
var editClinicLocationControlAdded = false;

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

function getCurrentMinutesOfDay() {
    var now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

function getSelectedClinicObject() {
    if (!currentDoctorData || !Array.isArray(currentDoctorData.clinics)) return null;
    return currentDoctorData.clinics[selectedClinicIndex] || null;
}

function getClinicDisplayName(clinic, idx) {
    if (!clinic) return t("clinic_prefix") + ((idx || 0) + 1);
    if (getCurrentLang() === "en" && clinic.clinicNameEn && String(clinic.clinicNameEn).trim()) {
        return String(clinic.clinicNameEn).trim();
    }
    return clinic.clinicName || (t("clinic_prefix") + ((idx || 0) + 1));
}

function getDoctorDisplayName() {
    if (!currentDoctorData) return t("admin_default_doctor");
    if (getCurrentLang() === "en" && currentDoctorData.nameEn && String(currentDoctorData.nameEn).trim()) {
        return String(currentDoctorData.nameEn).trim();
    }
    return currentDoctorData.name || t("admin_default_doctor");
}

function setDoctorHeaderTitle() {
    var titleEl = document.getElementById("activeDoctorName") || document.getElementById("doctorTitle");
    if (titleEl) {
        titleEl.innerText = getDoctorDisplayName();
    }
}

function populateClinicSelector() {
    var selector = document.getElementById("clinicSelector");
    if (!selector) return;

    var clinics = (currentDoctorData && Array.isArray(currentDoctorData.clinics))
        ? currentDoctorData.clinics
        : [];

    if (clinics.length === 0) {
        selectedClinicIndex = 0;
        selector.innerHTML = '<option value="0">' + t("no_clinics_option") + '</option>';
        renderEmptyClinicState();
        return;
    }

    if (selectedClinicIndex >= clinics.length) {
        selectedClinicIndex = 0;
    }

    var html = "";
    clinics.forEach(function(clinic, idx) {
        var name = getClinicDisplayName(clinic, idx);
        var city = (getCurrentLang() === "en" && clinic.cityEn) ? clinic.cityEn : clinic.city;
        var label = city ? (name + " (" + city + ")") : name;
        html += '<option value="' + idx + '"' + (idx === selectedClinicIndex ? ' selected' : '') + '>' + label + '</option>';
    });
    selector.innerHTML = html;

    updateClinicStatusButton();
    listenToQueue();
}

function changeClinic() {
    var selector = document.getElementById("clinicSelector");
    if (!selector) return;
    var parsed = parseInt(selector.value, 10);
    selectedClinicIndex = isNaN(parsed) ? 0 : parsed;
    updateClinicStatusButton();
    listenToQueue();
}

function changeAdminDate() {
    var dateInput = document.getElementById("adminDate");
    if (dateInput && dateInput.value) {
        currentDateStr = dateInput.value;
    } else {
        currentDateStr = getTodayStr();
        if (dateInput) dateInput.value = currentDateStr;
    }
    listenToQueue();
}

function renderEmptyClinicState() {
    var waitingEl = document.getElementById("adminWaitingCount") || document.getElementById("waitingCount");
    var doneEl = document.getElementById("adminDoneCount") || document.getElementById("doneCount");
    var statusEl = document.getElementById("adminClinicStatusText") || document.getElementById("clinicStatusText");
    var servingEl = document.getElementById("currentServingDisplay") || document.getElementById("currentlyServing");
    var servingNameEl = document.getElementById("currentServingName");
    var servingSerialEl = document.getElementById("currentServingSerial");
    var listEl = document.getElementById("patientsQueue") || document.getElementById("queueList");

    if (waitingEl) waitingEl.innerText = "0";
    if (doneEl) doneEl.innerText = "0";
    if (statusEl) statusEl.innerText = t("closed_temp");
    if (servingEl) servingEl.innerText = "-";
    if (servingNameEl) servingNameEl.innerText = "-";
    if (servingSerialEl) servingSerialEl.innerText = "";
    if (listEl) {
        listEl.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + t("no_selected_clinic_msg") + '</p>';
    }
    updateExportButtonState(false);
}

function updateClinicStatusButton() {
    var btn = document.getElementById("toggleClinicBtn");
    var statusTextEl = document.getElementById("adminClinicStatusText") || document.getElementById("clinicStatusText");
    var clinic = getSelectedClinicObject();

    if (!clinic) {
        if (statusTextEl) statusTextEl.innerText = t("closed_temp");
        if (btn) {
            btn.className = "status-toggle-btn status-closed";
            btn.innerHTML = '<i class="fa-solid fa-door-open"></i> <span>' + t("open_clinic") + '</span>';
        }
        return;
    }

    var isClosed = clinic.isClosed === true;
    if (statusTextEl) {
        statusTextEl.innerText = isClosed ? t("closed_temp") : t("available");
    }
    if (btn) {
        if (isClosed) {
            btn.className = "status-toggle-btn status-closed";
            btn.innerHTML = '<i class="fa-solid fa-door-open"></i> <span>' + t("open_clinic") + '</span>';
        } else {
            btn.className = "status-toggle-btn status-open";
            btn.innerHTML = '<i class="fa-solid fa-door-closed"></i> <span>' + t("close_clinic") + '</span>';
        }
    }
}

function updateExportButtonState(hasBookings) {
    var exportBtn = document.getElementById("printQueuePdfBtn") || document.getElementById("save_send_pdf_btn") || document.getElementById("exportTxtBtn");
    if (!exportBtn) return;
    if (hasBookings) {
        exportBtn.disabled = false;
        exportBtn.classList.remove("export-btn-disabled");
    } else {
        exportBtn.disabled = true;
        exportBtn.classList.add("export-btn-disabled");
    }
}

function getQueueDisplayPriority(status) {
    if (status === "serving") return 0;
    if (status === "done") return 2;
    return 1;
}

function sortQueueForDoctorView(list) {
    return list.slice().sort(function(a, b) {
        var pa = getQueueDisplayPriority(a && a.status);
        var pb = getQueueDisplayPriority(b && b.status);
        if (pa !== pb) return pa - pb;

        var ta = parseInt(a && a.ticketNumber, 10) || 0;
        var tb = parseInt(b && b.ticketNumber, 10) || 0;
        if (ta !== tb) return ta - tb;

        var sa = parseInt(a && a.serialNumber, 10) || 0;
        var sb = parseInt(b && b.serialNumber, 10) || 0;
        return sa - sb;
    });
}

function listenToQueue() {
    if (unsubscribeBookings) {
        unsubscribeBookings();
        unsubscribeBookings = null;
    }

    var dateInput = document.getElementById("adminDate");
    if (dateInput && dateInput.value) {
        currentDateStr = dateInput.value;
    } else if (!currentDateStr) {
        currentDateStr = getTodayStr();
        if (dateInput) dateInput.value = currentDateStr;
    }

    var clinic = getSelectedClinicObject();
    if (!currentDoctorId || !clinic) {
        renderEmptyClinicState();
        return;
    }

    unsubscribeBookings = db.collection("bookings")
        .where("doctorId", "==", currentDoctorId)
        .where("clinicIndex", "==", selectedClinicIndex)
        .where("date", "==", currentDateStr)
        .onSnapshot(function(snap) {
            var list = [];
            snap.forEach(function(doc) {
                var item = doc.data();
                item.id = doc.id;
                list.push(item);
            });

            list = sortQueueForDoctorView(list);
            currentQueueDocs = list;
            renderQueueDashboard(list);
        }, function(err) {
            console.error(err);
        });
}

function renderQueueDashboard(bookings) {
    var waitingCount = 0;
    var doneCount = 0;
    var servingItem = null;

    var activeList = bookings.filter(function(b) {
        return b && b.status !== "cancelled";
    });

    activeList.forEach(function(b) {
        if (b.status === "done") {
            doneCount++;
        } else if (b.status === "serving") {
            if (!servingItem) servingItem = b;
            waitingCount++;
        } else {
            waitingCount++;
        }
    });

    var waitingEl = document.getElementById("adminWaitingCount") || document.getElementById("waitingCount");
    var doneEl = document.getElementById("adminDoneCount") || document.getElementById("doneCount");
    var servingEl = document.getElementById("currentServingDisplay") || document.getElementById("currentlyServing");
    var servingNameEl = document.getElementById("currentServingName");
    var servingSerialEl = document.getElementById("currentServingSerial");
    var listEl = document.getElementById("patientsQueue") || document.getElementById("queueList");

    if (waitingEl) waitingEl.innerText = String(waitingCount);
    if (doneEl) doneEl.innerText = String(doneCount);

    if (servingEl) {
        if (servingNameEl) {
            servingEl.innerText = servingItem ? ("#" + (servingItem.ticketNumber || "-")) : "-";
        } else {
            servingEl.innerText = servingItem
                ? ("#" + (servingItem.ticketNumber || "-") + " — " + (servingItem.patientName || ""))
                : "-";
        }
    }
    if (servingNameEl) {
        servingNameEl.innerText = servingItem ? (servingItem.patientName || "-") : "-";
    }
    if (servingSerialEl) {
        servingSerialEl.innerText = (servingItem && servingItem.serialNumber)
            ? (t("serial_prefix") + servingItem.serialNumber)
            : "";
    }

    updateExportButtonState(activeList.length > 0);

    if (!listEl) return;

    if (activeList.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + t("no_patients") + '</p>';
        return;
    }

    var orderedDisplayList = sortQueueForDoctorView(activeList);
    var html = "";
    orderedDisplayList.forEach(function(b) {
        var isServing = b.status === "serving";
        var isDone = b.status === "done";
        var badgeClass = isDone ? "badge-closed" : (isServing ? "badge-open" : "badge-break");
        var statusLabel = isDone ? t("booking_done") : (isServing ? t("status_serving") : t("status_waiting_admin"));
        var serialText = b.serialNumber ? (" • " + t("serial_label") + " " + b.serialNumber) : "";

        html += '<div class="queue-card' + (isServing ? " serving" : "") + '">' +
            '<div class="queue-info">' +
                '<span class="queue-number">#' + (b.ticketNumber || "-") + '</span>' +
                '<div>' +
                    '<strong>' + (b.patientName || "") + '</strong>' +
                    '<div style="font-size:12.5px; color:var(--text-muted);">' +
                        (b.patientPhone ? (b.patientPhone + serialText) : (b.serialNumber ? (t("serial_label") + " " + b.serialNumber) : "")) +
                    '</div>' +
                '</div>' +
                '<span class="badge ' + badgeClass + '">' + statusLabel + '</span>' +
            '</div>' +
            '<div class="clinic-actions queue-actions">' +
                '<button type="button" class="btn-outline" ' + (isDone || isServing ? "disabled" : "") + ' onclick="callPatient(\'' + b.id + '\')">' + t("call_patient_btn") + '</button>' +
                '<button type="button" class="btn-primary" ' + (isDone || !isServing ? "disabled" : "") + ' onclick="finishPatient(\'' + b.id + '\')">' + t("finish_patient_btn") + '</button>' +
                '<button type="button" class="btn-outline" ' + (isDone ? "disabled" : "") + ' onclick="deferPatient(\'' + b.id + '\')">' + t("defer_patient_btn") + '</button>' +
            '</div>' +
        '</div>';
    });

    listEl.innerHTML = html;
}

function validateCallingAllowedForSelectedDate() {
    var todayStr = getTodayStr();
    if (currentDateStr > todayStr) {
        alert(t("err_future_date_call").replace("{date}", currentDateStr));
        return false;
    }

    var clinic = getSelectedClinicObject();
    if (clinic && currentDateStr === todayStr) {
        var openMin = parseMinutesFromHHMM(clinic.startTime || "09:00");
        var nowMin = getCurrentMinutesOfDay();
        if (openMin !== null && nowMin < openMin) {
            alert(t("err_before_open_call").replace("{time}", clinic.startTime || "09:00"));
            return false;
        }
    }

    return true;
}

function getOrderedActiveQueue() {
    return currentQueueDocs
        .filter(function(b) { return b && b.status !== "cancelled"; })
        .slice()
        .sort(function(a, b) {
            var ta = parseInt(a.ticketNumber, 10) || 0;
            var tb = parseInt(b.ticketNumber, 10) || 0;
            if (ta !== tb) return ta - tb;
            var sa = parseInt(a.serialNumber, 10) || 0;
            var sb = parseInt(b.serialNumber, 10) || 0;
            return sa - sb;
        });
}

function isEarlierPatientUnresolved(targetBookingId) {
    var ordered = getOrderedActiveQueue();
    for (var i = 0; i < ordered.length; i++) {
        var item = ordered[i];
        if (item.id === targetBookingId) {
            return false;
        }
        if (item.status !== "done" && item.status !== "deferred") {
            return true;
        }
    }
    return false;
}

function callPatient(bookingId) {
    if (!validateCallingAllowedForSelectedDate()) return;

    if (isEarlierPatientUnresolved(bookingId)) {
        alert(t("err_must_call_in_order"));
        return;
    }

    var batch = db.batch();
    currentQueueDocs.forEach(function(item) {
        if (item.status === "serving" && item.id !== bookingId) {
            batch.update(db.collection("bookings").doc(item.id), { status: "waiting" });
        }
    });
    batch.update(db.collection("bookings").doc(bookingId), { status: "serving" });

    batch.commit().catch(function(err) {
        console.error(err);
    });
}

function callNextPatient() {
    if (!validateCallingAllowedForSelectedDate()) return;

    var ordered = getOrderedActiveQueue();
    var currentServing = ordered.find(function(b) { return b.status === "serving"; });
    if (currentServing) {
        alert(
            getCurrentLang() === "en"
                ? "Please press (Finish) for the current patient first before calling the next patient."
                : "يجب أولاً الضغط على (إنهاء الكشف) للمريض الحالي قبل نداء المريض التالي."
        );
        return;
    }

    var nextWaiting = ordered.find(function(b) { return b.status === "waiting"; });
    if (!nextWaiting) {
        alert(t("err_no_waiting_patients"));
        return;
    }

    db.collection("bookings").doc(nextWaiting.id).update({
        status: "serving"
    }).catch(function(err) {
        console.error(err);
    });
}

function msgAllDoneSafe() {
    var res = t("msg_all_patients_done");
    return res === "msg_all_patients_done" ? t("booking_done") : res;
}

function finishPatient(bookingId) {
    var target = currentQueueDocs.find(function(b) { return b.id === bookingId; });
    if (!target || target.status !== "serving") {
        alert(t("err_must_call_in_order"));
        return;
    }

    if (isEarlierPatientUnresolved(bookingId)) {
        alert(t("err_must_finish_in_order"));
        return;
    }

    db.collection("bookings").doc(bookingId).update({ status: "done" }).catch(function(err) {
        console.error(err);
    });
}

function deferPatient(bookingId) {
    var ordered = getOrderedActiveQueue();
    var target = ordered.find(function(b) { return b.id === bookingId; });
    if (!target) return;

    var maxTicket = 0;
    ordered.forEach(function(b) {
        var num = parseInt(b.ticketNumber, 10) || 0;
        if (num > maxTicket) maxTicket = num;
    });

    var newTicketNum = maxTicket + 1;

    db.collection("bookings").doc(bookingId).update({
        status: "waiting",
        deferredAt: firebase.firestore.FieldValue.serverTimestamp(),
        ticketNumber: newTicketNum
    }).catch(function(err) {
        console.error(err);
    });
}

function toggleClinicStatus() {
    var clinic = getSelectedClinicObject();
    if (!currentDoctorId || !clinic || !currentDoctorData) return;

    var clinicsCopy = currentDoctorData.clinics.slice();
    var nextClosedState = clinic.isClosed !== true;
    clinicsCopy[selectedClinicIndex] = Object.assign({}, clinic, {
        isClosed: nextClosedState
    });

    db.collection("doctors").doc(currentDoctorId).update({
        clinics: clinicsCopy
    }).then(function() {
        currentDoctorData.clinics = clinicsCopy;
        updateClinicStatusButton();
        alert(nextClosedState ? t("msg_clinic_closed_temp") : t("msg_clinic_opened"));
    }).catch(function(err) {
        console.error(err);
        alert(t("err_update_clinic_status"));
    });
}

function toggleClinicOpenClose() {
    toggleClinicStatus();
}

function loadJsPdfLibraryIfNeeded() {
    return new Promise(function(resolve, reject) {
        if (window.jspdf && window.jspdf.jsPDF) {
            resolve(window.jspdf.jsPDF);
            return;
        }
        var script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.async = true;
        script.onload = function() {
            if (window.jspdf && window.jspdf.jsPDF) {
                resolve(window.jspdf.jsPDF);
            } else {
                reject(new Error("jsPDF unavailable"));
            }
        };
        script.onerror = function() {
            reject(new Error("Failed to load jsPDF"));
        };
        document.head.appendChild(script);
    });
}

function escapePdfAscii(str) {
    return String(str || "")
        .replace(/[^\x20-\x7E]/g, "")
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");
}

function buildSimplePdfBlob(lines) {
    var contentLines = ["BT", "/F1 12 Tf", "40 760 Td", "18 TL"];
    lines.forEach(function(line, idx) {
        var safe = escapePdfAscii(line);
        if (idx === 0) {
            contentLines.push("(" + safe + ") Tj");
        } else {
            contentLines.push("T* (" + safe + ") Tj");
        }
    });
    contentLines.push("ET");
    var streamData = contentLines.join("\n");

    var objects = [];
    objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
    objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
    objects.push("3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj");
    objects.push("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
    objects.push("5 0 obj << /Length " + streamData.length + " >> stream\n" + streamData + "\nendstream endobj");

    var pdf = "%PDF-1.4\n";
    var offsets = [0];
    for (var i = 0; i < objects.length; i++) {
        offsets.push(pdf.length);
        pdf += objects[i] + "\n";
    }
    var xrefPos = pdf.length;
    pdf += "xref\n0 " + (objects.length + 1) + "\n";
    pdf += "0000000000 65535 f \n";
    for (var j = 1; j < offsets.length; j++) {
        pdf += String(offsets[j]).padStart(10, "0") + " 00000 n \n";
    }
    pdf += "trailer << /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF";

    return new Blob([pdf], { type: "application/pdf" });
}

function createQueuePdfBlob(ordered, docName, clinicName, dateStr) {
    return loadJsPdfLibraryIfNeeded().then(function(JsPDF) {
        var doc = new JsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("Clinic Queue Sheet", 40, 45);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text("Date: " + dateStr, 40, 65);
        doc.text("Clinic Index: " + (selectedClinicIndex + 1), 40, 82);

        var y = 115;
        doc.setFont("helvetica", "bold");
        doc.text("Row", 40, y);
        doc.text("Ticket", 95, y);
        doc.text("Phone", 170, y);
        doc.text("Status", 310, y);
        doc.text("Patient / Notes", 415, y);
        y += 18;
        doc.setFont("helvetica", "normal");

        ordered.forEach(function(b, idx) {
            if (y > 780) {
                doc.addPage();
                y = 50;
            }
            var stCode = b.status === "done" ? "Done" : (b.status === "serving" ? "Serving" : "Waiting");
            var phoneClean = String(b.patientPhone || "-").replace(/[^\x20-\x7E]/g, "");
            doc.text(String(idx + 1), 40, y);
            doc.text("#" + String(b.ticketNumber || "-"), 95, y);
            doc.text(phoneClean || "-", 170, y);
            doc.text(stCode, 310, y);
            doc.text(String(b.patientName || ""), 415, y);
            y += 20;
        });

        return doc.output("blob");
    }).catch(function() {
        var lines = [
            "Clinic Queue Sheet",
            "Date: " + dateStr,
            "Clinic: " + (selectedClinicIndex + 1),
            "----------------------------------------"
        ];
        ordered.forEach(function(b, idx) {
            var stCode = b.status === "done" ? "Done" : (b.status === "serving" ? "Serving" : "Waiting");
            lines.push((idx + 1) + ". #" + (b.ticketNumber || "-") + " | " + (b.patientPhone || "-") + " | " + stCode);
        });
        return buildSimplePdfBlob(lines);
    });
}

function triggerDownloadToDownloads(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function() {
        URL.revokeObjectURL(url);
    }, 3000);
}

function printQueueSheetPdf() {
    var ordered = getOrderedActiveQueue();
    if (!ordered.length) {
        alert(t("err_no_bookings_to_export"));
        return;
    }

    var clinic = getSelectedClinicObject();
    var clinicName = getClinicDisplayName(clinic, selectedClinicIndex);
    var docName = getDoctorDisplayName();
    var safeDate = String(currentDateStr || getTodayStr()).replace(/[^0-9-]/g, "");
    var fileName = "queue-" + safeDate + "-c" + (selectedClinicIndex + 1) + ".pdf";

    createQueuePdfBlob(ordered, docName, clinicName, currentDateStr).then(function(pdfBlob) {
        triggerDownloadToDownloads(pdfBlob, fileName);

        var fileObj = new File([pdfBlob], fileName, { type: "application/pdf" });
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [fileObj] }))) {
            return navigator.share({
                title: docName + " — " + clinicName,
                text: t("date_label") + " " + currentDateStr,
                files: [fileObj]
            }).catch(function(shareErr) {
                if (shareErr && shareErr.name === "AbortError") return;
            });
        }
    }).catch(function(err) {
        console.error(err);
        alert(t("err_export_failed"));
    });
}

function exportQueueToTxt() {
    printQueueSheetPdf();
}

function setAddClinicMapLocation(lat, lng, zoom) {
    var latNum = parseFloat(lat);
    var lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return;

    var latInp = document.getElementById("addLat") || document.getElementById("addClinicLat");
    var lngInp = document.getElementById("addLng") || document.getElementById("addClinicLng");
    if (latInp) latInp.value = latNum.toFixed(6);
    if (lngInp) lngInp.value = lngNum.toFixed(6);

    initAddClinicMapIfNeeded();
    if (addClinicMap) {
        addClinicMap.setView([latNum, lngNum], zoom || 15);
        if (addClinicMarker) {
            addClinicMarker.setLatLng([latNum, lngNum]);
        } else {
            addClinicMarker = L.marker([latNum, lngNum]).addTo(addClinicMap);
        }
        setTimeout(function() { if (addClinicMap) addClinicMap.invalidateSize(); }, 150);
    }
}

function useCurrentLocationForAddClinic() {
    if (!navigator.geolocation) {
        alert(t("err_geo_unsupported"));
        return;
    }
    navigator.geolocation.getCurrentPosition(function(pos) {
        setAddClinicMapLocation(pos.coords.latitude, pos.coords.longitude, 16);
    }, function() {
        alert(t("err_geo_short"));
    }, { enableHighAccuracy: true, timeout: 10000 });
}

function attachAddClinicMapLocationControl(mapInstance) {
    if (!mapInstance || typeof L === "undefined" || addClinicLocationControlAdded) return;
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
                useCurrentLocationForAddClinic();
            });
            return btn;
        }
    });
    mapInstance.addControl(new LocationControl());
    addClinicLocationControlAdded = true;
}

function initAddClinicMapIfNeeded() {
    var mapId = document.getElementById("add-map") ? "add-map" : (document.getElementById("add-clinic-map") ? "add-clinic-map" : null);
    if (!mapId || typeof L === "undefined") return;
    if (!addClinicMap) {
        addClinicMap = L.map(mapId).setView([15.3694, 44.1910], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap"
        }).addTo(addClinicMap);
        attachAddClinicMapLocationControl(addClinicMap);
        addClinicMap.on("click", function(e) {
            setAddClinicMapLocation(e.latlng.lat, e.latlng.lng, addClinicMap.getZoom());
        });
    }
    setTimeout(function() { if (addClinicMap) addClinicMap.invalidateSize(); }, 200);
}

function openAddClinicModal() {
    var modal = document.getElementById("addClinicModal");
    if (!modal) return;

    ["addClinicName", "addCity", "addStreet", "addLandmark", "addLat", "addLng", "addClinicCity", "addClinicStreet", "addClinicLandmark", "addClinicLat", "addClinicLng"].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = "";
    });

    var startInp = document.getElementById("addStartTime") || document.getElementById("addClinicStartTime");
    var endInp = document.getElementById("addEndTime") || document.getElementById("addClinicEndTime");
    var srvInp = document.getElementById("addServiceTime") || document.getElementById("addClinicServiceTime");
    if (startInp) startInp.value = "09:00";
    if (endInp) endInp.value = "17:00";
    if (srvInp) srvInp.value = "10";

    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("add_day_" + d);
        if (cb) cb.checked = d !== 5;
    }

    modal.classList.remove("hidden");
    initAddClinicMapIfNeeded();
}

function closeAddClinicModal() {
    var modal = document.getElementById("addClinicModal");
    if (modal) modal.classList.add("hidden");
}

function saveNewClinic() {
    if (!currentDoctorId || !currentDoctorData) return;

    var clinicName = ((document.getElementById("addClinicName") || {}).value || "").trim();
    if (!clinicName) {
        alert(t("err_enter_clinic_name"));
        return;
    }

    var city = ((document.getElementById("addCity") || document.getElementById("addClinicCity") || {}).value || "").trim();
    var street = ((document.getElementById("addStreet") || document.getElementById("addClinicStreet") || {}).value || "").trim();
    var landmark = ((document.getElementById("addLandmark") || document.getElementById("addClinicLandmark") || {}).value || "").trim();
    var startTime = ((document.getElementById("addStartTime") || document.getElementById("addClinicStartTime") || {}).value || "09:00");
    var endTime = ((document.getElementById("addEndTime") || document.getElementById("addClinicEndTime") || {}).value || "17:00");
    var serviceTime = parseInt(((document.getElementById("addServiceTime") || document.getElementById("addClinicServiceTime") || {}).value || "10"), 10) || 10;
    var latVal = parseFloat(((document.getElementById("addLat") || document.getElementById("addClinicLat") || {}).value || ""));
    var lngVal = parseFloat(((document.getElementById("addLng") || document.getElementById("addClinicLng") || {}).value || ""));

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

    var updatedClinics = Array.isArray(currentDoctorData.clinics) ? currentDoctorData.clinics.slice() : [];
    updatedClinics.push(newClinic);

    db.collection("doctors").doc(currentDoctorId).update({
        clinics: updatedClinics
    }).then(function() {
        currentDoctorData.clinics = updatedClinics;
        selectedClinicIndex = updatedClinics.length - 1;
        closeAddClinicModal();
        populateClinicSelector();
        alert(t("msg_clinic_added"));
    }).catch(function(err) {
        console.error(err);
        alert(t("err_add_clinic_failed"));
    });
}

function setEditClinicMapLocation(lat, lng, zoom) {
    var latNum = parseFloat(lat);
    var lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return;

    var latInp = document.getElementById("editLat") || document.getElementById("editClinicLat");
    var lngInp = document.getElementById("editLng") || document.getElementById("editClinicLng");
    if (latInp) latInp.value = latNum.toFixed(6);
    if (lngInp) lngInp.value = lngNum.toFixed(6);

    initEditClinicMapIfNeeded();
    if (editClinicMap) {
        editClinicMap.setView([latNum, lngNum], zoom || 15);
        if (editClinicMarker) {
            editClinicMarker.setLatLng([latNum, lngNum]);
        } else {
            editClinicMarker = L.marker([latNum, lngNum]).addTo(editClinicMap);
        }
        setTimeout(function() { if (editClinicMap) editClinicMap.invalidateSize(); }, 150);
    }
}

function useCurrentLocationForEditClinic() {
    if (!navigator.geolocation) {
        alert(t("err_geo_unsupported"));
        return;
    }
    navigator.geolocation.getCurrentPosition(function(pos) {
        setEditClinicMapLocation(pos.coords.latitude, pos.coords.longitude, 16);
    }, function() {
        alert(t("err_geo_short"));
    }, { enableHighAccuracy: true, timeout: 10000 });
}

function attachEditClinicMapLocationControl(mapInstance) {
    if (!mapInstance || typeof L === "undefined" || editClinicLocationControlAdded) return;
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
                useCurrentLocationForEditClinic();
            });
            return btn;
        }
    });
    mapInstance.addControl(new LocationControl());
    editClinicLocationControlAdded = true;
}

function initEditClinicMapIfNeeded() {
    var mapId = document.getElementById("edit-map") ? "edit-map" : (document.getElementById("edit-clinic-map") ? "edit-clinic-map" : null);
    if (!mapId || typeof L === "undefined") return;
    if (!editClinicMap) {
        editClinicMap = L.map(mapId).setView([15.3694, 44.1910], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap"
        }).addTo(editClinicMap);
        attachEditClinicMapLocationControl(editClinicMap);
        editClinicMap.on("click", function(e) {
            setEditClinicMapLocation(e.latlng.lat, e.latlng.lng, editClinicMap.getZoom());
        });
    }
    setTimeout(function() { if (editClinicMap) editClinicMap.invalidateSize(); }, 200);
}

function openEditClinicModal() {
    var clinic = getSelectedClinicObject();
    if (!clinic) {
        alert(t("err_no_clinic_to_edit"));
        return;
    }

    var modal = document.getElementById("editClinicModal");
    if (!modal) return;

    var setVal = function(ids, v) {
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el) {
                el.value = v || "";
                break;
            }
        }
    };

    setVal(["editClinicName"], clinic.clinicName);
    setVal(["editCity", "editClinicCity"], clinic.city);
    setVal(["editStreet", "editClinicStreet"], clinic.street);
    setVal(["editLandmark", "editClinicLandmark"], clinic.landmark);
    setVal(["editStartTime", "editClinicStartTime"], clinic.startTime || "09:00");
    setVal(["editEndTime", "editClinicEndTime"], clinic.endTime || "17:00");
    setVal(["editServiceTime", "editClinicServiceTime"], clinic.serviceTime || 10);
    setVal(["editLat", "editClinicLat"], clinic.lat !== null && clinic.lat !== undefined ? clinic.lat : "");
    setVal(["editLng", "editClinicLng"], clinic.lng !== null && clinic.lng !== undefined ? clinic.lng : "");
    setVal(["deleteClinicConfirmInput"], "");

    var days = Array.isArray(clinic.workingDays) ? clinic.workingDays : [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("edit_day_" + d);
        if (cb) cb.checked = days.indexOf(d) !== -1;
    }

    modal.classList.remove("hidden");
    initEditClinicMapIfNeeded();

    var latNum = parseFloat(clinic.lat);
    var lngNum = parseFloat(clinic.lng);
    if (!isNaN(latNum) && !isNaN(lngNum)) {
        setEditClinicMapLocation(latNum, lngNum, 15);
    }
}

function closeEditClinicModal() {
    var modal = document.getElementById("editClinicModal");
    if (modal) modal.classList.add("hidden");
}

function saveEditClinic() {
    var clinic = getSelectedClinicObject();
    if (!currentDoctorId || !clinic || !currentDoctorData) return;

    var clinicName = ((document.getElementById("editClinicName") || {}).value || "").trim();
    if (!clinicName) {
        alert(t("err_enter_clinic_name"));
        return;
    }

    var city = ((document.getElementById("editCity") || document.getElementById("editClinicCity") || {}).value || "").trim();
    var street = ((document.getElementById("editStreet") || document.getElementById("editClinicStreet") || {}).value || "").trim();
    var landmark = ((document.getElementById("editLandmark") || document.getElementById("editClinicLandmark") || {}).value || "").trim();
    var startTime = ((document.getElementById("editStartTime") || document.getElementById("editClinicStartTime") || {}).value || "09:00");
    var endTime = ((document.getElementById("editEndTime") || document.getElementById("editClinicEndTime") || {}).value || "17:00");
    var serviceTime = parseInt(((document.getElementById("editServiceTime") || document.getElementById("editClinicServiceTime") || {}).value || "10"), 10) || 10;
    var latVal = parseFloat(((document.getElementById("editLat") || document.getElementById("editClinicLat") || {}).value || ""));
    var lngVal = parseFloat(((document.getElementById("editLng") || document.getElementById("editClinicLng") || {}).value || ""));

    var workingDays = [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("edit_day_" + d);
        if (cb && cb.checked) workingDays.push(d);
    }

    var updatedClinics = currentDoctorData.clinics.slice();
    updatedClinics[selectedClinicIndex] = Object.assign({}, clinic, {
        clinicName: clinicName,
        city: city,
        street: street,
        landmark: landmark,
        startTime: startTime,
        endTime: endTime,
        serviceTime: serviceTime,
        workingDays: workingDays,
        lat: isNaN(latVal) ? null : latVal,
        lng: isNaN(lngVal) ? null : lngVal
    });

    db.collection("doctors").doc(currentDoctorId).update({
        clinics: updatedClinics
    }).then(function() {
        currentDoctorData.clinics = updatedClinics;
        closeEditClinicModal();
        populateClinicSelector();
        alert(t("msg_clinic_updated"));
    }).catch(function(err) {
        console.error(err);
        alert(t("err_update_clinic_failed"));
    });
}

function saveClinicEdits() {
    saveEditClinic();
}

function deleteBookingsForClinic(doctorId, clinicIdx) {
    return db.collection("bookings")
        .where("doctorId", "==", doctorId)
        .where("clinicIndex", "==", clinicIdx)
        .get()
        .then(function(snap) {
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
            var batch = db.batch();
            snap.forEach(function(doc) {
                batch.delete(doc.ref);
            });
            return batch.commit();
        });
}

function deleteCurrentClinic() {
    var clinic = getSelectedClinicObject();
    if (!currentDoctorId || !clinic || !currentDoctorData) return;

    var phraseInput = ((document.getElementById("deleteClinicConfirmInput") || {}).value || "").trim();
    if (phraseInput !== "إحذف العيادة") {
        alert(t("err_delete_phrase_mismatch"));
        return;
    }

    var targetIdx = selectedClinicIndex;
    var remainingClinics = currentDoctorData.clinics.filter(function(_, idx) {
        return idx !== targetIdx;
    });

    deleteBookingsForClinic(currentDoctorId, targetIdx).then(function() {
        if (remainingClinics.length === 0) {
            var deleteDoctorRecord = confirm(t("confirm_delete_doctor_record"));
            if (deleteDoctorRecord) {
                return deleteAllBookingsForDoctor(currentDoctorId).then(function() {
                    return db.collection("doctors").doc(currentDoctorId).delete();
                }).then(function() {
                    closeEditClinicModal();
                    alert(t("msg_doctor_record_deleted"));
                    window.location.href = "index.html";
                });
            }
        }

        return db.collection("doctors").doc(currentDoctorId).update({
            clinics: remainingClinics
        }).then(function() {
            currentDoctorData.clinics = remainingClinics;
            selectedClinicIndex = 0;
            closeEditClinicModal();
            populateClinicSelector();
            alert(t("msg_clinic_deleted"));
        });
    }).catch(function(err) {
        console.error(err);
        alert(t("err_delete_clinic_failed"));
    });
}

function confirmDeleteClinic() {
    deleteCurrentClinic();
}

function logoutDoctor() {
    if (unsubscribeBookings) {
        unsubscribeBookings();
        unsubscribeBookings = null;
    }
    auth.signOut().then(function() {
        window.location.href = "index.html";
    }).catch(function() {
        window.location.href = "index.html";
    });
}

function toggleTheme() {
    document.body.classList.toggle("dark-mode");
    var isDark = document.body.classList.contains("dark-mode");
    localStorage.setItem("douri_theme", isDark ? "dark" : "light");
    var icon = document.querySelector("#themeToggle i") || document.getElementById("themeIcon");
    if (icon) {
        icon.className = isDark ? "fa-solid fa-sun" : "fa-solid fa-moon";
    }
}

function applySavedTheme() {
    var saved = localStorage.getItem("douri_theme");
    var isDark = saved === "dark";
    if (isDark) {
        document.body.classList.add("dark-mode");
    } else {
        document.body.classList.remove("dark-mode");
    }
    var icon = document.querySelector("#themeToggle i") || document.getElementById("themeIcon");
    if (icon) {
        icon.className = isDark ? "fa-solid fa-sun" : "fa-solid fa-moon";
    }
}

function ensureAdminDateInitialized() {
    var dateInput = document.getElementById("adminDate");
    if (dateInput) {
        if (!dateInput.value) {
            dateInput.value = getTodayStr();
        }
        currentDateStr = dateInput.value;
    }
}

function initAdminPage() {
    applySavedTheme();
    if (typeof applyLanguage === "function") {
        applyLanguage();
    }
    ensureAdminDateInitialized();

    auth.onAuthStateChanged(function(user) {
        ensureAdminDateInitialized();
        if (!user) {
            window.location.href = "index.html";
            return;
        }
        currentDoctorId = user.uid;
        db.collection("doctors").doc(user.uid).get().then(function(docSnap) {
            if (!docSnap.exists || (docSnap.data() && docSnap.data().isDeleted === true)) {
                window.location.href = "index.html";
                return;
            }
            currentDoctorData = docSnap.data() || {};
            if (!Array.isArray(currentDoctorData.clinics)) {
                currentDoctorData.clinics = [];
            }
            setDoctorHeaderTitle();
            populateClinicSelector();
        }).catch(function(err) {
            console.error(err);
            alert(t("err_fetch_db"));
        });
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminPage);
} else {
    initAdminPage();
}
