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

var allDoctors = [];
var selectedDoctor = null;
var selectedClinic = null;
var selectedClinicIndex = 0;
var currentTicketBookingId = null;
var unsubscribeDoctors = null;
var unsubscribeBookings = null;
var unsubscribeTicketBookings = null;
var regMap = null;
var regMarker = null;

var calendarViewYear = null;
var calendarViewMonth = null;
var calendarBookingsByDate = {};
var lastTicketNumber = null;
var lastAheadCount = null;
var audioCtx = null;

function playPatientAlertSound(type) {
    try {
        var AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audioCtx) {
            audioCtx = new AudioContextClass();
        }
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }
        var now = audioCtx.currentTime;
        var notes = type === "turn" ? [880, 1174.66, 1318.51] : [659.25, 783.99];
        for (var i = 0; i < notes.length; i++) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(notes[i], now + i * 0.16);
            gain.gain.setValueAtTime(0.001, now + i * 0.16);
            gain.gain.exponentialRampToValueAtTime(0.22, now + i * 0.16 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.15);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + i * 0.16);
            osc.stop(now + i * 0.16 + 0.16);
        }
    } catch (e) {}
}

function triggerPatientVibration(type) {
    try {
        if (navigator && typeof navigator.vibrate === "function") {
            if (type === "turn") {
                navigator.vibrate([300, 120, 300, 120, 400]);
            } else {
                navigator.vibrate([180, 100, 180]);
            }
        }
    } catch (e) {}
}

function showTicketAlert(message, type) {
    var box = document.getElementById("ticketAlertBox");
    if (!box) return;
    box.innerText = message;
    box.classList.remove("hidden");
    playPatientAlertSound(type || "reorder");
    triggerPatientVibration(type || "reorder");
}

function hideTicketAlert() {
    var box = document.getElementById("ticketAlertBox");
    if (!box) return;
    box.innerText = "";
    box.classList.add("hidden");
}

function toggleTheme() {
    document.body.classList.toggle("dark-mode");
    var isDark = document.body.classList.contains("dark-mode");
    localStorage.setItem("douri_theme", isDark ? "dark" : "light");
    var btn = document.getElementById("themeToggle");
    if (btn) {
        btn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    }
}

function applySavedTheme() {
    var saved = localStorage.getItem("douri_theme");
    var btn = document.getElementById("themeToggle");
    if (saved === "dark") {
        document.body.classList.add("dark-mode");
        if (btn) btn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
        document.body.classList.remove("dark-mode");
        if (btn) btn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
}

function getTodayStr() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, "0");
    var d = String(now.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
}

function getTomorrowStr() {
    var d = new Date();
    d.setDate(d.getDate() + 1);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
}

function formatDateYMD(year, monthIndex, day) {
    var m = String(monthIndex + 1).padStart(2, "0");
    var d = String(day).padStart(2, "0");
    return year + "-" + m + "-" + d;
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

function calculateDailyCapacity(clinic) {
    if (!clinic) return 0;
    var startMin = parseMinutesFromHHMM(clinic.startTime);
    var endMin = parseMinutesFromHHMM(clinic.endTime);
    var serviceTime = parseInt(clinic.serviceTime, 10);
    if (startMin === null || endMin === null || isNaN(serviceTime) || serviceTime <= 0) {
        return 0;
    }
    var diff = endMin - startMin;
    if (diff <= 0) return 0;
    return Math.floor(diff / serviceTime);
}

function getClinicWorkingDays(clinic) {
    if (!clinic || !Array.isArray(clinic.workingDays)) return [];
    var days = [];
    for (var i = 0; i < clinic.workingDays.length; i++) {
        var n = parseInt(clinic.workingDays[i], 10);
        if (!isNaN(n) && n >= 0 && n <= 6) {
            days.push(n);
        }
    }
    return days;
}

function isDateAvailableForClinic(dateStr, clinic) {
    if (!dateStr || !clinic) return false;
    var todayStr = getTodayStr();
    if (dateStr < todayStr) return false;

    var parts = dateStr.split("-");
    if (parts.length !== 3) return false;
    var dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    var dayOfWeek = dt.getDay();

    var workingDays = getClinicWorkingDays(clinic);
    if (workingDays.length > 0 && workingDays.indexOf(dayOfWeek) === -1) {
        return false;
    }

    var capacity = calculateDailyCapacity(clinic);
    if (capacity > 0) {
        var bookedCount = calendarBookingsByDate[dateStr] || 0;
        if (bookedCount >= capacity) {
            return false;
        }
    }

    return true;
}

function renderCustomBookingCalendar() {
    var calContainer = document.getElementById("customBookingCalendar");
    var hintEl = document.getElementById("calendarHint");
    var hiddenInput = document.getElementById("bookingDate");
    if (!calContainer || !selectedClinic) return;

    if (calendarViewYear === null || calendarViewMonth === null) {
        var now = new Date();
        calendarViewYear = now.getFullYear();
        calendarViewMonth = now.getMonth();
    }

    var capacity = calculateDailyCapacity(selectedClinic);
    var monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    var weekDays = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

    var firstDayOfMonth = new Date(calendarViewYear, calendarViewMonth, 1).getDay();
    var daysInMonth = new Date(calendarViewYear, calendarViewMonth + 1, 0).getDate();
    var currentSelected = hiddenInput ? hiddenInput.value : "";

    var html = '<div class="cal-header">';
    html += '<button type="button" class="btn-outline" onclick="changeCalendarMonth(-1)">&lt;</button>';
    html += '<span>' + monthNames[calendarViewMonth] + ' ' + calendarViewYear + '</span>';
    html += '<button type="button" class="btn-outline" onclick="changeCalendarMonth(1)">&gt;</button>';
    html += '</div>';

    html += '<div class="cal-weekdays">';
    for (var w = 0; w < weekDays.length; w++) {
        html += '<div class="cal-weekday">' + weekDays[w] + '</div>';
    }
    html += '</div>';

    html += '<div class="cal-days-grid">';
    for (var b = 0; b < firstDayOfMonth; b++) {
        html += '<div></div>';
    }

    for (var day = 1; day <= daysInMonth; day++) {
        var dateStr = formatDateYMD(calendarViewYear, calendarViewMonth, day);
        var available = isDateAvailableForClinic(dateStr, selectedClinic);
        var bookedCount = calendarBookingsByDate[dateStr] || 0;
        var isFull = capacity > 0 && bookedCount >= capacity;
        var isSelected = currentSelected === dateStr && available;

        var cls = "cal-day-btn";
        if (!available) cls += " disabled-day";
        if (isSelected) cls += " selected";

        var titleAttr = isFull ? "مكتمل العدد" : (!available ? "غير متاح" : "متاح");
        html += '<button type="button" class="' + cls + '" title="' + titleAttr + '" ' +
            (!available ? 'disabled' : 'onclick="selectCalendarDate(\'' + dateStr + '\')"') + '>' +
            day + '</button>';
    }
    html += '</div>';

    calContainer.innerHTML = html;

    if (hintEl) {
        if (capacity > 0) {
            hintEl.innerText = "الطاقة الاستيعابية اليومية للعيادة: " + capacity + " مراجع — الأيام الرمادية غير متاحة أو مكتملة.";
        } else {
            hintEl.innerText = "الأيام الرمادية غير متاحة للحجز.";
        }
    }
}

function changeCalendarMonth(delta) {
    if (calendarViewYear === null || calendarViewMonth === null) {
        var now = new Date();
        calendarViewYear = now.getFullYear();
        calendarViewMonth = now.getMonth();
    }
    calendarViewMonth += delta;
    if (calendarViewMonth < 0) {
        calendarViewMonth = 11;
        calendarViewYear -= 1;
    } else if (calendarViewMonth > 11) {
        calendarViewMonth = 0;
        calendarViewYear += 1;
    }
    renderCustomBookingCalendar();
}

function selectCalendarDate(dateStr) {
    if (!isDateAvailableForClinic(dateStr, selectedClinic)) return;
    var hiddenInput = document.getElementById("bookingDate");
    if (hiddenInput) hiddenInput.value = dateStr;
    renderCustomBookingCalendar();
}

function loadClinicCalendarBookings(doctorId, clinicIndex) {
    if (unsubscribeBookings) {
        unsubscribeBookings();
        unsubscribeBookings = null;
    }
    calendarBookingsByDate = {};
    var todayStr = getTodayStr();

    unsubscribeBookings = db.collection("bookings")
        .where("doctorId", "==", doctorId)
        .where("clinicIndex", "==", clinicIndex)
        .onSnapshot(function(snapshot) {
            var counts = {};
            snapshot.forEach(function(doc) {
                var data = doc.data();
                if (!data || !data.date) return;
                if (data.date < todayStr) return;
                if (data.status === "cancelled" || data.status === "done") return;
                counts[data.date] = (counts[data.date] || 0) + 1;
            });
            calendarBookingsByDate = counts;

            var hiddenInput = document.getElementById("bookingDate");
            if (hiddenInput && hiddenInput.value && !isDateAvailableForClinic(hiddenInput.value, selectedClinic)) {
                hiddenInput.value = "";
            }
            if (hiddenInput && !hiddenInput.value) {
                var firstAvail = findFirstAvailableDate(selectedClinic);
                if (firstAvail) hiddenInput.value = firstAvail;
            }
            renderCustomBookingCalendar();
        }, function(err) {
            console.error(err);
            renderCustomBookingCalendar();
        });
}

function findFirstAvailableDate(clinic) {
    if (!clinic) return "";
    var base = new Date();
    for (var i = 0; i < 60; i++) {
        var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
        var dateStr = formatDateYMD(d.getFullYear(), d.getMonth(), d.getDate());
        if (isDateAvailableForClinic(dateStr, clinic)) {
            return dateStr;
        }
    }
    return "";
}

function getSavedBookingIds() {
    try {
        var raw = localStorage.getItem("douri_my_bookings");
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        return [];
    }
}

function saveBookingIdLocally(bookingId) {
    if (!bookingId) return;
    var ids = getSavedBookingIds();
    if (ids.indexOf(bookingId) === -1) {
        ids.push(bookingId);
        localStorage.setItem("douri_my_bookings", JSON.stringify(ids));
    }
    updateActiveBookingBanner();
}

function removeBookingIdLocally(bookingId) {
    var ids = getSavedBookingIds().filter(function(id) { return id !== bookingId; });
    localStorage.setItem("douri_my_bookings", JSON.stringify(ids));
    updateActiveBookingBanner();
}

function updateActiveBookingBanner() {
    var banner = document.getElementById("activeBookingBanner");
    var textEl = document.getElementById("bannerText");
    var ids = getSavedBookingIds();
    if (!banner || !textEl) return;

    if (ids.length === 0) {
        banner.classList.add("hidden");
        return;
    }

    Promise.all(ids.map(function(id) {
        return db.collection("bookings").doc(id).get();
    })).then(function(docs) {
        var activeCount = 0;
        var validIds = [];
        docs.forEach(function(doc) {
            if (doc.exists) {
                var d = doc.data();
                if (d.status !== "cancelled" && d.status !== "done") {
                    activeCount++;
                    validIds.push(doc.id);
                }
            }
        });
        localStorage.setItem("douri_my_bookings", JSON.stringify(validIds));
        if (activeCount > 0) {
            textEl.innerText = t("active_booking_msg").replace("{n}", activeCount);
            banner.classList.remove("hidden");
        } else {
            banner.classList.add("hidden");
        }
    }).catch(function() {});
}

function loadDoctors() {
    var listEl = document.getElementById("doctorsList");
    if (unsubscribeDoctors) {
        unsubscribeDoctors();
    }

    var fallbackTimer = setTimeout(function() {
        if (listEl && listEl.querySelector(".skeleton-card")) {
            listEl.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--text-muted);">تعذر تحميل قائمة العيادات حالياً. تحقق من الاتصال وأعد المحاولة.</p>';
        }
    }, 10000);

    unsubscribeDoctors = db.collection("doctors").onSnapshot(function(snapshot) {
        clearTimeout(fallbackTimer);
        allDoctors = [];
        var citiesSet = {};

        snapshot.forEach(function(doc) {
            var data = doc.data();
            data.id = doc.id;
            allDoctors.push(data);
            if (Array.isArray(data.clinics)) {
                data.clinics.forEach(function(c) {
                    if (c && c.city) {
                        citiesSet[c.city.trim()] = true;
                    }
                });
            }
        });

        var datalist = document.getElementById("citiesList");
        if (datalist) {
            datalist.innerHTML = "";
            Object.keys(citiesSet).sort().forEach(function(city) {
                var opt = document.createElement("option");
                opt.value = city;
                datalist.appendChild(opt);
            });
        }

        filterDoctors();
        updateActiveBookingBanner();
    }, function(error) {
        clearTimeout(fallbackTimer);
        console.error(error);
        if (listEl) {
            listEl.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--danger);">حدث خطأ أثناء جلب البيانات من قاعدة البيانات.</p>';
        }
    });
}

function filterDoctors() {
    var searchInput = document.getElementById("searchInput");
    var cityInput = document.getElementById("cityFilter");
    var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    var cityQuery = cityInput ? cityInput.value.trim().toLowerCase() : "";

    var filtered = allDoctors.filter(function(doc) {
        var nameMatch = (doc.name || "").toLowerCase().indexOf(query) !== -1;
        var specMatch = (doc.specialty || "").toLowerCase().indexOf(query) !== -1;
        var clinicNameMatch = false;
        var cityMatch = !cityQuery;

        if (Array.isArray(doc.clinics)) {
            for (var i = 0; i < doc.clinics.length; i++) {
                var c = doc.clinics[i];
                if (!c) continue;
                if ((c.clinicName || "").toLowerCase().indexOf(query) !== -1) {
                    clinicNameMatch = true;
                }
                if (cityQuery && (c.city || "").toLowerCase().indexOf(cityQuery) !== -1) {
                    cityMatch = true;
                }
            }
        }

        var textOk = !query || nameMatch || specMatch || clinicNameMatch;
        return textOk && cityMatch;
    });

    renderDoctorsList(filtered);
}

function renderDoctorsList(doctors) {
    var listEl = document.getElementById("doctorsList");
    if (!listEl) return;

    if (!doctors || doctors.length === 0) {
        listEl.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--text-muted);">' + t("no_results") + '</p>';
        return;
    }

    var html = "";
    doctors.forEach(function(doc) {
        var clinics = Array.isArray(doc.clinics) ? doc.clinics : [];
        var primaryClinic = clinics[0] || {};
        var isClosed = primaryClinic.isClosed === true;
        var isOnBreak = primaryClinic.isOnBreak === true;

        var statusBadge = '<span class="badge badge-open">' + t("available") + '</span>';
        if (isClosed) {
            statusBadge = '<span class="badge badge-closed">' + t("closed_temp") + '</span>';
        } else if (isOnBreak) {
            statusBadge = '<span class="badge badge-break">' + t("on_break") + '</span>';
        }

        var hoursText = "";
        if (primaryClinic.startTime && primaryClinic.endTime) {
            hoursText = "<p><strong>" + t("hours_label") + "</strong> " + primaryClinic.startTime + " - " + primaryClinic.endTime + "</p>";
        }

        var locationText = "";
        if (primaryClinic.city || primaryClinic.street) {
            locationText = "<p><i class=\"fa-solid fa-location-dot\"></i> " +
                (primaryClinic.city || "") + (primaryClinic.street ? " - " + primaryClinic.street : "") + "</p>";
        }

        var actionBtn = "";
        if (isClosed) {
            actionBtn = '<button type="button" class="btn-outline" disabled>' + t("closed_temp") + '</button>';
        } else if (clinics.length > 1) {
            actionBtn = '<button type="button" class="btn-primary" onclick="openClinicSelection(\'' + doc.id + '\')">' + t("choose_clinic_btn") + '</button>';
        } else {
            actionBtn = '<button type="button" class="btn-primary" onclick="openBookingModal(\'' + doc.id + '\', 0)">' + t("book_now") + '</button>';
        }

        var mapBtn = "";
        if (primaryClinic.lat && primaryClinic.lng) {
            var mapUrl = "https://www.google.com/maps?q=" + primaryClinic.lat + "," + primaryClinic.lng;
            mapBtn = '<a class="btn-outline" href="' + mapUrl + '" target="_blank" rel="noopener"><i class="fa-solid fa-map"></i> ' + t("view_map") + '</a>';
        }

        html += '<div class="clinic-card">' +
            '<div class="clinic-header">' +
                '<h3>' + (doc.name || "طبيب") + '</h3>' +
                statusBadge +
            '</div>' +
            '<p class="specialty">' + (doc.specialty || "") + (primaryClinic.clinicName ? " — " + primaryClinic.clinicName : "") + '</p>' +
            '<div class="clinic-info">' + locationText + hoursText + '</div>' +
            '<div class="clinic-actions">' + actionBtn + mapBtn + '</div>' +
        '</div>';
    });

    listEl.innerHTML = html;
}

function openClinicSelection(doctorId) {
    var doc = allDoctors.find(function(d) { return d.id === doctorId; });
    if (!doc || !Array.isArray(doc.clinics)) return;

    var container = document.getElementById("clinicSelectionList");
    var modal = document.getElementById("clinicSelectionModal");
    if (!container || !modal) return;

    var html = "";
    doc.clinics.forEach(function(c, idx) {
        var closed = c.isClosed === true;
        html += '<div class="clinic-card" style="margin-bottom:10px;">' +
            '<div class="clinic-header"><h3>' + (c.clinicName || ("عيادة " + (idx + 1))) + '</h3>' +
            '<span class="badge ' + (closed ? "badge-closed" : "badge-open") + '">' + (closed ? t("closed_temp") : t("available")) + '</span></div>' +
            '<p class="specialty">' + (c.city || "") + (c.street ? " - " + c.street : "") + '</p>' +
            '<button type="button" class="btn-primary" ' + (closed ? "disabled" : 'onclick="closeClinicSelectionModal(); openBookingModal(\'' + doc.id + '\', ' + idx + ')"') + '>' +
            (closed ? t("closed_temp") : t("book_now")) + '</button>' +
        '</div>';
    });

    container.innerHTML = html;
    modal.classList.remove("hidden");
}

function closeClinicSelectionModal() {
    var modal = document.getElementById("clinicSelectionModal");
    if (modal) modal.classList.add("hidden");
}

function openBookingModal(doctorId, clinicIndex) {
    var doc = allDoctors.find(function(d) { return d.id === doctorId; });
    if (!doc) return;
    var clinics = Array.isArray(doc.clinics) ? doc.clinics : [];
    var clinic = clinics[clinicIndex || 0];
    if (!clinic || clinic.isClosed === true) return;

    selectedDoctor = doc;
    selectedClinic = clinic;
    selectedClinicIndex = clinicIndex || 0;

    var now = new Date();
    calendarViewYear = now.getFullYear();
    calendarViewMonth = now.getMonth();
    calendarBookingsByDate = {};

    var titleEl = document.getElementById("modalDoctorName");
    if (titleEl) {
        titleEl.innerText = t("book_now") + " — " + (doc.name || "") + (clinic.clinicName ? " (" + clinic.clinicName + ")" : "");
    }

    var nameInput = document.getElementById("bookingName");
    var phoneInput = document.getElementById("bookingPhone");
    var dateInput = document.getElementById("bookingDate");
    if (nameInput) nameInput.value = "";
    if (phoneInput) phoneInput.value = "";
    if (dateInput) dateInput.value = "";

    loadClinicCalendarBookings(doc.id, selectedClinicIndex);
    renderCustomBookingCalendar();

    var modal = document.getElementById("bookingModal");
    if (modal) modal.classList.remove("hidden");
}

function closeModal() {
    var modal = document.getElementById("bookingModal");
    if (modal) modal.classList.add("hidden");
    if (unsubscribeBookings) {
        unsubscribeBookings();
        unsubscribeBookings = null;
    }
}

function generate12DigitSecret() {
    var code = "";
    for (var i = 0; i < 12; i++) {
        code += Math.floor(Math.random() * 10);
    }
    return code;
}

function confirmBooking() {
    if (!selectedDoctor || !selectedClinic) return;
    var nameInput = document.getElementById("bookingName");
    var phoneInput = document.getElementById("bookingPhone");
    var dateInput = document.getElementById("bookingDate");

    var patientName = nameInput ? nameInput.value.trim() : "";
    var patientPhone = phoneInput ? phoneInput.value.trim() : "";
    var dateStr = dateInput ? dateInput.value.trim() : "";

    if (!patientName) {
        alert("يرجى إدخال اسم المريض.");
        return;
    }
    if (!dateStr || !isDateAvailableForClinic(dateStr, selectedClinic)) {
        alert("يرجى اختيار يوم متاح وغير مكتمل من التقويم.");
        return;
    }

    var capacity = calculateDailyCapacity(selectedClinic);
    var docRef = db.collection("doctors").doc(selectedDoctor.id);
    var newBookingRef = db.collection("bookings").doc();
    var secretCode = generate12DigitSecret();

    db.runTransaction(function(transaction) {
        return transaction.get(docRef).then(function(docSnap) {
            if (!docSnap.exists) {
                throw new Error("العيادة غير موجودة.");
            }
            var docData = docSnap.data();
            var clinics = Array.isArray(docData.clinics) ? docData.clinics.slice() : [];
            var clinicObj = clinics[selectedClinicIndex];
            if (!clinicObj || clinicObj.isClosed === true) {
                throw new Error("العيادة مغلقة حالياً.");
            }

            var currentSerial = parseInt(clinicObj.serialNumber, 10) || 0;
            var nextSerial = currentSerial + 1;
            clinicObj.serialNumber = nextSerial;
            clinics[selectedClinicIndex] = clinicObj;

            var dailyKey = selectedClinicIndex + "_" + dateStr;
            var dailyCounters = clinicObj.dailyCounters && typeof clinicObj.dailyCounters === "object"
                ? Object.assign({}, clinicObj.dailyCounters)
                : {};
            var nextQueueNumber = (parseInt(dailyCounters[dailyKey], 10) || 0) + 1;
            if (capacity > 0 && nextQueueNumber > capacity) {
                throw new Error("اكتمل عدد الحجوزات المسموح به لهذا اليوم.");
            }
            dailyCounters[dailyKey] = nextQueueNumber;
            clinicObj.dailyCounters = dailyCounters;

            transaction.update(docRef, { clinics: clinics });

            transaction.set(newBookingRef, {
                doctorId: selectedDoctor.id,
                doctorName: docData.name || "",
                specialty: docData.specialty || "",
                clinicIndex: selectedClinicIndex,
                clinicName: clinicObj.clinicName || "",
                serviceTime: parseInt(clinicObj.serviceTime, 10) || 10,
                patientName: patientName,
                patientPhone: patientPhone,
                date: dateStr,
                ticketNumber: nextQueueNumber,
                serialNumber: nextSerial,
                patientSecret: secretCode,
                status: "waiting",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return {
                bookingId: newBookingRef.id,
                ticketNumber: nextQueueNumber,
                secretCode: secretCode
            };
        });
    }).then(function(result) {
        saveBookingIdLocally(result.bookingId);
        closeModal();
        openTicketView(result.bookingId);
    }).catch(function(err) {
        alert(err && err.message ? err.message : "تعذر إتمام الحجز.");
    });
}

function goBackToSearch() {
    if (unsubscribeTicketBookings) {
        unsubscribeTicketBookings();
        unsubscribeTicketBookings = null;
    }
    currentTicketBookingId = null;
    hideTicketAlert();
    var mainView = document.getElementById("main-view");
    var bookingsView = document.getElementById("bookings-view");
    var ticketView = document.getElementById("ticket-view");
    if (mainView) mainView.classList.remove("hidden");
    if (bookingsView) bookingsView.classList.add("hidden");
    if (ticketView) ticketView.classList.add("hidden");
    updateActiveBookingBanner();
}

function showMyBookingsView() {
    if (unsubscribeTicketBookings) {
        unsubscribeTicketBookings();
        unsubscribeTicketBookings = null;
    }
    hideTicketAlert();
    var mainView = document.getElementById("main-view");
    var bookingsView = document.getElementById("bookings-view");
    var ticketView = document.getElementById("ticket-view");
    var listEl = document.getElementById("myBookingsList");

    if (mainView) mainView.classList.add("hidden");
    if (bookingsView) bookingsView.classList.remove("hidden");
    if (ticketView) ticketView.classList.add("hidden");
    if (!listEl) return;

    var ids = getSavedBookingIds();
    if (ids.length === 0) {
        listEl.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--text-muted);">' + t("no_bookings") + '</p>';
        return;
    }

    listEl.innerHTML = '<div class="clinic-card skeleton-card"></div>';

    Promise.all(ids.map(function(id) {
        return db.collection("bookings").doc(id).get();
    })).then(function(docs) {
        var html = "";
        docs.forEach(function(doc) {
            if (!doc.exists) return;
            var b = doc.data();
            var statusLabel = b.status === "done" ? t("booking_done") : (b.status === "cancelled" ? t("booking_cancelled") : t("status_waiting"));
            html += '<div class="clinic-card">' +
                '<div class="clinic-header"><h3>' + (b.patientName || "") + '</h3><span class="badge badge-open">' + statusLabel + '</span></div>' +
                '<p class="specialty">' + (b.doctorName || "") + (b.clinicName ? " — " + b.clinicName : "") + '</p>' +
                '<div class="clinic-info">' +
                    '<p><strong>' + t("appointment_date") + '</strong> ' + (b.date || "") + '</p>' +
                    '<p><strong>' + t("your_number") + '</strong> ' + (b.ticketNumber || "-") + '</p>' +
                '</div>' +
                '<div class="clinic-actions">' +
                    '<button type="button" class="btn-primary" onclick="openTicketView(\'' + doc.id + '\')">' + t("view_ticket") + '</button>' +
                '</div>' +
            '</div>';
        });
        listEl.innerHTML = html || '<p style="grid-column:1/-1; text-align:center; color:var(--text-muted);">' + t("no_bookings") + '</p>';
    });
}

function restoreBookingByCode() {
    var inputCode = prompt(t("secret_prompt"));
    if (!inputCode) return;
    var cleanCode = inputCode.trim();
    if (!cleanCode) return;

    db.collection("bookings")
        .where("patientSecret", "==", cleanCode)
        .limit(1)
        .get()
        .then(function(snap) {
            if (snap.empty) {
                alert(t("invalid_booking"));
                return;
            }
            var docSnap = snap.docs[0];
            saveBookingIdLocally(docSnap.id);
            openTicketView(docSnap.id);
        })
        .catch(function() {
            alert(t("invalid_booking"));
        });
}

function openTicketView(bookingId) {
    currentTicketBookingId = bookingId;
    lastTicketNumber = null;
    lastAheadCount = null;
    hideTicketAlert();

    var mainView = document.getElementById("main-view");
    var bookingsView = document.getElementById("bookings-view");
    var ticketView = document.getElementById("ticket-view");
    if (mainView) mainView.classList.add("hidden");
    if (bookingsView) bookingsView.classList.add("hidden");
    if (ticketView) ticketView.classList.remove("hidden");

    if (unsubscribeTicketBookings) {
        unsubscribeTicketBookings();
        unsubscribeTicketBookings = null;
    }

    db.collection("bookings").doc(bookingId).get().then(function(docSnap) {
        if (!docSnap.exists) {
            alert(t("invalid_booking"));
            goBackToSearch();
            return;
        }
        var b = docSnap.data();
        b.id = docSnap.id;
        listenToQueueForTicket(b);
    });
}

function listenToQueueForTicket(ticketData) {
    if (unsubscribeTicketBookings) {
        unsubscribeTicketBookings();
    }

    unsubscribeTicketBookings = db.collection("bookings")
        .where("doctorId", "==", ticketData.doctorId)
        .where("clinicIndex", "==", ticketData.clinicIndex)
        .where("date", "==", ticketData.date)
        .onSnapshot(function(snapshot) {
            var currentTicket = null;
            var activeQueue = [];
            var servingNumber = 0;

            snapshot.forEach(function(doc) {
                var item = doc.data();
                item.id = doc.id;
                if (doc.id === ticketData.id) {
                    currentTicket = item;
                }
                if (item.status === "serving") {
                    servingNumber = Math.max(servingNumber, parseInt(item.ticketNumber, 10) || 0);
                }
                if (item.status !== "cancelled" && item.status !== "done") {
                    activeQueue.push(item);
                }
            });

            if (!currentTicket) return;

            activeQueue.sort(function(a, b) {
                return (parseInt(a.ticketNumber, 10) || 0) - (parseInt(b.ticketNumber, 10) || 0);
            });

            var myNum = parseInt(currentTicket.ticketNumber, 10) || 0;
            var aheadCount = 0;
            for (var i = 0; i < activeQueue.length; i++) {
                var qNum = parseInt(activeQueue[i].ticketNumber, 10) || 0;
                if (qNum < myNum) {
                    aheadCount++;
                }
            }

            if (lastTicketNumber !== null && myNum !== lastTicketNumber && currentTicket.status !== "cancelled" && currentTicket.status !== "done") {
                showTicketAlert("تم تحديث رقم دورك في الطابور ليصبح: " + myNum, "reorder");
            } else if (currentTicket.status === "serving") {
                showTicketAlert(t("status_your_turn"), "turn");
            } else if (aheadCount === 1 && lastAheadCount !== 1 && currentTicket.status !== "cancelled" && currentTicket.status !== "done") {
                showTicketAlert(t("status_one_left"), "turn");
            }

            lastTicketNumber = myNum;
            lastAheadCount = aheadCount;

            var nameEl = document.getElementById("patientNameDisplay");
            var statusEl = document.getElementById("ticketStatus");
            var numEl = document.getElementById("ticketNumber");
            var docEl = document.getElementById("doctorNameDisplay");
            var dateEl = document.getElementById("appointmentDateDisplay");
            var aheadEl = document.getElementById("peopleAhead");
            var waitEl = document.getElementById("waitTime");
            var etaEl = document.getElementById("etaTime");
            var credBox = document.getElementById("bookingCredentials");
            var refEl = document.getElementById("bookingReference");
            var secEl = document.getElementById("bookingSecret");

            if (nameEl) nameEl.innerText = currentTicket.patientName || "---";
            if (numEl) numEl.innerText = myNum || "-";
            if (docEl) docEl.innerText = t("at_doctor") + (currentTicket.doctorName || "") + (currentTicket.clinicName ? " — " + currentTicket.clinicName : "");
            if (dateEl) dateEl.innerText = t("appointment_date") + " " + (currentTicket.date || "");

            if (statusEl) {
                if (currentTicket.status === "done") {
                    statusEl.innerText = t("booking_done");
                    statusEl.className = "badge badge-closed";
                } else if (currentTicket.status === "cancelled") {
                    statusEl.innerText = t("booking_cancelled");
                    statusEl.className = "badge badge-closed";
                } else if (currentTicket.status === "serving") {
                    statusEl.innerText = t("status_your_turn");
                    statusEl.className = "badge badge-open";
                } else if (aheadCount === 1) {
                    statusEl.innerText = t("status_one_left");
                    statusEl.className = "badge badge-break";
                } else {
                    statusEl.innerText = t("status_waiting");
                    statusEl.className = "badge badge-open";
                }
            }

            if (aheadEl) aheadEl.innerText = aheadCount;
            var serviceMins = parseInt(currentTicket.serviceTime, 10) || 10;
            var totalWaitMins = aheadCount * serviceMins;
            if (waitEl) waitEl.innerText = totalWaitMins;

            if (etaEl) {
                var etaDate = new Date(Date.now() + totalWaitMins * 60000);
                var hh = String(etaDate.getHours()).padStart(2, "0");
                var mm = String(etaDate.getMinutes()).padStart(2, "0");
                etaEl.innerText = hh + ":" + mm;
            }

            if (credBox) {
                if (currentTicket.patientSecret) {
                    credBox.classList.remove("hidden");
                    if (refEl) refEl.innerText = currentTicket.id;
                    if (secEl) secEl.innerText = currentTicket.patientSecret;
                } else {
                    credBox.classList.add("hidden");
                }
            }
        });
}

function copyPatientCredentials() {
    var secEl = document.getElementById("bookingSecret");
    var code = secEl ? secEl.innerText.trim() : "";
    if (!code || code === "---") return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function() {
            alert(t("copy_success"));
        }).catch(function() {
            alert(code);
        });
    } else {
        alert(code);
    }
}

function cancelCurrentTicket() {
    if (!currentTicketBookingId) return;
    if (!confirm("هل أنت متأكد من إلغاء هذا الحجز؟")) return;

    var bookingRef = db.collection("bookings").doc(currentTicketBookingId);

    bookingRef.get().then(function(docSnap) {
        if (!docSnap.exists) return;
        var targetData = docSnap.data();
        var cancelledNum = parseInt(targetData.ticketNumber, 10) || 0;

        return bookingRef.update({ status: "cancelled" }).then(function() {
            removeBookingIdLocally(currentTicketBookingId);
            return reorderRemainingQueue(targetData.doctorId, targetData.clinicIndex, targetData.date, cancelledNum);
        });
    }).then(function() {
        alert(t("booking_cancelled"));
        showMyBookingsView();
    }).catch(function(err) {
        console.error(err);
        alert("حدث خطأ أثناء إلغاء الحجز.");
    });
}

function reorderRemainingQueue(doctorId, clinicIndex, dateStr, removedTicketNumber) {
    return db.collection("bookings")
        .where("doctorId", "==", doctorId)
        .where("clinicIndex", "==", clinicIndex)
        .where("date", "==", dateStr)
        .get()
        .then(function(snap) {
            var remaining = [];
            snap.forEach(function(doc) {
                var d = doc.data();
                if (d.status === "cancelled" || d.status === "done") return;
                var num = parseInt(d.ticketNumber, 10) || 0;
                if (removedTicketNumber > 0 && num > removedTicketNumber) {
                    remaining.push({ ref: doc.ref, num: num });
                }
            });

            remaining.sort(function(a, b) { return a.num - b.num; });

            var batch = db.batch();
            for (var i = 0; i < remaining.length; i++) {
                var newNum = remaining[i].num - 1;
                batch.update(remaining[i].ref, { ticketNumber: newNum });
            }
            return batch.commit();
        });
}

function openDoctorModal() {
    var modal = document.getElementById("doctorModal");
    if (modal) modal.classList.remove("hidden");
    switchAuthTab("login");
    initRegMapIfNeeded();
}

function closeDoctorModal() {
    var modal = document.getElementById("doctorModal");
    if (modal) modal.classList.add("hidden");
}

function switchAuthTab(tab) {
    var tabLogin = document.getElementById("tabLogin");
    var tabRegister = document.getElementById("tabRegister");
    var loginSec = document.getElementById("loginSection");
    var regSec = document.getElementById("registerSection");

    if (tab === "register") {
        if (tabLogin) tabLogin.classList.remove("active");
        if (tabRegister) tabRegister.classList.add("active");
        if (loginSec) loginSec.classList.add("hidden");
        if (regSec) regSec.classList.remove("hidden");
        initRegMapIfNeeded();
    } else {
        if (tabLogin) tabLogin.classList.add("active");
        if (tabRegister) tabRegister.classList.remove("active");
        if (loginSec) loginSec.classList.remove("hidden");
        if (regSec) regSec.classList.add("hidden");
    }
}

function initRegMapIfNeeded() {
    var mapEl = document.getElementById("reg-map");
    if (!mapEl || typeof L === "undefined") return;
    if (!regMap) {
        regMap = L.map("reg-map").setView([15.3694, 44.1910], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap"
        }).addTo(regMap);
        regMap.on("click", function(e) {
            var lat = e.latlng.lat.toFixed(6);
            var lng = e.latlng.lng.toFixed(6);
            var latInp = document.getElementById("docLat");
            var lngInp = document.getElementById("docLng");
            if (latInp) latInp.value = lat;
            if (lngInp) lngInp.value = lng;
            if (regMarker) {
                regMarker.setLatLng(e.latlng);
            } else {
                regMarker = L.marker(e.latlng).addTo(regMap);
            }
        });
    }
    setTimeout(function() {
        if (regMap) regMap.invalidateSize();
    }, 200);
}

function addAnotherClinicField() {
    alert("يمكنك إضافة عيادات أخرى مباشرة من داخل لوحة الطبيب بعد إنشاء الحساب عبر زر (إضافة عيادة).");
}

function loginDoctor() {
    var emailEl = document.getElementById("loginEmail");
    var passEl = document.getElementById("loginPassword");
    var email = emailEl ? emailEl.value.trim() : "";
    var password = passEl ? passEl.value : "";

    if (!email || !password) {
        alert("يرجى إدخال البريد الإلكتروني وكلمة المرور.");
        return;
    }

    auth.signInWithEmailAndPassword(email, password).then(function() {
        window.location.href = "admin.html";
    }).catch(function(err) {
        alert(err && err.message ? err.message : "فشل تسجيل الدخول.");
    });
}

function registerAndSaveDoctor() {
    var email = (document.getElementById("regEmail") || {}).value || "";
    var password = (document.getElementById("regPassword") || {}).value || "";
    var docName = (document.getElementById("docName") || {}).value || "";
    var specialty = (document.getElementById("docSpecialty") || {}).value || "";
    var phone = (document.getElementById("docPhone") || {}).value || "";
    var clinicName = (document.getElementById("docClinicName") || {}).value || "";
    var city = (document.getElementById("docCity") || {}).value || "";
    var street = (document.getElementById("docStreet") || {}).value || "";
    var landmark = (document.getElementById("docLandmark") || {}).value || "";
    var startTime = (document.getElementById("docStartTime") || {}).value || "09:00";
    var endTime = (document.getElementById("docEndTime") || {}).value || "17:00";
    var serviceTime = parseInt(((document.getElementById("docServiceTime") || {}).value || "10"), 10) || 10;
    var lat = parseFloat(((document.getElementById("docLat") || {}).value || "")) || null;
    var lng = parseFloat(((document.getElementById("docLng") || {}).value || "")) || null;

    email = email.trim();
    docName = docName.trim();
    clinicName = clinicName.trim();

    if (!email || !password || !docName || !clinicName) {
        alert("يرجى تعبئة البريد الإلكتروني وكلمة المرور واسم الطبيب واسم العيادة.");
        return;
    }

    var workingDays = [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("day_" + d);
        if (cb && cb.checked) workingDays.push(d);
    }

    auth.createUserWithEmailAndPassword(email, password).then(function(cred) {
        var uid = cred.user.uid;
        return db.collection("doctors").doc(uid).set({
            ownerUid: uid,
            email: email,
            name: docName,
            specialty: specialty.trim(),
            phone: phone.trim(),
            clinics: [
                {
                    clinicName: clinicName,
                    city: city.trim(),
                    street: street.trim(),
                    landmark: landmark.trim(),
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
                }
            ],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }).then(function() {
        window.location.href = "admin.html";
    }).catch(function(err) {
        alert(err && err.message ? err.message : "حدث خطأ أثناء إنشاء الحساب.");
    });
}

window.onload = function() {
    applySavedTheme();
    if (typeof applyLanguage === "function") {
        applyLanguage();
    }
    loadDoctors();
};
