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

var allDoctors = [];
var selectedDoctor = null;
var selectedClinic = null;
var selectedClinicIndex = 0;

var userLat = null;
var userLng = null;
var isNearestActive = false;

var currentTicketBookingId = null;
var unsubscribeTicketBooking = null;
var unsubscribeTicketQueue = null;
var unsubscribeTicketDoctor = null;
var ticketCountdownInterval = null;

var lastAlertedKey = null;
var ticketAlertSoundCtx = null;
var ticketFlashTimeout = null;

var bookingCalYear = null;
var bookingCalMonth = null;
var selectedBookingDate = null;
var bookingDayCounts = {};

var regMap = null;
var regMarker = null;
var regLocationControlAdded = false;
var extraClinicCounter = 0;

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

function getClinicWorkingHoursText(clinic) {
    if (!clinic) return "--:-- - --:--";
    var start = clinic.startTime || "09:00";
    var end = clinic.endTime || "17:00";
    return start + " - " + end;
}

function getClinicLocationText(clinic) {
    if (!clinic) return "";
    var isEn = getCurrentLang() === "en";
    var parts = [];
    var city = isEn && clinic.cityEn ? clinic.cityEn : clinic.city;
    var street = isEn && clinic.streetEn ? clinic.streetEn : clinic.street;
    var landmark = clinic.landmark;
    if (city && String(city).trim()) parts.push(String(city).trim());
    if (street && String(street).trim()) parts.push(String(street).trim());
    if (landmark && String(landmark).trim()) parts.push(String(landmark).trim());
    return parts.join(" - ");
}

function getClinicMapUrl(clinic) {
    if (!clinic) return null;
    var lat = parseFloat(clinic.lat);
    var lng = parseFloat(clinic.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
        return "https://www.google.com/maps?q=" + lat + "," + lng;
    }
    var loc = getClinicLocationText(clinic);
    if (loc) {
        return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(loc);
    }
    return null;
}

function getDoctorDisplayName(doc) {
    if (!doc) return t("default_doctor_name");
    if (getCurrentLang() === "en" && doc.nameEn && String(doc.nameEn).trim()) {
        return String(doc.nameEn).trim();
    }
    return doc.name || t("default_doctor_name");
}

function getDoctorSpecialty(doc) {
    if (!doc) return "";
    if (getCurrentLang() === "en" && doc.specialtyEn && String(doc.specialtyEn).trim()) {
        return String(doc.specialtyEn).trim();
    }
    return doc.specialty || "";
}

function getClinicDisplayName(clinic, idx) {
    if (!clinic) return t("clinic_prefix") + ((idx || 0) + 1);
    if (getCurrentLang() === "en" && clinic.clinicNameEn && String(clinic.clinicNameEn).trim()) {
        return String(clinic.clinicNameEn).trim();
    }
    return clinic.clinicName || (t("clinic_prefix") + ((idx || 0) + 1));
}

function getClinicStatusInfo(clinic) {
    if (!clinic || clinic.isClosed === true) {
        return { text: t("closed_temp"), badgeClass: "badge-closed", canBook: false };
    }
    if (clinic.isOnBreak === true) {
        return { text: t("on_break"), badgeClass: "badge-break", canBook: false };
    }
    return { text: t("available"), badgeClass: "badge-open", canBook: true };
}

function getDoctorOverallStatus(doc) {
    var clinics = (doc && Array.isArray(doc.clinics)) ? doc.clinics : [];
    if (clinics.length === 0) {
        return { text: t("closed_temp"), badgeClass: "badge-closed", canBook: false };
    }
    var hasAvailable = false;
    var hasBreak = false;
    for (var i = 0; i < clinics.length; i++) {
        var st = getClinicStatusInfo(clinics[i]);
        if (st.canBook) {
            hasAvailable = true;
            break;
        }
        if (clinics[i] && clinics[i].isOnBreak === true && clinics[i].isClosed !== true) {
            hasBreak = true;
        }
    }
    if (hasAvailable) {
        return { text: t("available"), badgeClass: "badge-open", canBook: true };
    }
    if (hasBreak) {
        return { text: t("on_break"), badgeClass: "badge-break", canBook: false };
    }
    return { text: t("closed_temp"), badgeClass: "badge-closed", canBook: false };
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getMinDistanceForDoctor(doc) {
    if (userLat === null || userLng === null || !doc || !Array.isArray(doc.clinics)) return null;
    var minDist = null;
    for (var i = 0; i < doc.clinics.length; i++) {
        var c = doc.clinics[i];
        var lat = parseFloat(c.lat);
        var lng = parseFloat(c.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
            var d = calculateDistanceKm(userLat, userLng, lat, lng);
            if (minDist === null || d < minDist) {
                minDist = d;
            }
        }
    }
    return minDist;
}

function formatDistanceLabel(km) {
    if (km === null || km === undefined || isNaN(km)) return "";
    if (km < 1) {
        return t("distance_m").replace("{m}", Math.round(km * 1000));
    }
    return t("distance_km").replace("{km}", km.toFixed(1));
}

function updateNearestButtonLabel() {
    var textEl = document.getElementById("nearestSortBtnText");
    var btn = document.getElementById("nearestSortBtn");
    var text = isNearestActive ? t("nearest_active_btn") : t("nearest_btn");
    if (textEl) {
        textEl.innerText = text;
    } else if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-location-dot"></i> ' + text;
    }
}

function toggleNearestSort() {
    if (isNearestActive) {
        isNearestActive = false;
        updateNearestButtonLabel();
        filterDoctors();
        return;
    }

    if (!navigator.geolocation) {
        alert(t("err_geo_unsupported"));
        return;
    }

    navigator.geolocation.getCurrentPosition(function(pos) {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        isNearestActive = true;
        updateNearestButtonLabel();
        filterDoctors();
    }, function() {
        alert(t("err_geo_failed"));
    }, { enableHighAccuracy: true, timeout: 10000 });
}

function getDoctorsGridElement() {
    return document.getElementById("doctorsList") || document.getElementById("doctorsGrid");
}

function renderSkeletons() {
    var grid = getDoctorsGridElement();
    if (!grid) return;
    var html = "";
    for (var i = 0; i < 3; i++) {
        html += '<div class="clinic-card skeleton-card"></div>';
    }
    grid.innerHTML = html;
}

function showDoctorsLoadError() {
    var grid = getDoctorsGridElement();
    if (grid) {
        grid.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + t("err_load_clinics") + '</p>';
    }
}

function loadDoctors() {
    renderSkeletons();
    try {
        db.collection("doctors").get().then(function(snapshot) {
            try {
                var list = [];
                snapshot.forEach(function(doc) {
                    var data = doc.data();
                    if (!data || data.isDeleted === true) return;
                    data.id = doc.id;
                    list.push(data);
                });
                allDoctors = list;
                populateCityDatalist();
                filterDoctors();
            } catch (renderErr) {
                console.error(renderErr);
                showDoctorsLoadError();
            }
        }).catch(function(err) {
            console.error(err);
            showDoctorsLoadError();
        });
    } catch (syncErr) {
        console.error(syncErr);
        showDoctorsLoadError();
    }
}

function populateCityDatalist() {
    var dl = document.getElementById("citiesList");
    if (!dl) return;
    var citiesSet = {};
    allDoctors.forEach(function(doc) {
        if (!Array.isArray(doc.clinics)) return;
        doc.clinics.forEach(function(c) {
            if (!c) return;
            if (c.city && String(c.city).trim()) {
                citiesSet[String(c.city).trim()] = true;
            }
            if (c.cityEn && String(c.cityEn).trim()) {
                citiesSet[String(c.cityEn).trim()] = true;
            }
        });
    });
    var html = "";
    Object.keys(citiesSet).sort().forEach(function(city) {
        html += '<option value="' + city + '"></option>';
    });
    dl.innerHTML = html;
}

function filterDoctors() {
    var searchInput = document.getElementById("searchInput");
    var cityInput = document.getElementById("cityFilter") || document.getElementById("cityInput");
    var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    var cityQuery = cityInput ? cityInput.value.trim().toLowerCase() : "";

    var filtered = allDoctors.filter(function(doc) {
        var nameAr = (doc.name || "").toLowerCase();
        var nameEn = (doc.nameEn || "").toLowerCase();
        var specAr = (doc.specialty || "").toLowerCase();
        var specEn = (doc.specialtyEn || "").toLowerCase();

        var matchesText = !query ||
            nameAr.indexOf(query) !== -1 ||
            nameEn.indexOf(query) !== -1 ||
            specAr.indexOf(query) !== -1 ||
            specEn.indexOf(query) !== -1;

        var matchesCity = true;
        if (cityQuery) {
            matchesCity = false;
            if (Array.isArray(doc.clinics)) {
                for (var i = 0; i < doc.clinics.length; i++) {
                    var c = doc.clinics[i];
                    if (!c) continue;
                    var cAr = (c.city || "").toLowerCase();
                    var cEn = (c.cityEn || "").toLowerCase();
                    if (cAr.indexOf(cityQuery) !== -1 || cEn.indexOf(cityQuery) !== -1) {
                        matchesCity = true;
                        break;
                    }
                }
            }
        }

        return matchesText && matchesCity;
    });

    if (isNearestActive && userLat !== null && userLng !== null) {
        filtered.sort(function(a, b) {
            var da = getMinDistanceForDoctor(a);
            var dbVal = getMinDistanceForDoctor(b);
            if (da === null && dbVal === null) return 0;
            if (da === null) return 1;
            if (dbVal === null) return -1;
            return da - dbVal;
        });
    }

    renderDoctorsGrid(filtered);
}

function renderDoctorsGrid(doctorsList) {
    var grid = getDoctorsGridElement();
    if (!grid) return;

    if (!Array.isArray(doctorsList) || doctorsList.length === 0) {
        grid.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + t("no_results") + '</p>';
        return;
    }

    var html = "";
    doctorsList.forEach(function(doc) {
        var docName = getDoctorDisplayName(doc);
        var spec = getDoctorSpecialty(doc);
        var statusInfo = getDoctorOverallStatus(doc);

        var distBadge = "";
        if (isNearestActive) {
            var dKm = getMinDistanceForDoctor(doc);
            var dText = formatDistanceLabel(dKm);
            if (dText) {
                distBadge = '<span class="badge badge-break">' + dText + '</span>';
            }
        }

        html += '<div class="clinic-card">' +
            '<div>' +
                '<div class="clinic-header">' +
                    '<h3>' + docName + '</h3>' +
                    '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">' +
                        distBadge +
                        '<span class="badge ' + statusInfo.badgeClass + '">' + statusInfo.text + '</span>' +
                    '</div>' +
                '</div>' +
                (spec ? ('<p class="specialty">' + spec + '</p>') : '') +
            '</div>' +
            '<div class="clinic-actions">' +
                '<button type="button" class="btn-primary" onclick="openClinicSelectionModal(\'' + doc.id + '\')">' + t("choose_clinic_btn") + '</button>' +
            '</div>' +
        '</div>';
    });

    grid.innerHTML = html;
}

function openClinicSelectionModal(doctorId) {
    var doc = allDoctors.find(function(d) { return d.id === doctorId; });
    if (!doc) return;

    selectedDoctor = doc;
    var clinics = Array.isArray(doc.clinics) ? doc.clinics : [];

    var modal = document.getElementById("clinicSelectionModal") || document.getElementById("chooseClinicModal");
    var listEl = document.getElementById("clinicSelectionList") || document.getElementById("clinicChoicesList");
    var titleEl = document.getElementById("chooseClinicModalTitle");
    if (!modal || !listEl) return;

    if (titleEl) {
        titleEl.innerText = t("choose_clinic_title") + " - " + getDoctorDisplayName(doc);
    }

    if (clinics.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + t("no_results") + '</p>';
        modal.classList.remove("hidden");
        return;
    }

    var html = "";
    clinics.forEach(function(clinic, idx) {
        var cName = getClinicDisplayName(clinic, idx);
        var hoursText = getClinicWorkingHoursText(clinic);
        var locText = getClinicLocationText(clinic);
        var statusInfo = getClinicStatusInfo(clinic);
        var mapUrl = getClinicMapUrl(clinic);

        html += '<div class="clinic-card" style="margin-bottom:10px;">' +
            '<div>' +
                '<div class="clinic-header">' +
                    '<h3>' + cName + '</h3>' +
                    '<span class="badge ' + statusInfo.badgeClass + '">' + statusInfo.text + '</span>' +
                '</div>' +
                '<div class="clinic-info">' +
                    '<p><i class="fa-regular fa-clock"></i> ' + t("hours_label") + ' ' + hoursText + '</p>' +
                    (locText ? ('<p><i class="fa-solid fa-location-dot"></i> ' + locText + '</p>') : '') +
                '</div>' +
            '</div>' +
            '<div class="clinic-actions">' +
                '<button type="button" class="btn-primary" ' + (!statusInfo.canBook ? "disabled" : "") + ' onclick="selectClinicAndOpenBooking(' + idx + ')">' + t("book_now") + '</button>' +
                (mapUrl ? ('<a class="btn-outline" href="' + mapUrl + '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-map-location-dot"></i> ' + t("view_map") + '</a>') : '') +
            '</div>' +
        '</div>';
    });

    listEl.innerHTML = html;
    modal.classList.remove("hidden");
}

function closeClinicSelectionModal() {
    var modal = document.getElementById("clinicSelectionModal") || document.getElementById("chooseClinicModal");
    if (modal) modal.classList.add("hidden");
}

function openChooseClinicModal(doctorId) {
    openClinicSelectionModal(doctorId);
}

function closeChooseClinicModal() {
    closeClinicSelectionModal();
}

function selectClinicAndOpenBooking(clinicIdx) {
    if (!selectedDoctor || !Array.isArray(selectedDoctor.clinics)) return;
    var clinic = selectedDoctor.clinics[clinicIdx];
    if (!clinic) return;
    var statusInfo = getClinicStatusInfo(clinic);
    if (!statusInfo.canBook) {
        alert(statusInfo.text);
        return;
    }
    closeClinicSelectionModal();
    openBookingModalForClinic(selectedDoctor, clinic, clinicIdx);
}

function openBookingModalForClinic(doc, clinic, clinicIdx) {
    selectedDoctor = doc;
    selectedClinic = clinic;
    selectedClinicIndex = clinicIdx;
    selectedBookingDate = null;
    bookingDayCounts = {};

    var now = new Date();
    bookingCalYear = now.getFullYear();
    bookingCalMonth = now.getMonth();

    var pName = document.getElementById("bookingName") || document.getElementById("patientName");
    var pPhone = document.getElementById("bookingPhone") || document.getElementById("patientPhone");
    var dateHidden = document.getElementById("bookingDate");
    if (pName) pName.value = "";
    if (pPhone) pPhone.value = "";
    if (dateHidden) dateHidden.value = "";

    var titleEl = document.getElementById("modalDoctorName");
    if (titleEl) {
        var locText = getClinicLocationText(clinic);
        titleEl.innerText = getDoctorDisplayName(doc) + " — " + getClinicDisplayName(clinic, clinicIdx) + (locText ? (" (" + locText + ")") : "");
    }

    var subtitleEl = document.getElementById("bookingClinicSubtitle");
    if (subtitleEl) {
        var locText2 = getClinicLocationText(clinic);
        subtitleEl.innerText = getDoctorDisplayName(doc) + " — " + getClinicDisplayName(clinic, clinicIdx) + (locText2 ? (" (" + locText2 + ")") : "");
    }

    var modal = document.getElementById("bookingModal");
    if (modal) modal.classList.remove("hidden");

    renderCustomBookingCalendar();
    fetchBookingDayCountsForMonth(bookingCalYear, bookingCalMonth);
}

function closeModal() {
    var modal = document.getElementById("bookingModal");
    if (modal) modal.classList.add("hidden");
}

function closeBookingModal() {
    closeModal();
}

function shiftBookingCalendarMonth(delta) {
    bookingCalMonth += delta;
    if (bookingCalMonth < 0) {
        bookingCalMonth = 11;
        bookingCalYear -= 1;
    } else if (bookingCalMonth > 11) {
        bookingCalMonth = 0;
        bookingCalYear += 1;
    }
    renderCustomBookingCalendar();
    fetchBookingDayCountsForMonth(bookingCalYear, bookingCalMonth);
}

function formatYMD(year, monthZeroBased, day) {
    return year + "-" + String(monthZeroBased + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

function getDailyCapacityForClinic(clinic) {
    if (!clinic) return 30;
    var startMin = parseMinutesFromHHMM(clinic.startTime || "09:00");
    var endMin = parseMinutesFromHHMM(clinic.endTime || "17:00");
    var serviceTime = parseInt(clinic.serviceTime, 10);
    if (isNaN(serviceTime) || serviceTime <= 0) serviceTime = 10;
    if (startMin !== null && endMin !== null && endMin > startMin) {
        return Math.max(1, Math.floor((endMin - startMin) / serviceTime));
    }
    return 30;
}

function isDayAvailableForClinic(clinic, dateStr, dayOfWeek) {
    if (!clinic || !dateStr) return false;
    var todayStr = getTodayStr();
    if (dateStr < todayStr) return false;
    if (Array.isArray(clinic.workingDays) && clinic.workingDays.length > 0) {
        return clinic.workingDays.indexOf(dayOfWeek) !== -1;
    }
    return true;
}

function fetchBookingDayCountsForMonth(year, monthZeroBased) {
    if (!selectedDoctor || !selectedClinic) return;
    var prefix = year + "-" + String(monthZeroBased + 1).padStart(2, "0") + "-";
    var startDate = prefix + "01";
    var endDate = prefix + "31";

    db.collection("bookings")
        .where("doctorId", "==", selectedDoctor.id)
        .where("clinicIndex", "==", selectedClinicIndex)
        .where("date", ">=", startDate)
        .where("date", "<=", endDate)
        .get()
        .then(function(snap) {
            var counts = {};
            snap.forEach(function(doc) {
                var d = doc.data();
                if (d && d.status !== "cancelled" && d.date) {
                    counts[d.date] = (counts[d.date] || 0) + 1;
                }
            });
            bookingDayCounts = counts;
            renderCustomBookingCalendar();
        })
        .catch(function(err) {
            console.error(err);
            renderCustomBookingCalendar();
        });
}

function renderCustomBookingCalendar() {
    var container = document.getElementById("customBookingCalendar") || document.getElementById("bookingCalendarContainer");
    var hintEl = document.getElementById("calendarHint");
    if (!container || !selectedClinic) return;

    var monthNamesAr = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    var monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var monthLabel = (getCurrentLang() === "en" ? monthNamesEn[bookingCalMonth] : monthNamesAr[bookingCalMonth]) + " " + bookingCalYear;

    var weekdayKeys = ["day_0", "day_1", "day_2", "day_3", "day_4", "day_5", "day_6"];
    var weekdaysHtml = '<div class="cal-weekdays">';
    weekdayKeys.forEach(function(k) {
        weekdaysHtml += '<div class="cal-weekday">' + t(k) + '</div>';
    });
    weekdaysHtml += '</div>';

    var firstDayOfWeek = new Date(bookingCalYear, bookingCalMonth, 1).getDay();
    var daysInMonth = new Date(bookingCalYear, bookingCalMonth + 1, 0).getDate();
    var capacity = getDailyCapacityForClinic(selectedClinic);

    var daysHtml = '<div class="cal-days-grid">';
    for (var b = 0; b < firstDayOfWeek; b++) {
        daysHtml += '<div></div>';
    }

    for (var day = 1; day <= daysInMonth; day++) {
        var ymd = formatYMD(bookingCalYear, bookingCalMonth, day);
        var dow = new Date(bookingCalYear, bookingCalMonth, day).getDay();
        var dayAllowed = isDayAvailableForClinic(selectedClinic, ymd, dow);
        var bookedCount = bookingDayCounts[ymd] || 0;
        var isFull = bookedCount >= capacity;
        var isSelectable = dayAllowed && !isFull;
        var isSelected = selectedBookingDate === ymd && isSelectable;

        var titleText = !dayAllowed
            ? t("cal_day_unavailable")
            : (isFull ? t("cal_day_full") : t("cal_day_available") + " (" + bookedCount + "/" + capacity + ")");

        var cls = "cal-day-btn";
        if (isSelected) cls += " selected";
        if (!isSelectable) cls += " disabled-day";

        daysHtml += '<button type="button" class="' + cls + '" title="' + titleText + '" ' +
            (!isSelectable ? "disabled" : "") +
            ' onclick="selectBookingCalendarDay(\'' + ymd + '\')">' +
            day +
            '</button>';
    }
    daysHtml += '</div>';

    var hintText = t("cal_capacity_hint").replace("{n}", String(capacity));
    if (hintEl) {
        hintEl.innerText = hintText;
    }

    container.innerHTML =
        '<div class="cal-header">' +
            '<button type="button" class="btn-outline" onclick="shiftBookingCalendarMonth(-1)"><i class="fa-solid fa-chevron-right"></i></button>' +
            '<span>' + monthLabel + '</span>' +
            '<button type="button" class="btn-outline" onclick="shiftBookingCalendarMonth(1)"><i class="fa-solid fa-chevron-left"></i></button>' +
        '</div>' +
        weekdaysHtml +
        daysHtml +
        (!hintEl ? ('<div style="font-size:11.5px; color:var(--text-muted); margin-top:8px;">' + hintText + '</div>') : '');
}

function selectBookingCalendarDay(ymd) {
    selectedBookingDate = ymd;
    var dateHidden = document.getElementById("bookingDate");
    if (dateHidden) dateHidden.value = ymd;
    renderCustomBookingCalendar();
}

function generateSecretCode12() {
    var code = "";
    for (var i = 0; i < 12; i++) {
        code += Math.floor(Math.random() * 10);
    }
    return code;
}

function requestNotificationPermissionIfNeeded() {
    try {
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission().catch(function() {});
        }
    } catch (e) {}
}

function confirmBooking() {
    var nameInput = document.getElementById("bookingName") || document.getElementById("patientName");
    var phoneInput = document.getElementById("bookingPhone") || document.getElementById("patientPhone");
    var dateInput = document.getElementById("bookingDate");
    var chosenDate = selectedBookingDate || (dateInput ? dateInput.value : "");

    var patientName = nameInput ? nameInput.value.trim() : "";
    var patientPhone = phoneInput ? phoneInput.value.trim() : "";

    if (!patientName) {
        alert(t("err_enter_patient_name"));
        return;
    }

    if (!chosenDate) {
        alert(t("err_select_valid_day"));
        return;
    }

    if (!selectedDoctor || !selectedClinic) {
        alert(t("err_clinic_not_found"));
        return;
    }

    var statusInfo = getClinicStatusInfo(selectedClinic);
    if (!statusInfo.canBook) {
        alert(t("err_clinic_closed_now"));
        return;
    }

    requestNotificationPermissionIfNeeded();

    var capacity = getDailyCapacityForClinic(selectedClinic);
    var doctorRef = db.collection("doctors").doc(selectedDoctor.id);
    var newBookingRef = db.collection("bookings").doc();

    db.runTransaction(function(transaction) {
        return transaction.get(doctorRef).then(function(docSnap) {
            if (!docSnap.exists) {
                throw new Error("CLINIC_NOT_FOUND");
            }
            var docData = docSnap.data() || {};
            var clinics = Array.isArray(docData.clinics) ? docData.clinics.slice() : [];
            var targetClinic = clinics[selectedClinicIndex];
            if (!targetClinic) {
                throw new Error("CLINIC_NOT_FOUND");
            }
            if (targetClinic.isClosed === true) {
                throw new Error("CLINIC_CLOSED");
            }

            var dailyCounters = Object.assign({}, targetClinic.dailyCounters || {});
            var currentCount = parseInt(dailyCounters[chosenDate] || 0, 10) || 0;
            if (currentCount >= capacity) {
                throw new Error("QUOTA_FULL");
            }

            var nextTicket = currentCount + 1;
            var nextSerial = (parseInt(targetClinic.serialNumber || 0, 10) || 0) + 1;

            dailyCounters[chosenDate] = nextTicket;
            clinics[selectedClinicIndex] = Object.assign({}, targetClinic, {
                dailyCounters: dailyCounters,
                serialNumber: nextSerial
            });

            var secretCode = generateSecretCode12();
            var bookingPayload = {
                doctorId: selectedDoctor.id,
                doctorName: selectedDoctor.name || "",
                doctorNameEn: selectedDoctor.nameEn || "",
                specialty: selectedDoctor.specialty || "",
                specialtyEn: selectedDoctor.specialtyEn || "",
                clinicIndex: selectedClinicIndex,
                clinicName: targetClinic.clinicName || "",
                clinicNameEn: targetClinic.clinicNameEn || "",
                city: targetClinic.city || "",
                street: targetClinic.street || "",
                landmark: targetClinic.landmark || "",
                startTime: targetClinic.startTime || "09:00",
                endTime: targetClinic.endTime || "17:00",
                serviceTime: parseInt(targetClinic.serviceTime, 10) || 10,
                date: chosenDate,
                patientName: patientName,
                patientPhone: patientPhone,
                ticketNumber: nextTicket,
                serialNumber: nextSerial,
                secretCode: secretCode,
                status: "waiting",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            transaction.update(doctorRef, { clinics: clinics });
            transaction.set(newBookingRef, bookingPayload);

            return {
                bookingId: newBookingRef.id,
                secretCode: secretCode
            };
        });
    }).then(function(res) {
        saveBookingToLocalStorage(res.bookingId, res.secretCode);
        closeModal();
        updateActiveBookingBanner();
        openTicketView(res.bookingId);
    }).catch(function(err) {
        console.error(err);
        if (err && err.message === "CLINIC_NOT_FOUND") {
            alert(t("err_clinic_not_found"));
        } else if (err && err.message === "CLINIC_CLOSED") {
            alert(t("err_clinic_closed_now"));
        } else if (err && err.message === "QUOTA_FULL") {
            alert(t("err_daily_quota_full"));
        } else {
            alert(t("err_booking_failed"));
        }
    });
}

function getSavedBookingsFromLocalStorage() {
    try {
        var raw = localStorage.getItem("douri_my_bookings");
        var parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function saveBookingToLocalStorage(bookingId, secretCode) {
    var list = getSavedBookingsFromLocalStorage();
    var exists = list.some(function(item) {
        return item && item.id === bookingId;
    });
    if (!exists) {
        list.unshift({
            id: bookingId,
            secretCode: secretCode || "",
            savedAt: Date.now()
        });
        localStorage.setItem("douri_my_bookings", JSON.stringify(list));
    }
}

function removeBookingFromLocalStorage(bookingId) {
    var list = getSavedBookingsFromLocalStorage().filter(function(item) {
        return item && item.id !== bookingId;
    });
    localStorage.setItem("douri_my_bookings", JSON.stringify(list));
}

function updateActiveBookingBanner() {
    var banner = document.getElementById("activeBookingBanner");
    var textEl = document.getElementById("bannerText") || document.getElementById("activeBookingBannerText");
    if (!banner || !textEl) return;

    var saved = getSavedBookingsFromLocalStorage();
    if (!saved.length) {
        banner.classList.add("hidden");
        return;
    }

    var activeCount = 0;
    var promises = saved.map(function(entry) {
        return db.collection("bookings").doc(entry.id).get().then(function(snap) {
            if (!snap.exists) {
                removeBookingFromLocalStorage(entry.id);
                return;
            }
            var data = snap.data();
            if (data && data.status !== "done" && data.status !== "cancelled") {
                activeCount++;
            } else {
                removeBookingFromLocalStorage(entry.id);
            }
        }).catch(function() {});
    });

    Promise.all(promises).then(function() {
        if (activeCount > 0) {
            textEl.innerText = t("active_booking_msg").replace("{n}", String(activeCount));
            banner.classList.remove("hidden");
        } else {
            banner.classList.add("hidden");
        }
    });
}

function showMyBookingsView() {
    var mainView = document.getElementById("main-view") || document.getElementById("searchSection");
    var ticketView = document.getElementById("ticket-view") || document.getElementById("ticketSection");
    var bookingsView = document.getElementById("bookings-view") || document.getElementById("myBookingsSection");

    if (mainView) mainView.classList.add("hidden");
    if (ticketView) ticketView.classList.add("hidden");
    if (bookingsView) bookingsView.classList.remove("hidden");

    renderMyBookingsList();
}

function goBackToSearch() {
    cleanupTicketListeners();
    var mainView = document.getElementById("main-view") || document.getElementById("searchSection");
    var ticketView = document.getElementById("ticket-view") || document.getElementById("ticketSection");
    var bookingsView = document.getElementById("bookings-view") || document.getElementById("myBookingsSection");

    if (ticketView) ticketView.classList.add("hidden");
    if (bookingsView) bookingsView.classList.add("hidden");
    if (mainView) mainView.classList.remove("hidden");

    updateActiveBookingBanner();
    loadDoctors();
}

function openMyBookingsView() {
    showMyBookingsView();
}

function backToSearchView() {
    goBackToSearch();
}

function renderMyBookingsList() {
    var container = document.getElementById("myBookingsList");
    if (!container) return;

    var saved = getSavedBookingsFromLocalStorage();
    if (!saved.length) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + t("no_bookings") + '</p>';
        return;
    }

    container.innerHTML = "";
    var renderedAny = false;

    saved.forEach(function(entry) {
        db.collection("bookings").doc(entry.id).get().then(function(snap) {
            if (!snap.exists) {
                removeBookingFromLocalStorage(entry.id);
                return;
            }
            var b = snap.data();
            if (!b || b.status === "done" || b.status === "cancelled") {
                removeBookingFromLocalStorage(entry.id);
                return;
            }

            renderedAny = true;
            var docName = (getCurrentLang() === "en" && b.doctorNameEn) ? b.doctorNameEn : (b.doctorName || t("default_doctor_name"));
            var clinicName = (getCurrentLang() === "en" && b.clinicNameEn) ? b.clinicNameEn : (b.clinicName || "");

            var card = document.createElement("div");
            card.className = "clinic-card";
            card.style.marginBottom = "10px";
            card.innerHTML =
                '<div>' +
                    '<div class="clinic-header">' +
                        '<h3>' + docName + (clinicName ? (' - ' + clinicName) : '') + '</h3>' +
                        '<span class="badge badge-open">#' + (b.ticketNumber || "-") + '</span>' +
                    '</div>' +
                    '<p class="clinic-meta">' + t("patient_name_label") + ': ' + (b.patientName || "") + '</p>' +
                    '<p class="clinic-meta">' + t("appointment_date") + ' ' + (b.date || "") + '</p>' +
                '</div>' +
                '<div class="clinic-actions">' +
                    '<button type="button" class="btn-primary" onclick="openTicketView(\'' + snap.id + '\')">' + t("view_ticket") + '</button>' +
                '</div>';
            container.appendChild(card);
        }).catch(function(err) {
            console.error(err);
        });
    });

    setTimeout(function() {
        if (!renderedAny && container.children.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text-muted);">' + t("no_bookings") + '</p>';
        }
    }, 600);
}

function restoreBookingByCode() {
    var code = prompt(t("secret_prompt"));
    if (!code) return;
    var trimmed = code.trim();
    if (!trimmed) return;

    db.collection("bookings")
        .where("secretCode", "==", trimmed)
        .limit(1)
        .get()
        .then(function(snap) {
            if (snap.empty) {
                alert(t("invalid_booking"));
                return;
            }
            var docSnap = snap.docs[0];
            var data = docSnap.data();
            if (!data || data.status === "done" || data.status === "cancelled") {
                alert(t("invalid_booking"));
                return;
            }
            saveBookingToLocalStorage(docSnap.id, data.secretCode || trimmed);
            updateActiveBookingBanner();
            openTicketView(docSnap.id);
        })
        .catch(function(err) {
            console.error(err);
            alert(t("err_fetch_db"));
        });
}

function restoreBookingBySecret() {
    restoreBookingByCode();
}

function cleanupTicketListeners() {
    if (unsubscribeTicketBooking) {
        unsubscribeTicketBooking();
        unsubscribeTicketBooking = null;
    }
    if (unsubscribeTicketQueue) {
        unsubscribeTicketQueue();
        unsubscribeTicketQueue = null;
    }
    if (unsubscribeTicketDoctor) {
        unsubscribeTicketDoctor();
        unsubscribeTicketDoctor = null;
    }
    if (ticketCountdownInterval) {
        clearInterval(ticketCountdownInterval);
        ticketCountdownInterval = null;
    }
    if (ticketFlashTimeout) {
        clearTimeout(ticketFlashTimeout);
        ticketFlashTimeout = null;
    }
    var flashEl = document.getElementById("ticketFlashOverlay");
    if (flashEl) {
        flashEl.style.display = "none";
    }
}

function playTicketAlertSound() {
    try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!ticketAlertSoundCtx) {
            ticketAlertSoundCtx = new AudioCtx();
        }
        if (ticketAlertSoundCtx.state === "suspended") {
            ticketAlertSoundCtx.resume();
        }
        var now = ticketAlertSoundCtx.currentTime;
        var notes = [659.25, 880.0, 1174.66, 1318.5];
        for (var i = 0; i < notes.length; i++) {
            var osc = ticketAlertSoundCtx.createOscillator();
            var gain = ticketAlertSoundCtx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(notes[i], now + i * 0.14);
            gain.gain.setValueAtTime(0.001, now + i * 0.14);
            gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.14 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.13);
            osc.connect(gain);
            gain.connect(ticketAlertSoundCtx.destination);
            osc.start(now + i * 0.14);
            osc.stop(now + i * 0.14 + 0.14);
        }
    } catch (e) {}
}

function triggerDeviceVibration() {
    try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            navigator.vibrate([600, 200, 600, 200, 800]);
        }
    } catch (e) {}
}

function triggerScreenFlash() {
    try {
        var flashEl = document.getElementById("ticketFlashOverlay");
        if (!flashEl) {
            flashEl = document.createElement("div");
            flashEl.id = "ticketFlashOverlay";
            flashEl.style.position = "fixed";
            flashEl.style.inset = "0";
            flashEl.style.zIndex = "99999";
            flashEl.style.pointerEvents = "none";
            flashEl.style.background = "rgba(239, 68, 68, 0.42)";
            flashEl.style.transition = "opacity 0.2s ease";
            document.body.appendChild(flashEl);
        }

        if (ticketFlashTimeout) {
            clearTimeout(ticketFlashTimeout);
        }

        var pulses = 0;
        flashEl.style.display = "block";
        flashEl.style.opacity = "1";

        var pulseTimer = setInterval(function() {
            pulses++;
            flashEl.style.opacity = (pulses % 2 === 0) ? "0.95" : "0.15";
            if (pulses >= 8) {
                clearInterval(pulseTimer);
                flashEl.style.display = "none";
            }
        }, 220);

        ticketFlashTimeout = setTimeout(function() {
            clearInterval(pulseTimer);
            flashEl.style.display = "none";
        }, 2200);
    } catch (e) {}
}

function triggerSystemNotification(message) {
    try {
        if ("Notification" in window) {
            if (Notification.permission === "granted") {
                var n = new Notification(t("ticket_title"), {
                    body: message,
                    vibrate: [600, 200, 600, 200, 800],
                    requireInteraction: true,
                    tag: "douri-ticket-alert"
                });
                n.onclick = function() {
                    window.focus();
                    n.close();
                };
            } else if (Notification.permission === "default") {
                Notification.requestPermission().then(function(perm) {
                    if (perm === "granted") {
                        new Notification(t("ticket_title"), {
                            body: message,
                            vibrate: [600, 200, 600, 200, 800],
                            requireInteraction: true,
                            tag: "douri-ticket-alert"
                        });
                    }
                }).catch(function() {});
            }
        }
    } catch (e) {}
}

function showTicketAlertBanner(message) {
    var box = document.getElementById("ticketAlertBox") || document.getElementById("ticketAlertBanner");
    if (box) {
        box.innerText = message;
        box.classList.remove("hidden");
    }
    playTicketAlertSound();
    triggerDeviceVibration();
    triggerScreenFlash();
    triggerSystemNotification(message);
}

function openTicketView(bookingId) {
    cleanupTicketListeners();
    currentTicketBookingId = bookingId;
    requestNotificationPermissionIfNeeded();

    var mainView = document.getElementById("main-view") || document.getElementById("searchSection");
    var bookingsView = document.getElementById("bookings-view") || document.getElementById("myBookingsSection");
    var ticketView = document.getElementById("ticket-view") || document.getElementById("ticketSection");

    if (mainView) mainView.classList.add("hidden");
    if (bookingsView) bookingsView.classList.add("hidden");
    if (ticketView) ticketView.classList.remove("hidden");

    var alertBox = document.getElementById("ticketAlertBox") || document.getElementById("ticketAlertBanner");
    if (alertBox) {
        alertBox.classList.add("hidden");
        alertBox.innerText = "";
    }

    unsubscribeTicketBooking = db.collection("bookings").doc(bookingId).onSnapshot(function(docSnap) {
        if (!docSnap.exists) {
            goBackToSearch();
            return;
        }
        var b = docSnap.data();
        b.id = docSnap.id;

        renderTicketBaseDetails(b);

        if (b.status === "done" || b.status === "cancelled") {
            removeBookingFromLocalStorage(docSnap.id);
            var inactiveNotice = document.getElementById("inactiveTicketNotice");
            var cancelBtn = document.getElementById("cancelTicketBtn") || document.getElementById("cancelBookingBtn");
            if (inactiveNotice) inactiveNotice.classList.remove("hidden");
            if (cancelBtn) cancelBtn.disabled = true;
        } else {
            var inactiveNotice2 = document.getElementById("inactiveTicketNotice");
            var cancelBtn2 = document.getElementById("cancelTicketBtn") || document.getElementById("cancelBookingBtn");
            if (inactiveNotice2) inactiveNotice2.classList.add("hidden");
            if (cancelBtn2) cancelBtn2.disabled = false;
        }

        attachTicketQueueAndDoctorListeners(b);
    }, function(err) {
        console.error(err);
    });
}

function renderTicketBaseDetails(b) {
    var docNameEl = document.getElementById("doctorNameDisplay") || document.getElementById("ticketDoctorName");
    var numEl = document.getElementById("ticketNumber") || document.getElementById("ticketNumberDisplay");
    var patientEl = document.getElementById("patientNameDisplay") || document.getElementById("ticketPatientName");
    var dateEl = document.getElementById("appointmentDateDisplay") || document.getElementById("ticketDateDisplay");
    var refEl = document.getElementById("bookingReference") || document.getElementById("ticketBookingRef");
    var secretEl = document.getElementById("bookingSecret") || document.getElementById("ticketSecretDisplay");
    var credsBox = document.getElementById("bookingCredentials");

    var docName = (getCurrentLang() === "en" && b.doctorNameEn) ? b.doctorNameEn : (b.doctorName || t("default_doctor_name"));
    var clinicName = (getCurrentLang() === "en" && b.clinicNameEn) ? b.clinicNameEn : (b.clinicName || "");

    if (docNameEl) docNameEl.innerText = docName + (clinicName ? (" - " + clinicName) : "");
    if (numEl) numEl.innerText = "#" + (b.ticketNumber || "-");
    if (patientEl) patientEl.innerText = b.patientName || "";
    if (dateEl) dateEl.innerText = t("appointment_date") + " " + (b.date || "");
    if (refEl) refEl.innerText = b.id || "";
    if (secretEl) secretEl.innerText = b.secretCode || "-";
    if (credsBox) credsBox.classList.remove("hidden");
}

function attachTicketQueueAndDoctorListeners(booking) {
    if (unsubscribeTicketQueue) {
        unsubscribeTicketQueue();
        unsubscribeTicketQueue = null;
    }
    if (unsubscribeTicketDoctor) {
        unsubscribeTicketDoctor();
        unsubscribeTicketDoctor = null;
    }

    var latestQueueDocs = [];
    var latestClinicObj = null;
    var clinicIdx = parseInt(booking.clinicIndex, 10) || 0;

    var recomputeTicketMetrics = function() {
        var myTicketNum = parseInt(booking.ticketNumber, 10) || 1;
        var serviceTime = parseInt(booking.serviceTime, 10) || (latestClinicObj && parseInt(latestClinicObj.serviceTime, 10)) || 10;
        var startTimeStr = (latestClinicObj && latestClinicObj.startTime) || booking.startTime || "09:00";

        var peopleAhead = 0;
        latestQueueDocs.forEach(function(item) {
            if (item.id === booking.id) return;
            if (item.status === "done" || item.status === "cancelled") return;
            var otherNum = parseInt(item.ticketNumber, 10) || 0;
            if (otherNum < myTicketNum) {
                peopleAhead++;
            }
        });

        var waitMins = peopleAhead * serviceTime;
        var aheadEl = document.getElementById("peopleAhead") || document.getElementById("ticketPeopleAhead");
        var waitEl = document.getElementById("waitTime") || document.getElementById("ticketWaitTime");
        var etaEl = document.getElementById("etaTime") || document.getElementById("ticketEtaTime");
        var statusBadge = document.getElementById("ticketStatus") || document.getElementById("ticketStatusBadge");

        if (aheadEl) aheadEl.innerText = String(peopleAhead);
        if (waitEl) waitEl.innerText = String(waitMins);

        var startMin = parseMinutesFromHHMM(startTimeStr);
        var etaMinutesTotal = (startMin !== null ? startMin : 540) + waitMins;
        var etaH = String(Math.floor((etaMinutesTotal % 1440) / 60)).padStart(2, "0");
        var etaM = String(etaMinutesTotal % 60).padStart(2, "0");
        if (etaEl) etaEl.innerText = etaH + ":" + etaM;

        var isYourTurnNow = (booking.status === "serving" || peopleAhead === 0);

        if (statusBadge) {
            if (booking.status === "done") {
                statusBadge.className = "badge badge-closed";
                statusBadge.innerText = t("booking_done");
            } else if (isYourTurnNow) {
                statusBadge.className = "badge badge-open";
                statusBadge.innerText = t("status_your_turn");
            } else if (peopleAhead === 1) {
                statusBadge.className = "badge badge-break";
                statusBadge.innerText = t("status_one_left");
            } else {
                statusBadge.className = "badge badge-break";
                statusBadge.innerText = t("status_waiting");
            }
        }

        if (booking.status !== "done" && booking.status !== "cancelled") {
            var alertKey = booking.id + "_" + booking.date;
            if (isYourTurnNow && lastAlertedKey !== alertKey + "_turn") {
                lastAlertedKey = alertKey + "_turn";
                showTicketAlertBanner(t("alert_your_turn"));
            }
        }

        startTicketCountdownUpdater(booking, peopleAhead, serviceTime, startTimeStr);
    };

    unsubscribeTicketQueue = db.collection("bookings")
        .where("doctorId", "==", booking.doctorId)
        .where("clinicIndex", "==", clinicIdx)
        .where("date", "==", booking.date)
        .onSnapshot(function(snap) {
            var arr = [];
            snap.forEach(function(d) {
                var obj = d.data();
                obj.id = d.id;
                arr.push(obj);
            });
            latestQueueDocs = arr;
            recomputeTicketMetrics();
        });

    if (booking.doctorId) {
        unsubscribeTicketDoctor = db.collection("doctors").doc(booking.doctorId).onSnapshot(function(docSnap) {
            if (docSnap.exists) {
                var dData = docSnap.data();
                if (dData && Array.isArray(dData.clinics)) {
                    latestClinicObj = dData.clinics[clinicIdx] || null;
                }
            }
            recomputeTicketMetrics();
        });
    }

    recomputeTicketMetrics();
}

function startTicketCountdownUpdater(booking, peopleAhead, serviceTime, startTimeStr) {
    if (ticketCountdownInterval) {
        clearInterval(ticketCountdownInterval);
        ticketCountdownInterval = null;
    }

    var countdownEl = document.getElementById("appointmentCountdown") || document.getElementById("ticketCountdown");
    if (!countdownEl) return;

    var safeAhead = Math.max(0, parseInt(peopleAhead, 10) || 0);
    var safeService = Math.max(1, parseInt(serviceTime, 10) || 10);
    var queueDurationSecs = safeAhead * safeService * 60;
    var countdownAnchorKey = "douri_cd_anchor_" + booking.id + "_" + safeAhead + "_" + safeService;

    var storedAnchor = null;
    try {
        storedAnchor = localStorage.getItem(countdownAnchorKey);
    } catch (e) {}

    var anchorEndMs = null;
    if (storedAnchor) {
        anchorEndMs = parseInt(storedAnchor, 10);
    }
    if (!anchorEndMs || isNaN(anchorEndMs) || anchorEndMs <= Date.now()) {
        anchorEndMs = Date.now() + queueDurationSecs * 1000;
        try {
            localStorage.setItem(countdownAnchorKey, String(anchorEndMs));
        } catch (e) {}
    }

    var updateFn = function() {
        if (!booking || booking.status === "done" || booking.status === "cancelled") {
            countdownEl.innerText = "--:--:--";
            return;
        }

        if (booking.status === "serving" || safeAhead === 0) {
            countdownEl.innerText = "00:00:00";
            return;
        }

        var diffMs = anchorEndMs - Date.now();
        if (diffMs < 0) diffMs = 0;

        var totalSecs = Math.floor(diffMs / 1000);
        var hrs = String(Math.floor(totalSecs / 3600)).padStart(2, "0");
        var mins = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, "0");
        var secs = String(totalSecs % 60).padStart(2, "0");
        countdownEl.innerText = hrs + ":" + mins + ":" + secs;

        var alertKey = booking.id + "_" + booking.date;
        if (totalSecs === 45 * 60 && lastAlertedKey !== alertKey + "_45m") {
            lastAlertedKey = alertKey + "_45m";
            showTicketAlertBanner(t("alert_45_mins"));
        }
    };

    updateFn();
    ticketCountdownInterval = setInterval(updateFn, 1000);
}

function refreshCurrentTicketViewLanguage() {
    if (currentTicketBookingId) {
        openTicketView(currentTicketBookingId);
    }
}

function refreshTicketCountdownDisplay() {
    if (currentTicketBookingId) {
        openTicketView(currentTicketBookingId);
    }
}

function copyPatientCredentials() {
    var secretEl = document.getElementById("bookingSecret") || document.getElementById("ticketSecretDisplay");
    var code = secretEl ? secretEl.innerText.trim() : "";
    if (!code || code === "-") return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function() {
            alert(t("copy_success"));
        }).catch(function() {
            fallbackCopyText(code, t("copy_success"));
        });
    } else {
        fallbackCopyText(code, t("copy_success"));
    }
}

function fallbackCopyText(text, successMsg) {
    var ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand("copy");
        alert(successMsg);
    } catch (e) {}
    document.body.removeChild(ta);
}

function buildShareTicketText() {
    var clinicFull = (document.getElementById("doctorNameDisplay") || document.getElementById("ticketDoctorName") || {}).innerText || "";
    var patientClean = (document.getElementById("patientNameDisplay") || document.getElementById("ticketPatientName") || {}).innerText || "";
    var dateLine = (document.getElementById("appointmentDateDisplay") || document.getElementById("ticketDateDisplay") || {}).innerText || "";
    var ticketNum = ((document.getElementById("ticketNumber") || document.getElementById("ticketNumberDisplay") || {}).innerText || "").replace("#", "");
    var secret = (document.getElementById("bookingSecret") || document.getElementById("ticketSecretDisplay") || {}).innerText || "";
    var dateClean = dateLine.replace(/^[^:]+:\s*/, "");

    return t("share_whatsapp_template")
        .replace("{patient}", patientClean)
        .replace("{clinic}", clinicFull)
        .replace("{date}", dateClean)
        .replace("{ticket}", ticketNum)
        .replace("{secret}", secret);
}

function shareTicketViaWhatsApp() {
    var text = buildShareTicketText();
    var url = "https://wa.me/?text=" + encodeURIComponent(text);
    window.open(url, "_blank", "noopener,noreferrer");
}

function shareTicketDetails() {
    var text = buildShareTicketText();
    if (navigator.share) {
        navigator.share({
            title: t("ticket_title"),
            text: text
        }).catch(function() {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            alert(t("share_copied_msg"));
        });
    } else {
        fallbackCopyText(text, t("share_copied_msg"));
    }
}

function cancelCurrentTicket() {
    if (!currentTicketBookingId) return;
    if (!confirm(t("confirm_cancel_booking"))) return;

    var bookingId = currentTicketBookingId;
    db.collection("bookings").doc(bookingId).update({ status: "cancelled" }).then(function() {
        removeBookingFromLocalStorage(bookingId);
        alert(t("booking_cancelled"));
        goBackToSearch();
    }).catch(function(err) {
        console.error(err);
        alert(t("err_cancel_booking"));
    });
}

function openDoctorModal(defaultTab) {
    var modal = document.getElementById("doctorModal") || document.getElementById("authModal");
    if (!modal) return;
    modal.classList.remove("hidden");
    switchAuthTab(defaultTab || "login");
}

function closeDoctorModal() {
    var modal = document.getElementById("doctorModal") || document.getElementById("authModal");
    if (modal) modal.classList.add("hidden");
}

function switchAuthTab(tab) {
    var loginTab = document.getElementById("tabLogin") || document.getElementById("tabLoginBtn");
    var regTab = document.getElementById("tabRegister") || document.getElementById("tabRegisterBtn");
    var loginForm = document.getElementById("loginSection") || document.getElementById("loginFormBox");
    var regForm = document.getElementById("registerSection") || document.getElementById("registerFormBox");

    if (tab === "register") {
        if (loginTab) loginTab.classList.remove("active");
        if (regTab) regTab.classList.add("active");
        if (loginForm) loginForm.classList.add("hidden");
        if (regForm) regForm.classList.remove("hidden");
        initRegMapIfNeeded();
    } else {
        if (regTab) regTab.classList.remove("active");
        if (loginTab) loginTab.classList.add("active");
        if (regForm) regForm.classList.add("hidden");
        if (loginForm) loginForm.classList.remove("hidden");
    }
}

function loginDoctor() {
    var email = ((document.getElementById("loginEmail") || {}).value || "").trim();
    var password = ((document.getElementById("loginPassword") || {}).value || "").trim();

    if (!email || !password) {
        alert(t("err_enter_email_pass"));
        return;
    }

    auth.signInWithEmailAndPassword(email, password).then(function(cred) {
        var uid = cred.user.uid;
        return db.collection("doctors").doc(uid).get().then(function(docSnap) {
            if (!docSnap.exists || (docSnap.data() && docSnap.data().isDeleted === true)) {
                var reactivate = confirm(t("confirm_reactivate_account"));
                if (!reactivate) {
                    return auth.signOut();
                }
                return db.collection("doctors").doc(uid).set({
                    ownerUid: uid,
                    email: email,
                    clinics: [],
                    isDeleted: false
                }, { merge: true }).then(function() {
                    window.location.href = "admin.html";
                });
            }
            window.location.href = "admin.html";
        });
    }).catch(function(err) {
        console.error(err);
        alert(t("err_login_failed"));
    });
}

function setRegMapLocation(lat, lng, zoom) {
    var latNum = parseFloat(lat);
    var lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return;

    var latInp = document.getElementById("docLat") || document.getElementById("regLat");
    var lngInp = document.getElementById("docLng") || document.getElementById("regLng");
    if (latInp) latInp.value = latNum.toFixed(6);
    if (lngInp) lngInp.value = lngNum.toFixed(6);

    initRegMapIfNeeded();
    if (regMap) {
        regMap.setView([latNum, lngNum], zoom || 15);
        if (regMarker) {
            regMarker.setLatLng([latNum, lngNum]);
        } else {
            regMarker = L.marker([latNum, lngNum]).addTo(regMap);
        }
        setTimeout(function() { if (regMap) regMap.invalidateSize(); }, 150);
    }
}

function useCurrentLocationForClinic() {
    if (!navigator.geolocation) {
        alert(t("err_geo_unsupported"));
        return;
    }
    navigator.geolocation.getCurrentPosition(function(pos) {
        setRegMapLocation(pos.coords.latitude, pos.coords.longitude, 16);
    }, function() {
        alert(t("err_geo_short"));
    }, { enableHighAccuracy: true, timeout: 10000 });
}

function attachRegMapLocationControl(mapInstance) {
    if (!mapInstance || typeof L === "undefined" || regLocationControlAdded) return;
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
    var el = document.getElementById("reg-map");
    if (!el || typeof L === "undefined") return;
    if (!regMap) {
        regMap = L.map("reg-map").setView([15.3694, 44.1910], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap"
        }).addTo(regMap);
        attachRegMapLocationControl(regMap);
        regMap.on("click", function(e) {
            setRegMapLocation(e.latlng.lat, e.latlng.lng, regMap.getZoom());
        });
    }
    setTimeout(function() { if (regMap) regMap.invalidateSize(); }, 200);
}

function addAnotherClinicField() {
    var container = document.getElementById("extraClinicsContainer");
    if (!container) return;
    extraClinicCounter++;
    var idx = extraClinicCounter;

    var box = document.createElement("div");
    box.className = "clinic-card";
    box.style.marginTop = "12px";
    box.setAttribute("data-extra-clinic", "1");
    box.innerHTML =
        '<div class="clinic-header">' +
            '<h3>' + t("clinic_prefix") + (idx + 1) + '</h3>' +
            '<button type="button" class="btn-danger" onclick="this.closest(\'[data-extra-clinic]\').remove()">' + t("close_btn") + '</button>' +
        '</div>' +
        '<label>' + t("clinic_name_label") + '</label>' +
        '<input type="text" class="extra-clinic-name" placeholder="' + t("clinic_name_placeholder") + '">' +
        '<label>' + t("city_label") + '</label>' +
        '<input type="text" class="extra-clinic-city" placeholder="' + t("city_field_placeholder") + '">' +
        '<label>' + t("street_label") + '</label>' +
        '<input type="text" class="extra-clinic-street" placeholder="' + t("street_placeholder") + '">' +
        '<label>' + t("landmark_label") + '</label>' +
        '<input type="text" class="extra-clinic-landmark" placeholder="' + t("landmark_placeholder") + '">' +
        '<label>' + t("start_time_label") + '</label>' +
        '<input type="time" class="extra-clinic-start" value="09:00">' +
        '<label>' + t("end_time_label") + '</label>' +
        '<input type="time" class="extra-clinic-end" value="17:00">' +
        '<label>' + t("service_time_label") + '</label>' +
        '<input type="number" class="extra-clinic-service" value="10" min="1">';
    container.appendChild(box);
}

function registerAndSaveDoctor() {
    var email = ((document.getElementById("regEmail") || {}).value || "").trim();
    var password = ((document.getElementById("regPassword") || {}).value || "").trim();
    var activationCode = ((document.getElementById("regActivationCode") || {}).value || "").trim();
    var name = ((document.getElementById("docName") || document.getElementById("regDoctorName") || {}).value || "").trim();
    var specialty = ((document.getElementById("docSpecialty") || document.getElementById("regSpecialty") || {}).value || "").trim();
    var phone = ((document.getElementById("docPhone") || document.getElementById("regPhone") || {}).value || "").trim();
    var clinicName = ((document.getElementById("docClinicName") || document.getElementById("regClinicName") || {}).value || "").trim();
    var city = ((document.getElementById("docCity") || document.getElementById("regCity") || {}).value || "").trim();
    var street = ((document.getElementById("docStreet") || document.getElementById("regStreet") || {}).value || "").trim();
    var landmark = ((document.getElementById("docLandmark") || document.getElementById("regLandmark") || {}).value || "").trim();
    var startTime = ((document.getElementById("docStartTime") || document.getElementById("regStartTime") || {}).value || "09:00");
    var endTime = ((document.getElementById("docEndTime") || document.getElementById("regEndTime") || {}).value || "17:00");
    var serviceTime = parseInt(((document.getElementById("docServiceTime") || document.getElementById("regServiceTime") || {}).value || "10"), 10) || 10;
    var latVal = parseFloat(((document.getElementById("docLat") || document.getElementById("regLat") || {}).value || ""));
    var lngVal = parseFloat(((document.getElementById("docLng") || document.getElementById("regLng") || {}).value || ""));

    if (!email || !password || !name || !clinicName) {
        alert(t("err_reg_required_fields"));
        return;
    }

    if (!activationCode) {
        alert(t("err_enter_activation_code"));
        return;
    }

    var workingDays = [];
    for (var d = 0; d <= 6; d++) {
        var cb = document.getElementById("day_" + d) || document.getElementById("reg_day_" + d);
        if (cb && cb.checked) workingDays.push(d);
    }

    var clinicsList = [{
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
    }];

    var extraBoxes = document.querySelectorAll('[data-extra-clinic="1"]');
    for (var i = 0; i < extraBoxes.length; i++) {
        var box = extraBoxes[i];
        var exName = ((box.querySelector(".extra-clinic-name") || {}).value || "").trim();
        if (!exName) continue;
        clinicsList.push({
            clinicName: exName,
            city: ((box.querySelector(".extra-clinic-city") || {}).value || "").trim(),
            street: ((box.querySelector(".extra-clinic-street") || {}).value || "").trim(),
            landmark: ((box.querySelector(".extra-clinic-landmark") || {}).value || "").trim(),
            startTime: ((box.querySelector(".extra-clinic-start") || {}).value || "09:00"),
            endTime: ((box.querySelector(".extra-clinic-end") || {}).value || "17:00"),
            serviceTime: parseInt(((box.querySelector(".extra-clinic-service") || {}).value || "10"), 10) || 10,
            workingDays: workingDays.slice(),
            lat: null,
            lng: null,
            serialNumber: 0,
            dailyCounters: {},
            isClosed: false,
            isOnBreak: false
        });
    }

    db.collection("activationCodes").where("code", "==", activationCode).limit(1).get().then(function(codeSnap) {
        if (codeSnap.empty) {
            alert(t("err_invalid_activation_code"));
            return;
        }

        auth.createUserWithEmailAndPassword(email, password).then(function(cred) {
            var uid = cred.user.uid;
            return db.collection("doctors").doc(uid).set({
                ownerUid: uid,
                email: email,
                name: name,
                specialty: specialty,
                phone: phone,
                clinics: clinicsList,
                isDeleted: false
            }).then(function() {
                window.location.href = "admin.html";
            });
        }).catch(function(err) {
            if (err && err.code === "auth/email-already-in-use") {
                auth.signInWithEmailAndPassword(email, password).then(function(cred) {
                    var uid = cred.user.uid;
                    return db.collection("doctors").doc(uid).get().then(function(docSnap) {
                        if (docSnap.exists && docSnap.data() && docSnap.data().isDeleted !== true) {
                            alert(t("err_email_active_doctor"));
                            return auth.signOut();
                        }
                        return db.collection("doctors").doc(uid).set({
                            ownerUid: uid,
                            email: email,
                            name: name,
                            specialty: specialty,
                            phone: phone,
                            clinics: clinicsList,
                            isDeleted: false
                        }, { merge: true }).then(function() {
                            window.location.href = "admin.html";
                        });
                    });
                }).catch(function() {
                    alert(t("err_wrong_password_existing"));
                });
            } else {
                console.error(err);
                alert(t("err_create_account_failed"));
            }
        });
    }).catch(function(err) {
        console.error(err);
        alert(t("err_create_account_failed"));
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

window.onload = function() {
    applySavedTheme();
    if (typeof applyLanguage === "function") {
        applyLanguage();
    }
    updateNearestButtonLabel();
    updateActiveBookingBanner();
    loadDoctors();
};
