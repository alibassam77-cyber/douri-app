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

var DOCTOR_ACTIVATION_CODE = "DOCTOR@2024";

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
var regLocationControlAdded = false;

var calendarViewYear = null;
var calendarViewMonth = null;
var calendarBookingsByDate = {};
var lastTicketNumber = null;
var lastAheadCount = null;
var lastTicketStatus = null;
var notified45MinForTicket = false;
var audioCtx = null;

var activeCountdownInterval = null;
var activeTicketContext = null;
var lastTicketViewState = null;

var sortByNearestEnabled = false;
var patientCurrentCoords = null;

function isValidDoctorActivationCode(code) {
    if (!code) return false;
    return String(code).trim() === DOCTOR_ACTIVATION_CODE;
}

function getLocalizedDoctorName(doc) {
    if (!doc) return "";
    if (getCurrentLang() === "en" && doc.nameEn && String(doc.nameEn).trim()) {
        return String(doc.nameEn).trim();
    }
    return doc.name || "";
}

function getLocalizedSpecialty(doc) {
    if (!doc) return "";
    if (getCurrentLang() === "en" && doc.specialtyEn && String(doc.specialtyEn).trim()) {
        return String(doc.specialtyEn).trim();
    }
    return doc.specialty || "";
}

function getLocalizedClinicName(clinic) {
    if (!clinic) return "";
    if (getCurrentLang() === "en" && clinic.clinicNameEn && String(clinic.clinicNameEn).trim()) {
        return String(clinic.clinicNameEn).trim();
    }
    return clinic.clinicName || "";
}

function getLocalizedCity(clinic) {
    if (!clinic) return "";
    if (getCurrentLang() === "en" && clinic.cityEn && String(clinic.cityEn).trim()) {
        return String(clinic.cityEn).trim();
    }
    return clinic.city || "";
}

function getLocalizedStreet(clinic) {
    if (!clinic) return "";
    if (getCurrentLang() === "en" && clinic.streetEn && String(clinic.streetEn).trim()) {
        return String(clinic.streetEn).trim();
    }
    return clinic.street || "";
}

function calculateDistanceKm(lat1, lng1, lat2, lng2) {
    var nLat1 = parseFloat(lat1);
    var nLng1 = parseFloat(lng1);
    var nLat2 = parseFloat(lat2);
    var nLng2 = parseFloat(lng2);
    if (isNaN(nLat1) || isNaN(nLng1) || isNaN(nLat2) || isNaN(nLng2)) {
        return null;
    }
    var toRad = function(deg) { return deg * Math.PI / 180; };
    var R = 6371;
    var dLat = toRad(nLat2 - nLat1);
    var dLng = toRad(nLng2 - nLng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(nLat1)) * Math.cos(toRad(nLat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function formatDistanceText(distanceKm) {
    if (distanceKm === null || isNaN(distanceKm)) return "";
    if (distanceKm < 1) {
        var meters = Math.max(1, Math.round(distanceKm * 1000));
        return t("distance_m").replace("{m}", meters);
    }
    return t("distance_km").replace("{km}", distanceKm.toFixed(1));
}

function getNearestClinicDistanceForDoctor(doc) {
    if (!patientCurrentCoords || !doc || !Array.isArray(doc.clinics)) return null;
    var minDist = null;
    for (var i = 0; i < doc.clinics.length; i++) {
        var c = doc.clinics[i];
        if (!c) continue;
        var d = calculateDistanceKm(patientCurrentCoords.lat, patientCurrentCoords.lng, c.lat, c.lng);
        if (d !== null && (minDist === null || d < minDist)) {
            minDist = d;
        }
    }
    return minDist;
}

function updateNearestButtonLabel() {
    var btn = document.getElementById("nearestSortBtn");
    var span = document.getElementById("nearestSortBtnText");
    if (!btn || !span) return;
    span.innerText = sortByNearestEnabled ? t("nearest_active_btn") : t("nearest_btn");
    if (sortByNearestEnabled) {
        btn.classList.remove("btn-outline");
        btn.classList.add("btn-primary");
    } else {
        btn.classList.remove("btn-primary");
        btn.classList.add("btn-outline");
    }
}

function toggleNearestSort() {
    if (sortByNearestEnabled) {
        sortByNearestEnabled = false;
        updateNearestButtonLabel();
        filterDoctors();
        return;
    }

    if (patientCurrentCoords) {
        sortByNearestEnabled = true;
        updateNearestButtonLabel();
        filterDoctors();
        return;
    }

    if (!navigator.geolocation) {
        alert(t("err_geo_unsupported"));
        return;
    }

    navigator.geolocation.getCurrentPosition(function(pos) {
        patientCurrentCoords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
        };
        sortByNearestEnabled = true;
        updateNearestButtonLabel();
        filterDoctors();
    }, function() {
        alert(t("err_geo_failed"));
    }, {
        enableHighAccuracy: true,
        timeout: 10000
    });
}

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
        var notes = type === "turn" ? [880, 1174.66, 1318.51, 1567.98] : [659.25, 783.99];
        for (var i = 0; i < notes.length; i++) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(notes[i], now + i * 0.16);
            gain.gain.setValueAtTime(0.001, now + i * 0.16);
            gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.16 + 0.03);
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
                navigator.vibrate([350, 120, 350, 120, 450]);
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

function updateTicketInactiveState(isInactive) {
    var noticeEl = document.getElementById("inactiveTicketNotice");
    var cancelBtn = document.getElementById("cancelTicketBtn");
    if (noticeEl) {
        if (isInactive) {
            noticeEl.classList.remove("hidden");
        } else {
            noticeEl.classList.add("hidden");
        }
    }
    if (cancelBtn) {
        if (isInactive) {
            cancelBtn.classList.add("hidden");
        } else {
            cancelBtn.classList.remove("hidden");
        }
    }
}

function stopTicketCountdown() {
    if (activeCountdownInterval) {
        clearInterval(activeCountdownInterval);
        activeCountdownInterval = null;
    }
    activeTicketContext = null;
}

function renderTicketDetailsFromState(state) {
    if (!state) return;

    var nameEl = document.getElementById("patientNameDisplay");
    var statusEl = document.getElementById("ticketStatus");
    var numEl = document.getElementById("ticketNumber");
    var docEl = document.getElementById("doctorNameDisplay");
    var dateEl = document.getElementById("appointmentDateDisplay");
    var aheadEl = document.getElementById("peopleAhead");
    var waitEl = document.getElementById("waitTime");
    var credBox = document.getElementById("bookingCredentials");
    var refEl = document.getElementById("bookingReference");
    var secEl = document.getElementById("bookingSecret");

    if (nameEl) nameEl.innerText = state.patientName || "---";
    if (numEl) numEl.innerText = state.ticketNumber || "-";
    if (docEl) {
        docEl.innerText = t("at_doctor") + (state.doctorName || "") + (state.clinicName ? " — " + state.clinicName : "");
    }
    if (dateEl) {
        dateEl.innerText = t("appointment_date") + " " + (state.date || "");
    }

    var isInactive = state.status === "done" || state.status === "cancelled";
    updateTicketInactiveState(isInactive);

    if (statusEl) {
        if (state.status === "done") {
            statusEl.innerText = t("booking_done");
            statusEl.className = "badge badge-closed";
        } else if (state.status === "cancelled") {
            statusEl.innerText = t("booking_cancelled");
            statusEl.className = "badge badge-closed";
        } else if (!state.isSameDay) {
            statusEl.innerText = t("status_upcoming");
            statusEl.className = "badge badge-open";
        } else if (state.status === "serving" && state.isSameDay) {
            statusEl.innerText = t("status_your_turn");
            statusEl.className = "badge badge-open";
        } else if (state.aheadCount === 1) {
            statusEl.innerText = t("status_one_left");
            statusEl.className = "badge badge-break";
        } else {
            statusEl.innerText = t("status_waiting");
            statusEl.className = "badge badge-open";
        }
    }

    if (aheadEl) aheadEl.innerText = state.aheadCount;
    if (waitEl) waitEl.innerText = state.totalWaitMins;

    if (credBox) {
        if (state.patientSecret) {
            credBox.classList.remove("hidden");
            if (refEl) refEl.innerText = state.bookingId;
            if (secEl) secEl.innerText = state.patientSecret;
        } else {
            credBox.classList.add("hidden");
        }
    }
}

function refreshCurrentTicketViewLanguage() {
    var ticketView = document.getElementById("ticket-view");
    if (!ticketView || ticketView.classList.contains("hidden") || !lastTicketViewState) return;
    renderTicketDetailsFromState(lastTicketViewState);
}

function buildTicketShareText() {
    var state = lastTicketViewState || {};
    var patient = state.patientName || ((document.getElementById("patientNameDisplay") || {}).innerText || "---");
    var clinic = ((state.doctorName || "") + (state.clinicName ? " — " + state.clinicName : "")) || ((document.getElementById("doctorNameDisplay") || {}).innerText || "---");
    var date = state.date || ((document.getElementById("appointmentDateDisplay") || {}).innerText || "---");
    var ticket = state.ticketNumber || ((document.getElementById("ticketNumber") || {}).innerText || "-");
    var secret = state.patientSecret || ((document.getElementById("bookingSecret") || {}).innerText || "---");

    return t("share_whatsapp_template")
        .replace("{patient}", patient)
        .replace("{clinic}", clinic)
        .replace("{date}", date)
        .replace("{ticket}", ticket)
        .replace("{secret}", secret);
}

function shareTicketViaWhatsApp() {
    var text = buildTicketShareText();
    var url = "https://wa.me/?text=" + encodeURIComponent(text);
    window.open(url, "_blank", "noopener");
}

function shareTicketDetails() {
    var text = buildTicketShareText();
    if (navigator.share) {
        navigator.share({
            title: t("ticket_title"),
            text: text
        }).catch(function() {});
        return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            alert(t("share_copied_msg"));
        }).catch(function() {
            alert(text);
        });
    } else {
        alert(text);
    }
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

function formatDateSlashes(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return "";
    var parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return parts[0] + "/" + parts[1] + "/" + parts[2];
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

function formatMinutesTo12H(totalMinutes) {
    var minsInDay = ((totalMinutes % 1440) + 1440) % 1440;
    var h24 = Math.floor(minsInDay / 60);
    var min = minsInDay % 60;
    var isAr = getCurrentLang() === "ar";
    var period = h24 >= 12 ? (isAr ? "مساءً" : "PM") : (isAr ? "صباحاً" : "AM");
    var h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return String(h12).padStart(2, "0") + ":" + String(min).padStart(2, "0") + " " + period;
}

function formatExpectedAppointmentText(dateStr, expectedMinutes) {
    var timeFormatted = formatMinutesTo12H(expectedMinutes);
    var todayStr = getTodayStr();
    var tomorrowStr = getTomorrowStr();
    var isAr = getCurrentLang() === "ar";

    if (dateStr === todayStr) {
        return timeFormatted;
    }

    var slashDate = formatDateSlashes(dateStr);
    if (dateStr === tomorrowStr) {
        return t("tomorrow") + slashDate + (isAr ? " الساعة " : " at ") + timeFormatted;
    }
    return slashDate + (isAr ? " الساعة " : " at ") + timeFormatted;
}

function buildDateTimeFromYMDAndMinutes(dateStr, totalMinutes) {
    if (!dateStr) return null;
    var parts = dateStr.split("-");
    if (parts.length !== 3) return null;
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    var safeMins = Math.max(0, totalMinutes || 0);
    var h = Math.floor(safeMins / 60);
    var min = safeMins % 60;
    return new Date(y, m, d, h, min, 0, 0);
}

function formatCountdownDuration(diffMs) {
    var totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
    var hours = Math.floor(totalSeconds / 3600);
    var mins = Math.floor((totalSeconds % 3600) / 60);
    var secs = totalSeconds % 60;
    return String(hours).padStart(2, "0") + ":" + String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
}

function findClinicForTicket(ticketData) {
    if (!ticketData) return null;
    var doc = allDoctors.find(function(d) { return d.id === ticketData.doctorId; });
    if (!doc || !Array.isArray(doc.clinics)) return null;
    var idx = parseInt(ticketData.clinicIndex, 10);
    if (isNaN(idx) || idx < 0) idx = 0;
    return doc.clinics[idx] || doc.clinics[0] || null;
}

function computeClampedExpectedMinutes(ctx) {
    var openMins = typeof ctx.openMinutes === "number" ? ctx.openMinutes : 540;
    var waitMins = typeof ctx.totalWaitMins === "number" ? ctx.totalWaitMins : 0;
    var candidateMins = openMins + waitMins;

    if (ctx.dateStr === getTodayStr()) {
        var now = new Date();
        var nowMins = now.getHours() * 60 + now.getMinutes();
        if (nowMins > openMins && nowMins + waitMins > candidateMins) {
            candidateMins = nowMins + waitMins;
        }
    }

    if (typeof ctx.closeMinutes === "number" && ctx.closeMinutes > openMins && candidateMins > ctx.closeMinutes) {
        return ctx.closeMinutes;
    }
    return candidateMins;
}

function check45MinuteAlertIfNeeded(ctx, nowMs, appointmentStartDateTime) {
    if (!ctx || !ctx.isActive || ctx.dateStr !== getTodayStr()) return;
    if (notified45MinForTicket) return;

    var remainingMs = appointmentStartDateTime.getTime() - nowMs;
    var fortyFiveMinsMs = 45 * 60 * 1000;
    var oneMinuteMs = 60 * 1000;

    if (remainingMs > 0 && remainingMs <= fortyFiveMinsMs && remainingMs >= (fortyFiveMinsMs - oneMinuteMs)) {
        notified45MinForTicket = true;
        showTicketAlert(t("alert_45_mins"), "turn");
    }
}

function refreshTicketCountdownDisplay() {
    var etaEl = document.getElementById("etaTime");
    var cdEl = document.getElementById("appointmentCountdown");
    if (!activeTicketContext || !etaEl || !cdEl) return;

    var ctx = activeTicketContext;
    var nowDate = new Date();
    var nowMs = nowDate.getTime();
    var displayedMins = computeClampedExpectedMinutes(ctx);
    var targetDateTime = buildDateTimeFromYMDAndMinutes(ctx.dateStr, displayedMins);
    var openDateTime = buildDateTimeFromYMDAndMinutes(ctx.dateStr, ctx.openMinutes);

    if (etaEl) {
        etaEl.innerText = formatExpectedAppointmentText(ctx.dateStr, displayedMins);
    }

    if (!targetDateTime) {
        cdEl.innerText = "--:--:--";
        return;
    }

    var todayStr = getTodayStr();
    var isAr = getCurrentLang() === "ar";

    if (ctx.dateStr > todayStr) {
        var openTimeStr = formatMinutesTo12H(ctx.openMinutes);
        var untilTargetMs = Math.max(0, targetDateTime.getTime() - nowMs);
        var prefixFuture = isAr
            ? ("يبدأ الدوام " + openTimeStr + " — متبقي ")
            : ("Opens " + openTimeStr + " — ");
        cdEl.innerText = prefixFuture + formatCountdownDuration(untilTargetMs);
        return;
    }

    if (openDateTime && nowMs < openDateTime.getTime()) {
        cdEl.innerText = formatCountdownDuration(targetDateTime.getTime() - nowMs);
        check45MinuteAlertIfNeeded(ctx, nowMs, targetDateTime);
        return;
    }

    if (nowMs < targetDateTime.getTime()) {
        cdEl.innerText = formatCountdownDuration(targetDateTime.getTime() - nowMs);
        check45MinuteAlertIfNeeded(ctx, nowMs, targetDateTime);
    } else {
        cdEl.innerText = t("countdown_due_now");
    }
}

function startTicketCountdownLoop(context) {
    if (activeCountdownInterval) {
        clearInterval(activeCountdownInterval);
        activeCountdownInterval = null;
    }
    activeTicketContext = context;
    refreshTicketCountdownDisplay();
    activeCountdownInterval = setInterval(refreshTicketCountdownDisplay, 1000);
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

function isShiftEndedForToday(dateStr, clinic) {
    if (!dateStr || !clinic || dateStr !== getTodayStr()) return false;
    var endMin = parseMinutesFromHHMM(clinic.endTime);
    if (endMin === null) return false;
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    return nowMin >= endMin;
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

    var bookedCount = calendarBookingsByDate[dateStr] || 0;

    if (isShiftEndedForToday(dateStr, clinic) && bookedCount <= 0) {
        return false;
    }

    var capacity = calculateDailyCapacity(clinic);
    if (capacity > 0 && bookedCount >= capacity) {
        return false;
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
    var isAr = getCurrentLang() === "ar";
    var monthNames = isAr
        ? ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
        : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var weekDays = isAr
        ? ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"]
        : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

        var titleAttr = isFull ? t("cal_day_full") : (!available ? t("cal_day_unavailable") : t("cal_day_available"));
        html += '<button type="button" class="' + cls + '" title="' + titleAttr + '" ' +
            (!available ? 'disabled' : 'onclick="selectCalendarDate(\'' + dateStr + '\')"') + '>' +
            day + '</button>';
    }
    html += '</div>';

    calContainer.innerHTML = html;

    if (hintEl) {
        if (capacity > 0) {
            hintEl.innerText = t("cal_capacity_hint").replace("{n}", capacity);
        } else {
            hintEl.innerText = t("cal_unavailable_hint");
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

function hasValidClinics(doc) {
    return !!(doc && doc.isDeleted !== true && Array.isArray(doc.clinics) && doc.clinics.length > 0);
}

function loadDoctors() {
    var listEl = document.getElementById("doctorsList");
    if (unsubscribeDoctors) {
        unsubscribeDoctors();
    }

    var fallbackTimer = setTimeout(function() {
        if (listEl && listEl.querySelector(".skeleton-card")) {
            listEl.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--text-muted);">' + t("err_load_clinics") + '</p>';
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
            if (hasValidClinics(data)) {
                data.clinics.forEach(function(c) {
                    var cityLabel = getLocalizedCity(c) || (c && c.city);
                    if (cityLabel) {
                        citiesSet[cityLabel.trim()] = true;
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
        if (activeTicketContext) {
            var clinicObj = findClinicForTicket(activeTicketContext);
            if (clinicObj) {
                var parsedOpen = parseMinutesFromHHMM(clinicObj.startTime);
                var parsedClose = parseMinutesFromHHMM(clinicObj.endTime);
                if (parsedOpen !== null) {
                    activeTicketContext.openMinutes = parsedOpen;
                }
                if (parsedClose !== null) {
                    activeTicketContext.closeMinutes = parsedClose;
                }
                activeTicketContext.expectedMinutes = computeClampedExpectedMinutes(activeTicketContext);
                refreshTicketCountdownDisplay();
            }
        }
    }, function(error) {
        clearTimeout(fallbackTimer);
        console.error(error);
        if (listEl) {
            listEl.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--danger);">' + t("err_fetch_db") + '</p>';
        }
    });
}

function filterDoctors() {
    var searchInput = document.getElementById("searchInput");
    var cityInput = document.getElementById("cityFilter");
    var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    var cityQuery = cityInput ? cityInput.value.trim().toLowerCase() : "";

    var filtered = allDoctors.filter(function(doc) {
        if (!hasValidClinics(doc)) return false;

        var docNameAll = ((doc.name || "") + " " + (doc.nameEn || "")).toLowerCase();
        var specAll = ((doc.specialty || "") + " " + (doc.specialtyEn || "")).toLowerCase();
        var nameMatch = docNameAll.indexOf(query) !== -1;
        var specMatch = specAll.indexOf(query) !== -1;
        var clinicNameMatch = false;
        var cityMatch = !cityQuery;

        for (var i = 0; i < doc.clinics.length; i++) {
            var c = doc.clinics[i];
            if (!c) continue;
            var clinicAll = ((c.clinicName || "") + " " + (c.clinicNameEn || "")).toLowerCase();
            var cityAll = ((c.city || "") + " " + (c.cityEn || "")).toLowerCase();
            if (clinicAll.indexOf(query) !== -1) {
                clinicNameMatch = true;
            }
            if (cityQuery && cityAll.indexOf(cityQuery) !== -1) {
                cityMatch = true;
            }
        }

        var textOk = !query || nameMatch || specMatch || clinicNameMatch;
        return textOk && cityMatch;
    });

    if (sortByNearestEnabled && patientCurrentCoords) {
        filtered = filtered.slice().sort(function(a, b) {
            var da = getNearestClinicDistanceForDoctor(a);
            var dbVal = getNearestClinicDistanceForDoctor(b);
            if (da === null && dbVal === null) return 0;
            if (da === null) return 1;
            if (dbVal === null) return -1;
            return da - dbVal;
        });
    }

    renderDoctorsList(filtered);
}

function buildMapLink(clinic) {
    if (!clinic || !clinic.lat || !clinic.lng) return "";
    var mapUrl = "https://www.google.com/maps?q=" + clinic.lat + "," + clinic.lng;
    return '<a class="btn-outline" href="' + mapUrl + '" target="_blank" rel="noopener"><i class="fa-solid fa-map"></i> ' + t("view_map") + '</a>';
}

function renderDoctorsList(doctors) {
    var listEl = document.getElementById("doctorsList");
    if (!listEl) return;

    var validDoctors = Array.isArray(doctors) ? doctors.filter(hasValidClinics) : [];

    if (validDoctors.length === 0) {
        listEl.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--text-muted);">' + t("no_results") + '</p>';
        return;
    }

    var html = "";
    validDoctors.forEach(function(doc) {
        var clinics = doc.clinics;
        var primaryClinic = clinics[0] || {};
        var isClosed = primaryClinic.isClosed === true;
        var isOnBreak = primaryClinic.isOnBreak === true;

        var displayDocName = getLocalizedDoctorName(doc) || t("default_doctor_name");
        var displaySpec = getLocalizedSpecialty(doc);
        var displayClinicName = getLocalizedClinicName(primaryClinic);
        var displayCity = getLocalizedCity(primaryClinic);
        var displayStreet = getLocalizedStreet(primaryClinic);

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
        if (displayCity || displayStreet) {
            locationText = "<p><i class=\"fa-solid fa-location-dot\"></i> " +
                displayCity + (displayStreet ? " - " + displayStreet : "") + "</p>";
        }

        var nearestDist = getNearestClinicDistanceForDoctor(doc);
        var distanceText = "";
        if (nearestDist !== null) {
            distanceText = "<p><i class=\"fa-solid fa-route\"></i> " + formatDistanceText(nearestDist) + "</p>";
        }

        var actionBtn = "";
        if (isClosed) {
            actionBtn = '<button type="button" class="btn-outline" disabled>' + t("closed_temp") + '</button>';
        } else if (clinics.length > 1) {
            actionBtn = '<button type="button" class="btn-primary" onclick="openClinicSelection(\'' + doc.id + '\')">' + t("choose_clinic_btn") + '</button>';
        } else {
            actionBtn = '<button type="button" class="btn-primary" onclick="openBookingModal(\'' + doc.id + '\', 0)">' + t("book_now") + '</button>';
        }

        var mapBtn = clinics.length <= 1 ? buildMapLink(primaryClinic) : "";

        html += '<div class="clinic-card">' +
            '<div class="clinic-header">' +
                '<h3>' + displayDocName + '</h3>' +
                statusBadge +
            '</div>' +
            '<p class="specialty">' + displaySpec + (displayClinicName ? " — " + displayClinicName : "") + '</p>' +
            '<div class="clinic-info">' + locationText + distanceText + hoursText + '</div>' +
            '<div class="clinic-actions">' + actionBtn + mapBtn + '</div>' +
        '</div>';
    });

    listEl.innerHTML = html;
}

function openClinicSelection(doctorId) {
    var doc = allDoctors.find(function(d) { return d.id === doctorId; });
    if (!doc || !hasValidClinics(doc)) return;

    var container = document.getElementById("clinicSelectionList");
    var modal = document.getElementById("clinicSelectionModal");
    if (!container || !modal) return;

    var html = "";
    doc.clinics.forEach(function(c, idx) {
        var closed = c.isClosed === true;
        var mapBtn = buildMapLink(c);
        var cName = getLocalizedClinicName(c) || (t("clinic_prefix") + (idx + 1));
        var cCity = getLocalizedCity(c);
        var cStreet = getLocalizedStreet(c);
        var dist = patientCurrentCoords ? calculateDistanceKm(patientCurrentCoords.lat, patientCurrentCoords.lng, c.lat, c.lng) : null;
        var distHtml = dist !== null ? '<p class="clinic-meta"><i class="fa-solid fa-route"></i> ' + formatDistanceText(dist) + '</p>' : '';

        html += '<div class="clinic-card" style="margin-bottom:10px;">' +
            '<div class="clinic-header"><h3>' + cName + '</h3>' +
            '<span class="badge ' + (closed ? "badge-closed" : "badge-open") + '">' + (closed ? t("closed_temp") : t("available")) + '</span></div>' +
            '<p class="specialty">' + cCity + (cStreet ? " - " + cStreet : "") + '</p>' +
            distHtml +
            '<div class="clinic-actions">' +
                '<button type="button" class="btn-primary" ' + (closed ? "disabled" : 'onclick="closeClinicSelectionModal(); openBookingModal(\'' + doc.id + '\', ' + idx + ')"') + '>' +
                (closed ? t("closed_temp") : t("book_now")) + '</button>' +
                mapBtn +
            '</div>' +
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
    if (!doc || !hasValidClinics(doc)) return;
    var clinic = doc.clinics[clinicIndex || 0];
    if (!clinic || clinic.isClosed === true) return;

    selectedDoctor = doc;
    selectedClinic = clinic;
    selectedClinicIndex = clinicIndex || 0;

    var now = new Date();
    calendarViewYear = now.getFullYear();
    calendarViewMonth = now.getMonth();
    calendarBookingsByDate = {};

    var titleEl = document.getElementById("modalDoctorName");
    var dName = getLocalizedDoctorName(doc);
    var cName = getLocalizedClinicName(clinic);
    if (titleEl) {
        titleEl.innerText = t("book_now") + " — " + dName + (cName ? " (" + cName + ")" : "");
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
    if (modal) {
        modal.classList.remove("hidden");
        modal.scrollTop = 0;
        var card = modal.querySelector(".modal-card");
        if (card) card.scrollTop = 0;
        var body = modal.querySelector(".modal-body");
        if (body) body.scrollTop = 0;
    }
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
        alert(t("err_enter_patient_name"));
        return;
    }
    if (!dateStr || !isDateAvailableForClinic(dateStr, selectedClinic)) {
        alert(t("err_select_valid_day"));
        return;
    }

    var capacity = calculateDailyCapacity(selectedClinic);
    var docRef = db.collection("doctors").doc(selectedDoctor.id);
    var newBookingRef = db.collection("bookings").doc();
    var secretCode = generate12DigitSecret();

    db.runTransaction(function(transaction) {
        return transaction.get(docRef).then(function(docSnap) {
            if (!docSnap.exists) {
                throw new Error(t("err_clinic_not_found"));
            }
            var docData = docSnap.data();
            if (docData.isDeleted === true) {
                throw new Error(t("err_clinic_not_found"));
            }
            var clinics = Array.isArray(docData.clinics) ? docData.clinics.slice() : [];
            var clinicObj = clinics[selectedClinicIndex];
            if (!clinicObj || clinicObj.isClosed === true) {
                throw new Error(t("err_clinic_closed_now"));
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
                throw new Error(t("err_daily_quota_full"));
            }
            dailyCounters[dailyKey] = nextQueueNumber;
            clinicObj.dailyCounters = dailyCounters;

            transaction.update(docRef, { clinics: clinics });

            transaction.set(newBookingRef, {
                doctorId: selectedDoctor.id,
                doctorName: docData.name || "",
                doctorNameEn: docData.nameEn || "",
                specialty: docData.specialty || "",
                specialtyEn: docData.specialtyEn || "",
                clinicIndex: selectedClinicIndex,
                clinicName: clinicObj.clinicName || "",
                clinicNameEn: clinicObj.clinicNameEn || "",
                clinicStartTime: clinicObj.startTime || "09:00",
                clinicEndTime: clinicObj.endTime || "17:00",
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
        alert(err && err.message ? err.message : t("err_booking_failed"));
    });
}

function goBackToSearch() {
    if (unsubscribeTicketBookings) {
        unsubscribeTicketBookings();
        unsubscribeTicketBookings = null;
    }
    stopTicketCountdown();
    lastTicketViewState = null;
    currentTicketBookingId = null;
    lastTicketNumber = null;
    lastAheadCount = null;
    lastTicketStatus = null;
    notified45MinForTicket = false;
    updateTicketInactiveState(false);
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
    stopTicketCountdown();
    lastTicketViewState = null;
    currentTicketBookingId = null;
    lastTicketNumber = null;
    lastAheadCount = null;
    lastTicketStatus = null;
    notified45MinForTicket = false;
    updateTicketInactiveState(false);
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
            var docDisp = (getCurrentLang() === "en" && b.doctorNameEn) ? b.doctorNameEn : (b.doctorName || "");
            var clinDisp = (getCurrentLang() === "en" && b.clinicNameEn) ? b.clinicNameEn : (b.clinicName || "");
            html += '<div class="clinic-card">' +
                '<div class="clinic-header"><h3>' + (b.patientName || "") + '</h3><span class="badge badge-open">' + statusLabel + '</span></div>' +
                '<p class="specialty">' + docDisp + (clinDisp ? " — " + clinDisp : "") + '</p>' +
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
    lastTicketStatus = null;
    notified45MinForTicket = false;
    lastTicketViewState = null;
    updateTicketInactiveState(false);
    stopTicketCountdown();
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

            snapshot.forEach(function(doc) {
                var item = doc.data();
                item.id = doc.id;
                if (doc.id === ticketData.id) {
                    currentTicket = item;
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

            var isSameDay = currentTicket.date === getTodayStr();
            var isTicketActive = currentTicket.status !== "cancelled" && currentTicket.status !== "done";
            var isWaitingTurn = isTicketActive && currentTicket.status !== "serving";

            if (isSameDay && isTicketActive) {
                if (currentTicket.status === "serving" && lastTicketStatus !== "serving") {
                    showTicketAlert(t("alert_your_turn"), "turn");
                } else if (aheadCount === 3 && lastAheadCount !== 3) {
                    showTicketAlert(t("alert_3_ahead"), "turn");
                }
            } else {
                hideTicketAlert();
            }

            lastTicketNumber = myNum;
            lastAheadCount = aheadCount;
            lastTicketStatus = currentTicket.status;

            var serviceMins = parseInt(currentTicket.serviceTime, 10) || 10;
            var totalWaitMins = aheadCount * serviceMins;

            var linkedClinic = findClinicForTicket(currentTicket);
            var linkedDoc = allDoctors.find(function(d) { return d.id === currentTicket.doctorId; });
            var docNameLocalized = (getCurrentLang() === "en" && ((linkedDoc && linkedDoc.nameEn) || currentTicket.doctorNameEn))
                ? ((linkedDoc && linkedDoc.nameEn) || currentTicket.doctorNameEn)
                : (currentTicket.doctorName || (linkedDoc && linkedDoc.name) || "");
            var clinicNameLocalized = (getCurrentLang() === "en" && ((linkedClinic && linkedClinic.clinicNameEn) || currentTicket.clinicNameEn))
                ? ((linkedClinic && linkedClinic.clinicNameEn) || currentTicket.clinicNameEn)
                : (currentTicket.clinicName || (linkedClinic && linkedClinic.clinicName) || "");

            lastTicketViewState = {
                bookingId: currentTicket.id,
                patientName: currentTicket.patientName || "---",
                ticketNumber: myNum || "-",
                doctorName: docNameLocalized,
                clinicName: clinicNameLocalized,
                date: currentTicket.date || "",
                status: currentTicket.status || "waiting",
                isSameDay: isSameDay,
                aheadCount: aheadCount,
                totalWaitMins: totalWaitMins,
                patientSecret: currentTicket.patientSecret || ""
            };

            renderTicketDetailsFromState(lastTicketViewState);

            var startTimeStr = (linkedClinic && linkedClinic.startTime) || currentTicket.clinicStartTime || "09:00";
            var endTimeStr = (linkedClinic && linkedClinic.endTime) || currentTicket.clinicEndTime || null;
            var openMins = parseMinutesFromHHMM(startTimeStr);
            if (openMins === null) openMins = 540;
            var closeMins = endTimeStr ? parseMinutesFromHHMM(endTimeStr) : null;

            var ctx = {
                doctorId: currentTicket.doctorId,
                clinicIndex: currentTicket.clinicIndex,
                dateStr: currentTicket.date,
                openMinutes: openMins,
                closeMinutes: closeMins,
                totalWaitMins: totalWaitMins,
                expectedMinutes: openMins + totalWaitMins,
                serviceTime: serviceMins,
                aheadCount: aheadCount,
                isActive: isTicketActive,
                isWaitingTurn: isWaitingTurn
            };
            ctx.expectedMinutes = computeClampedExpectedMinutes(ctx);

            startTicketCountdownLoop(ctx);
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
    if (!confirm(t("confirm_cancel_booking"))) return;

    var bookingRef = db.collection("bookings").doc(currentTicketBookingId);

    bookingRef.get().then(function(docSnap) {
        if (!docSnap.exists) return;
        return bookingRef.update({ status: "cancelled" }).then(function() {
            removeBookingIdLocally(currentTicketBookingId);
        });
    }).then(function() {
        alert(t("booking_cancelled"));
        showMyBookingsView();
    }).catch(function(err) {
        console.error(err);
        alert(t("err_cancel_booking"));
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

function setClinicMapLocation(lat, lng, zoomLevel) {
    var latNum = parseFloat(lat);
    var lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return;

    var latFixed = latNum.toFixed(6);
    var lngFixed = lngNum.toFixed(6);
    var latInp = document.getElementById("docLat");
    var lngInp = document.getElementById("docLng");
    if (latInp) latInp.value = latFixed;
    if (lngInp) lngInp.value = lngFixed;

    initRegMapIfNeeded();
    if (regMap) {
        regMap.setView([latNum, lngNum], zoomLevel || 15);
        if (regMarker) {
            regMarker.setLatLng([latNum, lngNum]);
        } else {
            regMarker = L.marker([latNum, lngNum]).addTo(regMap);
        }
        setTimeout(function() {
            if (regMap) regMap.invalidateSize();
        }, 150);
    }
}

function useCurrentLocationForClinic() {
    if (!navigator.geolocation) {
        alert(t("err_geo_unsupported"));
        return;
    }
    navigator.geolocation.getCurrentPosition(function(pos) {
        setClinicMapLocation(pos.coords.latitude, pos.coords.longitude, 16);
    }, function() {
        alert(t("err_geo_failed"));
    }, {
        enableHighAccuracy: true,
        timeout: 10000
    });
}

function attachMapLocationControl(mapInstance) {
    if (!mapInstance || regLocationControlAdded || typeof L === "undefined") return;
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
                useCurrentLocationForClinic();
            });
            return btn;
        }
    });
    mapInstance.addControl(new LocationControl());
    regLocationControlAdded = true;
}

function initRegMapIfNeeded() {
    var mapEl = document.getElementById("reg-map");
    if (!mapEl || typeof L === "undefined") return;
    if (!regMap) {
        regMap = L.map("reg-map").setView([15.3694, 44.1910], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap"
        }).addTo(regMap);
        attachMapLocationControl(regMap);
        regMap.on("click", function(e) {
            setClinicMapLocation(e.latlng.lat, e.latlng.lng, regMap.getZoom());
        });
    }
    setTimeout(function() {
        if (regMap) regMap.invalidateSize();
    }, 200);
}

function addAnotherClinicField() {
    alert(t("info_add_clinic_from_admin"));
}

function loginDoctor() {
    var emailEl = document.getElementById("loginEmail");
    var passEl = document.getElementById("loginPassword");
    var email = emailEl ? emailEl.value.trim() : "";
    var password = passEl ? passEl.value : "";

    if (!email || !password) {
        alert(t("err_enter_email_pass"));
        return;
    }

    auth.signInWithEmailAndPassword(email, password).then(function(cred) {
        var uid = cred && cred.user ? cred.user.uid : null;
        if (!uid) {
            return auth.signOut().then(function() {
                alert(t("err_account_not_found"));
            });
        }

        return db.collection("doctors").doc(uid).get().then(function(docSnap) {
            var docData = docSnap.exists ? docSnap.data() : null;
            if (!docSnap.exists || !docData || docData.isDeleted === true) {
                var reactivate = confirm(t("confirm_reactivate_account"));
                if (reactivate) {
                    return db.collection("doctors").doc(uid).set({
                        ownerUid: uid,
                        email: email,
                        name: email.split("@")[0],
                        specialty: "",
                        phone: "",
                        clinics: [],
                        isDeleted: false,
                        reactivatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }).then(function() {
                        window.location.href = "admin.html";
                    });
                }
                return auth.signOut().then(function() {
                    alert(t("err_account_not_found"));
                });
            }
            window.location.href = "admin.html";
        });
    }).catch(function(err) {
        alert(err && err.message ? err.message : t("err_login_failed"));
    });
}

function collectRegistrationFormData() {
    var activationCode = ((document.getElementById("regActivationCode") || {}).value || "").trim();
    var email = ((document.getElementById("regEmail") || {}).value || "").trim();
    var password = ((document.getElementById("regPassword") || {}).value || "");
    var docName = ((document.getElementById("docName") || {}).value || "").trim();
    var docNameEn = ((document.getElementById("docNameEn") || {}).value || "").trim();
    var specialty = ((document.getElementById("docSpecialty") || {}).value || "").trim();
    var specialtyEn = ((document.getElementById("docSpecialtyEn") || {}).value || "").trim();
    var phone = ((document.getElementById("docPhone") || {}).value || "").trim();
    var clinicName = ((document.getElementById("docClinicName") || {}).value || "").trim();
    var clinicNameEn = ((document.getElementById("docClinicNameEn") || {}).value || "").trim();
    var city = ((document.getElementById("docCity") || {}).value || "").trim();
    var cityEn = ((document.getElementById("docCityEn") || {}).value || "").trim();
    var street = ((document.getElementById("docStreet") || {}).value || "").trim();
    var streetEn = ((document.getElementById("docStreetEn") || {}).value || "").trim();
    var landmark = ((document.getElementById("docLandmark") || {}).value || "").trim();
    var startTime = ((document.getElementById("docStartTime") || {}).value || "09:00");
    var endTime = ((document.getElementById("docEndTime") || {}).value || "17:00");
    var serviceTime = parseInt(((document.getElementById("docServiceTime") || {}).value || "10"), 10) || 10;
    var latRaw = parseFloat(((document.getElementById("docLat") || {}).value || ""));
    var lngRaw = parseFloat(((document.getElementById("docLng") || {}).value || ""));

    var workingDays = [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("day_" + d);
        if (cb && cb.checked) workingDays.push(d);
    }

    return {
        activationCode: activationCode,
        email: email,
        password: password,
        docName: docName,
        docNameEn: docNameEn,
        specialty: specialty,
        specialtyEn: specialtyEn,
        phone: phone,
        clinic: {
            clinicName: clinicName,
            clinicNameEn: clinicNameEn,
            city: city,
            cityEn: cityEn,
            street: street,
            streetEn: streetEn,
            landmark: landmark,
            startTime: startTime,
            endTime: endTime,
            serviceTime: serviceTime,
            workingDays: workingDays,
            lat: isNaN(latRaw) ? null : latRaw,
            lng: isNaN(lngRaw) ? null : lngRaw,
            serialNumber: 0,
            dailyCounters: {},
            isClosed: false,
            isOnBreak: false
        }
    };
}

function writeDoctorRecordForUid(uid, formData, isReactivation) {
    var payload = {
        ownerUid: uid,
        email: formData.email,
        name: formData.docName,
        nameEn: formData.docNameEn || "",
        specialty: formData.specialty,
        specialtyEn: formData.specialtyEn || "",
        phone: formData.phone,
        clinics: [formData.clinic],
        isDeleted: false
    };
    if (isReactivation) {
        payload.reactivatedAt = firebase.firestore.FieldValue.serverTimestamp();
    } else {
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    }
    return db.collection("doctors").doc(uid).set(payload, { merge: true });
}

function registerAndSaveDoctor() {
    var formData = collectRegistrationFormData();

    if (!formData.email || !formData.password || !formData.docName || !formData.clinic.clinicName) {
        alert(t("err_reg_required_fields"));
        return;
    }

    if (!formData.activationCode) {
        alert(t("err_enter_activation_code"));
        return;
    }

    if (!isValidDoctorActivationCode(formData.activationCode)) {
        alert(t("err_invalid_activation_code"));
        return;
    }

    auth.createUserWithEmailAndPassword(formData.email, formData.password).then(function(cred) {
        var uid = cred.user.uid;
        return writeDoctorRecordForUid(uid, formData, false);
    }).then(function() {
        window.location.href = "admin.html";
    }).catch(function(err) {
        var errCode = err && err.code ? err.code : "";
        if (errCode === "auth/email-already-in-use") {
            return auth.signInWithEmailAndPassword(formData.email, formData.password).then(function(signInCred) {
                var uid = signInCred.user.uid;
                return db.collection("doctors").doc(uid).get().then(function(docSnap) {
                    var existing = docSnap.exists ? docSnap.data() : null;
                    var hasClinics = existing && existing.isDeleted !== true && Array.isArray(existing.clinics) && existing.clinics.length > 0;
                    if (hasClinics) {
                        throw new Error(t("err_email_active_doctor"));
                    }
                    return writeDoctorRecordForUid(uid, formData, true).then(function() {
                        window.location.href = "admin.html";
                    });
                });
            }).catch(function(reErr) {
                if (reErr && reErr.code === "auth/wrong-password") {
                    alert(t("err_wrong_password_existing"));
                } else {
                    alert(reErr && reErr.message ? reErr.message : t("err_reactivate_failed"));
                }
            });
        }
        alert(err && err.message ? err.message : t("err_create_account_failed"));
    });
}

window.onload = function() {
    applySavedTheme();
    if (typeof applyLanguage === "function") {
        applyLanguage();
    }
    updateNearestButtonLabel();
    loadDoctors();
};
